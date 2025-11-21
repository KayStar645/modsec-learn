from typing import Any, Dict, Iterable

from flask import Blueprint, jsonify, render_template, request

from demo_app.engine import DetectionEngine


def register_routes(app, engine: DetectionEngine) -> None:
    """
    Đăng ký các route cần thiết cho ứng dụng demo.
    """
    blueprint = Blueprint("demo", __name__)

    @blueprint.get("/")
    def index():
        return render_template("index.html")

    @blueprint.get("/api/config")
    def api_config():
        config = engine.available_config()
        return jsonify(config)

    @blueprint.post("/api/analyze")
    def api_analyze():
        if not request.is_json:
            return jsonify({"error": "Yêu cầu JSON không hợp lệ."}), 400

        payload = request.json.get("payload", "")
        paranoia_level = request.json.get("paranoia_level")
        model_key = request.json.get("model_key")
        model_keys = request.json.get("model_keys")
        record = request.json.get("record", True)

        if not payload.strip():
            return jsonify({"error": "Vui lòng cung cấp payload hợp lệ."}), 400

        if model_keys is not None and not isinstance(model_keys, list):
            return jsonify({"error": "Tham số model_keys phải là danh sách."}), 400

        try:
            result = engine.analyze_payload(
                payload=payload,
                paranoia_level=paranoia_level,
                model_key=model_key,
                model_keys=model_keys,
                record=record,
            )
            return jsonify(result)
        except Exception as exc:  # pragma: no cover - xử lý thời gian chạy
            return jsonify({"error": str(exc)}), 500

    @blueprint.post("/api/run_batch")
    def api_run_batch():
        payloads: Iterable[Dict[str, Any]]
        if request.is_json:
            paranoia_level = request.json.get("paranoia_level")
            try:
                paranoia_level = int(paranoia_level) if paranoia_level is not None else None
            except (TypeError, ValueError):
                paranoia_level = None
            model_key = request.json.get("model_key")
            model_keys = request.json.get("model_keys")
            if model_keys is not None and not isinstance(model_keys, list):
                return jsonify({"error": "Tham số model_keys phải là danh sách."}), 400
            dataset = request.json.get("dataset", "default")
            limit = request.json.get("limit")
            try:
                limit = int(limit) if limit is not None else None
            except (TypeError, ValueError):
                limit = None

            if isinstance(dataset, str):
                payloads = engine.batch_payloads(dataset=dataset, limit=limit)
                source = f"{dataset}_dataset"
            else:
                payloads = dataset if isinstance(dataset, list) else []
                source = "custom_dataset"
        else:
            paranoia_level = model_key = None
            model_keys = None
            payloads = engine.batch_payloads()
            source = "default_dataset"

        if not payloads:
            return jsonify({"error": "Không có payload để chạy batch."}), 400

        try:
            result = engine.run_batch(
                payloads=payloads,
                paranoia_level=paranoia_level,
                model_key=model_key,
                model_keys=model_keys,
                record=True,
                source=source,
            )
            return jsonify(result)
        except Exception as exc:  # pragma: no cover
            return jsonify({"error": str(exc)}), 500

    @blueprint.get("/api/logs")
    def api_logs():
        try:
            limit = request.args.get("limit", default=50, type=int)
            page = request.args.get("page", default=1, type=int)
            logs = engine.log_entries(page=page, page_size=limit)
            return jsonify(logs)
        except Exception as exc:  # pragma: no cover
            return jsonify({"error": str(exc)}), 500

    @blueprint.get("/api/stats")
    def api_stats():
        try:
            limit = request.args.get("limit", default=None, type=int)
            stats = engine.model_statistics(max_entries=limit)
            return jsonify(stats)
        except Exception as exc:  # pragma: no cover
            return jsonify({"error": str(exc)}), 500

    app.register_blueprint(blueprint)

