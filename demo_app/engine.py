import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from uuid import uuid4

import joblib
import numpy as np
import toml

from demo_app.logger import AnalysisLogger

try:  # pragma: no cover - phụ thuộc môi trường
    from src.models import PyModSecurity  # type: ignore

    _MODSECURITY_BACKEND = "native"
except Exception:  # pragma: no cover - fallback demo
    from demo_app.modsec_stub import PyModSecurityStub as PyModSecurity  # type: ignore

    _MODSECURITY_BACKEND = "stub"


class DetectionEngine:
    """
    Lớp điều phối ModSecurity và mô hình học máy cho bản demo web.
    """

    _MODEL_NAME_MAPPING = {
        "log_reg_l1": "Logistic Regression (L1)",
        "log_reg_l2": "Logistic Regression (L2)",
        "svc_l1": "Linear SVC (L1)",
        "svc_l2": "Linear SVC (L2)",
        "rf": "Random Forest",
    }

    _MODEL_FILE_PATTERNS = {
        "log_reg_l1": "log_reg_pl{pl}_l1.joblib",
        "log_reg_l2": "log_reg_pl{pl}_l2.joblib",
        "svc_l1": "linear_svc_pl{pl}_l1.joblib",
        "svc_l2": "linear_svc_pl{pl}_l2.joblib",
        "rf": "rf_pl{pl}.joblib",
    }

    _MODEL_PRIORITY = ["log_reg_l1", "log_reg_l2", "svc_l1", "svc_l2", "rf"]

    def __init__(
        self,
        settings_path: str = "config.toml",
        log_path: str = "demo_app/logs/analysis.log",
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> None:
        if not os.path.exists(settings_path):
            raise FileNotFoundError(f"Không tìm thấy tệp cấu hình: {settings_path}")

        self._settings = toml.load(settings_path)
        self._crs_ids = self._load_crs_ids(Path(self._settings["crs_ids_path"]))
        self._rule_index = {rule_id: idx for idx, rule_id in enumerate(self._crs_ids)}
        self._paranoia_levels = self._settings["params"]["paranoia_levels"]
        self._models_root = Path(self._settings["models_path"])
        self._crs_rules_dir = self._settings["crs_dir"]

        self._modsec_instances: Dict[int, PyModSecurity] = {}
        self._loaded_models: Dict[int, Dict[str, Any]] = {}
        self._modsec_backend = _MODSECURITY_BACKEND
        self._logger = AnalysisLogger(log_path)
        self._datasets: Dict[str, Path] = self._prepare_datasets(dataset_paths)

        self._initialise_modsecurity()
        self._initialise_models()

    # --------------------------------------------------------------------- #
    # Khởi tạo
    # --------------------------------------------------------------------- #

    def _load_crs_ids(self, path: Path) -> List[str]:
        if not path.exists():
            raise FileNotFoundError(
                "Không tìm thấy danh sách CRS IDs tại {}".format(path.as_posix())
            )
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
        rules = data.get("rules_ids", [])
        if not rules:
            raise ValueError("Danh sách rules_ids trống hoặc không hợp lệ.")
        return rules

    def _initialise_modsecurity(self) -> None:
        for pl in self._paranoia_levels:
            self._modsec_instances[pl] = PyModSecurity(
                rules_dir=self._crs_rules_dir,
                threshold=5.0,
                pl=pl,
                output_type="score",
            )

    def _initialise_models(self) -> None:
        for pl in self._paranoia_levels:
            self._loaded_models[pl] = {}
            for key, pattern in self._MODEL_FILE_PATTERNS.items():
                model_path = self._models_root / pattern.format(pl=pl)
                if model_path.exists():
                    self._loaded_models[pl][key] = joblib.load(model_path)

    # --------------------------------------------------------------------- #
    # API public
    # --------------------------------------------------------------------- #

    def available_config(self) -> Dict[str, Any]:
        """
        Trả về thông tin cấu hình để client hiển thị.
        """
        response: Dict[str, Any] = {
            "paranoia_levels": self._paranoia_levels,
            "models": {},
            "modsecurity_backend": self._modsec_backend,
            "log_path": self._logger.path().as_posix(),
            "datasets": self._available_datasets(),
        }

        for pl, models in self._loaded_models.items():
            response["models"][pl] = [
                {
                    "key": key,
                    "label": self._MODEL_NAME_MAPPING.get(key, key),
                }
                for key in models.keys()
            ]

        return response

    def analyze_payload(
        self,
        payload: str,
        paranoia_level: Optional[int] = None,
        model_key: Optional[str] = None,
        model_keys: Optional[List[str]] = None,
        record: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Đánh giá payload bằng ModSecurity và (nếu có) mô hình học máy.
        """
        if paranoia_level is None:
            paranoia_level = self._paranoia_levels[0]

        if paranoia_level not in self._modsec_instances:
            raise ValueError(f"Paranoia level {paranoia_level} không được hỗ trợ.")

        modsec = self._modsec_instances[paranoia_level]

        # Chạy ModSecurity
        modsec._process_query(payload)
        triggered_rules = modsec._get_triggered_rules()
        triggered_rules_details = modsec._get_triggered_rules_details()
        waf_score = float(modsec._process_response())

        waf_threshold = getattr(modsec, "_threshold", 5.0)
        waf_decision = "block" if waf_score >= waf_threshold else "allow"

        # Chuẩn bị dữ liệu cho mô hình ML
        ml_payloads = self._prepare_ml_payloads(
            paranoia_level=paranoia_level,
            primary_model_key=model_key,
            requested_model_keys=model_keys,
            triggered_rules=triggered_rules,
        )
        primary_ml = ml_payloads[0] if ml_payloads else None

        timestamp = datetime.utcnow().isoformat() + "Z"
        analysis_id = uuid4().hex

        result: Dict[str, Any] = {
            "analysis_id": analysis_id,
            "timestamp": timestamp,
            "payload": payload,
            "paranoia_level": paranoia_level,
            "modsecurity": {
                "backend": self._modsec_backend,
                "decision": waf_decision,
                "score": waf_score,
                "threshold": float(waf_threshold),
                "triggered_rules": triggered_rules,
                "triggered_rules_details": triggered_rules_details,
            },
            "ml": primary_ml,
            "ml_results": ml_payloads,
            "steps": self._build_steps(
                payload,
                waf_decision,
                waf_score,
                waf_threshold,
                triggered_rules,
                ml_payloads,
            ),
            "metadata": metadata or {},
        }

        if record:
            self._logger.append(self._make_log_entry(result))

        return result

    def run_batch(
        self,
        payloads: Iterable[Dict[str, Any]],
        paranoia_level: Optional[int] = None,
        model_key: Optional[str] = None,
        model_keys: Optional[List[str]] = None,
        record: bool = True,
        source: str = "custom",
    ) -> Dict[str, Any]:
        """
        Chạy nhiều payload liên tiếp và ghi log hàng loạt.
        """
        batch_id = uuid4().hex
        timestamp = datetime.utcnow().isoformat() + "Z"
        results: List[Dict[str, Any]] = []

        for index, item in enumerate(payloads):
            payload = item.get("payload", "")
            if not payload:
                continue

            metadata = {
                "batch_id": batch_id,
                "batch_index": index,
                "source": source,
                "name": item.get("name"),
                "category": item.get("category"),
                "description": item.get("description"),
            }

            result = self.analyze_payload(
                payload=payload,
                paranoia_level=paranoia_level,
                model_key=model_key,
                model_keys=model_keys,
                record=False,  # xử lý log riêng để gộp batch
                metadata=metadata,
            )
            results.append(result)

        if record and results:
            self._logger.append_many(self._make_log_entry(res) for res in results)

        summary = self._summarise_batch(results)
        summary.update({"batch_id": batch_id, "timestamp": timestamp, "source": source, "size": len(results)})

        return {"summary": summary, "results": results}

    def batch_payloads(
        self, dataset: str = "default", limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Đọc danh sách payload mẫu theo dataset.
        """
        path = self._datasets.get(dataset)
        if path is None or not path.exists():
            return []

        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if limit is not None:
            return data[:limit]
        return data

    def log_entries(self, page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        data = self._logger.paginate(page=page, page_size=page_size)
        total = data["total"]
        entries = data["entries"]
        total_pages = max(1, (total + page_size - 1) // page_size) if total else 1

        return {
            "entries": entries,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        }

    def model_statistics(self, max_entries: Optional[int] = None) -> Dict[str, Any]:
        limit = max_entries or self._logger.count()
        entries = self._logger.tail(limit)
        stats: Dict[str, Dict[str, Any]] = {}

        for entry in entries:
            ml_results = entry.get("ml_results") or []
            if not ml_results and entry.get("ml"):
                ml_results = [entry["ml"]]

            modsec_decision = entry.get("modsecurity", {}).get("decision")

            for ml in ml_results:
                key = ml.get("model_key") or "unknown"
                record = stats.setdefault(
                    key,
                    {
                        "model_key": key,
                        "model_name": ml.get("model_name", key),
                        "total": 0,
                        "predict_attack": 0,
                        "agree_with_modsecurity": 0,
                        "modsecurity_block": 0,
                        "modsecurity_allow": 0,
                    },
                )

                record["total"] += 1
                prediction = ml.get("prediction")
                if prediction == 1:
                    record["predict_attack"] += 1

                if modsec_decision == "block":
                    record["modsecurity_block"] += 1
                    if prediction == 1:
                        record["agree_with_modsecurity"] += 1
                elif modsec_decision == "allow":
                    record["modsecurity_allow"] += 1

        return {"models": list(stats.values()), "total_entries": len(entries)}

    # --------------------------------------------------------------------- #
    # Tiện ích nội bộ
    # --------------------------------------------------------------------- #

    def _prepare_ml_payload(
        self,
        paranoia_level: int,
        model_key: Optional[str],
        triggered_rules: List[str],
    ) -> Optional[Dict[str, Any]]:
        available_models = self._loaded_models.get(paranoia_level, {})
        if not available_models:
            return None

        model_key = self._select_model_key(model_key, available_models)
        model = available_models[model_key]
        feature_vector = self._rules_to_vector(triggered_rules)

        prediction, extra = self._run_model(model, feature_vector)

        return {
            "model_key": model_key,
            "model_name": self._MODEL_NAME_MAPPING.get(model_key, model_key),
            "prediction": int(prediction),
            **extra,
        }

    def _prepare_ml_payloads(
        self,
        paranoia_level: int,
        primary_model_key: Optional[str],
        requested_model_keys: Optional[List[str]],
        triggered_rules: List[str],
    ) -> List[Dict[str, Any]]:
        available_models = self._loaded_models.get(paranoia_level, {})
        if not available_models:
            return []

        keys_to_use: List[str] = []

        if requested_model_keys:
            keys_to_use = [key for key in requested_model_keys if key in available_models]

        if not keys_to_use:
            if primary_model_key and primary_model_key in available_models:
                keys_to_use = [primary_model_key]
            else:
                default_key = self._select_model_key(None, available_models)
                keys_to_use = [default_key] if default_key else []

        payloads: List[Dict[str, Any]] = []
        for key in keys_to_use:
            model = available_models[key]
            feature_vector = self._rules_to_vector(triggered_rules)
            prediction, extra = self._run_model(model, feature_vector)
            payloads.append(
                {
                    "model_key": key,
                    "model_name": self._MODEL_NAME_MAPPING.get(key, key),
                    "prediction": int(prediction),
                    **extra,
                }
            )

        return payloads

    def _rules_to_vector(self, rules: List[str]) -> np.ndarray:
        vector = np.zeros(len(self._crs_ids), dtype=np.float32)
        for rule in rules:
            idx = self._rule_index.get(rule)
            if idx is not None:
                vector[idx] = 1.0
        return vector

    def _run_model(
        self,
        model: Any,
        features: np.ndarray,
    ) -> Tuple[int, Dict[str, Any]]:
        features_2d = features.reshape(1, -1)
        prediction = model.predict(features_2d)[0]

        extra: Dict[str, Any] = {}

        if hasattr(model, "predict_proba"):
            try:
                proba = model.predict_proba(features_2d)[0]
                if len(proba) == 2:
                    extra["probability_attack"] = float(proba[1])
                    extra["probability_legit"] = float(proba[0])
                else:
                    extra["probabilities"] = [float(p) for p in proba]
            except Exception:  # pragma: no cover - phòng thủ
                pass

        if "probability_attack" not in extra and hasattr(model, "decision_function"):
            try:
                score = model.decision_function(features_2d)[0]
                extra["decision_score"] = float(score)
            except Exception:  # pragma: no cover - phòng thủ
                pass

        return prediction, extra

    def _select_model_key(
        self, requested_key: Optional[str], available_models: Dict[str, Any]
    ) -> str:
        if requested_key and requested_key in available_models:
            return requested_key

        for key in self._MODEL_PRIORITY:
            if key in available_models:
                return key

        # Nếu không khớp thứ tự ưu tiên, lấy bất kỳ
        return next(iter(available_models.keys()))

    def _build_steps(
        self,
        payload: str,
        waf_decision: str,
        waf_score: float,
        threshold: float,
        triggered_rules: List[str],
        ml_payloads: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        rules_text = ", ".join(triggered_rules[:6]) if triggered_rules else "Không luật nào kích hoạt"
        steps: List[Dict[str, Any]] = [
            {
                "title": "Nhận payload",
                "detail": f"Payload dài {len(payload)} ký tự.",
            },
            {
                "title": f"Đánh giá bằng ModSecurity ({self._modsec_backend})",
                "detail": f"Score = {waf_score:.2f} so với threshold {threshold:.2f}. Rule: {rules_text}",
                "status": "block" if waf_decision == "block" else "allow",
            },
        ]

        if ml_payloads:
            detail_lines = []
            any_block = False
            for ml in ml_payloads:
                if ml.get("prediction") == 1:
                    any_block = True
                line = f"- {ml.get('model_name')}: {'Attack' if ml.get('prediction') == 1 else 'Legit'}"
                if "probability_attack" in ml:
                    line += f" (Attack {ml['probability_attack']*100:.1f}%)"
                elif "decision_score" in ml:
                    line += f" (Score {ml['decision_score']:.3f})"
                detail_lines.append(line)

            steps.append(
                {
                    "title": "Phân tích bằng mô hình học máy",
                    "detail": "\n".join(detail_lines),
                    "status": "block" if any_block else "allow",
                }
            )

        final_detail = "Quyết định tổng hợp: "
        if waf_decision == "block" or any(ml.get("prediction") == 1 for ml in ml_payloads):
            final_detail += "Đánh dấu tấn công."
        else:
            final_detail += "Payload an toàn."

        steps.append(
            {
                "title": "Kết luận",
                "detail": final_detail,
                "status": "block" if "Đánh dấu tấn công" in final_detail else "allow",
            }
        )

        return steps

    def _make_log_entry(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Chỉ giữ lại các trường cần thiết trước khi ghi xuống log.
        """
        return {
            "analysis_id": result["analysis_id"],
            "timestamp": result["timestamp"],
            "payload": result["payload"],
            "payload_preview": result["payload"][:120],
            "paranoia_level": result["paranoia_level"],
            "modsecurity": result["modsecurity"],
            "ml": result["ml"],
            "ml_results": result.get("ml_results", []),
            "steps": result["steps"],
            "metadata": result.get("metadata", {}),
        }

    def _summarise_batch(self, results: List[Dict[str, Any]]) -> Dict[str, int]:
        total = len(results)
        waf_blocks = sum(1 for res in results if res["modsecurity"]["decision"] == "block")
        ml_detect = sum(
            1 for res in results if res.get("ml") and res["ml"].get("prediction") == 1
        )
        both = sum(
            1
            for res in results
            if res["modsecurity"]["decision"] == "block"
            and res.get("ml")
            and res["ml"].get("prediction") == 1
        )
        return {
            "total": total,
            "modsecurity_block": waf_blocks,
            "ml_detect": ml_detect,
            "concordant_block": both,
        }

    def _prepare_datasets(self, dataset_paths: Optional[Dict[str, str]]) -> Dict[str, Path]:
        mapping = {
            "default": Path("demo_app/data/sample_attacks.json"),
            "advanced": Path("demo_app/data/advanced_attacks.json"),
        }
        if dataset_paths:
            for key, value in dataset_paths.items():
                mapping[key] = Path(value)
        return mapping

    def _available_datasets(self) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for key, path in self._datasets.items():
            count = 0
            if path.exists():
                try:
                    with path.open("r", encoding="utf-8") as file:
                        data = json.load(file)
                        count = len(data)
                except Exception:
                    count = 0
            items.append(
                {
                    "key": key,
                    "path": path.as_posix(),
                    "count": count,
                }
            )
        return items

