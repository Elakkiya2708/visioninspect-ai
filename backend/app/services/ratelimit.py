"""Tiny in-memory login throttle (per ip+email). Use Redis for multi-instance deployments."""
import threading
import time
from collections import defaultdict, deque


class LoginLimiter:
    def __init__(self, max_attempts: int = 8, window: int = 900):
        self.max, self.window = max_attempts, window
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key, now):
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def retry_after(self, key: str) -> int:
        """Seconds until another attempt is allowed (0 = allowed)."""
        now = time.time()
        with self._lock:
            q = self._prune(key, now)
            return int(self.window - (now - q[0])) + 1 if len(q) >= self.max else 0

    def fail(self, key: str):
        with self._lock:
            self._prune(key, time.time()).append(time.time())

    def reset(self, key: str):
        with self._lock:
            self._hits.pop(key, None)


login_limiter = LoginLimiter()
