import hashlib
import time
from typing import Any


class TTLCache:
    def __init__(self, max_items: int = 2000):
        self._d: dict[str, tuple[float, Any]] = {}
        self.max_items = max_items

    @staticmethod
    def key(*parts: str) -> str:
        return hashlib.sha256("|".join(parts).encode()).hexdigest()

    def get(self, k: str) -> Any | None:
        v = self._d.get(k)
        if not v:
            return None
        if v[0] < time.monotonic():
            self._d.pop(k, None)
            return None
        return v[1]

    def set(self, k: str, value: Any, ttl: float) -> None:
        if len(self._d) >= self.max_items:
            self._d.pop(next(iter(self._d)))
        self._d[k] = (time.monotonic() + ttl, value)


cache = TTLCache()
