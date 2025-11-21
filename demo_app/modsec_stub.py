"""
Stub mô phỏng hành vi ModSecurity dùng cho chế độ demo khi thư viện gốc chưa sẵn sàng.
"""

import re
from typing import Iterable, List

import numpy as np


class PyModSecurityStub:
    """
    Phiên bản giả lập tối giản của PyModSecurity để trình diễn UI mà không cần cài đặt ModSecurity.
    """

    _RULE_KEYWORDS = {
        "942100": [r"select\s", r"union\s", r"insert\s", r"update\s"],
        "942110": [r"or\s+1=1", r"or\s+true", r"and\s+sleep"],
        "942120": [r"information_schema", r"pg_catalog"],
        "942130": [r"benchmark\(", r"sleep\("],
        "942200": [r"--", r"#", r"/\*"],
    }

    def __init__(
        self,
        rules_dir: str,
        threshold: float = 5.0,
        pl: int = 1,
        output_type: str = "score",
        debug: bool = False,
    ) -> None:
        self._threshold = threshold
        self._pl = pl
        self._output_type = output_type
        self._debug = debug
        self._last_score = 0.0
        self._last_rules: List[str] = []

    # ------------------------------------------------------------------ #
    # API tương thích với bản chính
    # ------------------------------------------------------------------ #
    def _process_query(self, payload: str) -> None:
        payload_lower = payload.lower()
        matched_rules: List[str] = []
        score = 0.0

        for rule_id, patterns in self._RULE_KEYWORDS.items():
            for pattern in patterns:
                if re.search(pattern, payload_lower):
                    matched_rules.append(rule_id)
                    score += 2.5  # gán điểm giả định
                    break

        # tăng độ nhạy ở PL cao
        score *= 1 + (self._pl - 1) * 0.25

        self._last_rules = matched_rules
        self._last_score = score

        if self._debug:
            print(f"[STUB] payload='{payload}' -> rules={matched_rules}, score={score}")

    def _process_response(self) -> float:
        if self._output_type == "binary":
            return 1.0 if self._last_score >= self._threshold else 0.0
        return self._last_score

    def _get_triggered_rules(self) -> List[str]:
        return self._last_rules

    def _get_triggered_rules_details(self):
        return [
            {
                "id": rule_id,
                "message": "",
                "data": "",
                "phase": None,
                "severity": None,
                "severity_label": "STUB",
            }
            for rule_id in self._last_rules
        ]

    # ------------------------------------------------------------------ #
    # Các phương thức phụ trợ
    # ------------------------------------------------------------------ #
    def predict(self, X: Iterable[str]) -> np.ndarray:
        results = []
        for payload in X:
            self._process_query(payload)
            results.append(self._process_response())
        return np.array(results, dtype=np.float32)

