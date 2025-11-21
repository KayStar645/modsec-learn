import json
from collections import deque
from pathlib import Path
from typing import Deque, Dict, Iterable, List, Optional


class AnalysisLogger:
    """
    Ghi log kết quả phân tích dạng JSON Lines để dễ dàng đọc lại khi khởi động ứng dụng.
    """

    def __init__(self, log_path: str, max_disk_size_mb: int = 20) -> None:
        self._path = Path(log_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._max_disk_size = max_disk_size_mb * 1024 * 1024

        if not self._path.exists():
            self._path.touch()

    # ------------------------------------------------------------------ #
    # Ghi log
    # ------------------------------------------------------------------ #
    def append(self, entry: Dict) -> None:
        serialized = json.dumps(entry, ensure_ascii=False)
        with self._path.open("a", encoding="utf-8") as file:
            file.write(serialized)
            file.write("\n")

        self._enforce_disk_quota()

    def append_many(self, entries: Iterable[Dict]) -> None:
        with self._path.open("a", encoding="utf-8") as file:
            for entry in entries:
                serialized = json.dumps(entry, ensure_ascii=False)
                file.write(serialized)
                file.write("\n")
        self._enforce_disk_quota()

    # ------------------------------------------------------------------ #
    # Đọc log
    # ------------------------------------------------------------------ #
    def tail(self, limit: int = 200) -> List[Dict]:
        if limit <= 0:
            return []

        buffer: Deque[str] = deque(maxlen=limit)
        with self._path.open("r", encoding="utf-8") as file:
            for line in file:
                if line.strip():
                    buffer.append(line.strip())

        entries: List[Dict] = []
        for raw in buffer:
            try:
                entries.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
        return entries

    def count(self) -> int:
        total = 0
        with self._path.open("r", encoding="utf-8") as file:
            for _ in file:
                total += 1
        return total

    def read_all(self, max_entries: Optional[int] = None) -> List[Dict]:
        """
        Đọc toàn bộ log (hoặc tối đa max_entries) và trả về danh sách Dict.
        """
        entries: List[Dict] = []
        with self._path.open("r", encoding="utf-8") as file:
            for line in file:
                if not line.strip():
                    continue
                if max_entries is not None and len(entries) >= max_entries:
                    break
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return entries

    def paginate(self, page: int, page_size: int) -> Dict[str, List[Dict]]:
        """
        Đọc log dạng phân trang (mới nhất trước).
        """
        if page < 1:
            page = 1
        if page_size <= 0:
            page_size = 20

        entries = self.read_all()
        total = len(entries)
        entries = list(reversed(entries))

        start = (page - 1) * page_size
        end = start + page_size

        if start >= total:
            sliced = []
        else:
            sliced = entries[start:end]

        return {"entries": sliced, "total": total}

    # ------------------------------------------------------------------ #
    # Tiện ích
    # ------------------------------------------------------------------ #
    def exists(self) -> bool:
        return self._path.exists()

    def path(self) -> Path:
        return self._path

    def _enforce_disk_quota(self) -> None:
        """
        Nếu log vượt quá quota, giữ lại phần cuối.
        """
        try:
            if self._path.stat().st_size <= self._max_disk_size:
                return
        except FileNotFoundError:
            return

        # Giữ lại 75% dòng cuối để tránh mất toàn bộ lịch sử
        target_lines = int(self.count() * 0.75)
        retained = self.tail(target_lines)

        with self._path.open("w", encoding="utf-8") as file:
            for entry in retained:
                file.write(json.dumps(entry, ensure_ascii=False))
                file.write("\n")

