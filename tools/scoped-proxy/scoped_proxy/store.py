"""In-memory, bounded request history. Nothing is written to disk; history is gone when the tool stops."""
from __future__ import annotations

import uuid
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Record:
    method: str
    url: str
    source: str = "proxy"  # proxy | repeater
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created_at: str = field(default_factory=_now)
    request_headers: dict[str, str] = field(default_factory=dict)
    request_body: str = ""
    status_code: int | None = None
    response_headers: dict[str, str] = field(default_factory=dict)
    response_body: str = ""
    duration_ms: int | None = None
    state: str = "captured"  # captured | paused | forwarded | dropped | blocked | error
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class History:
    def __init__(self, limit: int) -> None:
        self._items: deque[Record] = deque(maxlen=limit)
        self.blocked_count = 0  # survives eviction so blocked attempts are never under-reported

    def add(self, record: Record) -> Record:
        self._items.append(record)
        if record.state == "blocked":
            self.blocked_count += 1
        return record

    def get(self, record_id: str) -> Record | None:
        return next((r for r in self._items if r.id == record_id), None)

    def clear(self, keep: set[str]) -> int:
        """Drop captured records except `keep` (paused requests still need theirs). blocked_count is not reset."""
        kept = [r for r in self._items if r.id in keep]
        removed = len(self._items) - len(kept)
        self._items.clear()
        self._items.extend(kept)
        return removed

    def all(self) -> list[Record]:
        return list(reversed(self._items))


def clip(text: str | None, limit: int) -> str:
    text = text or ""
    return text if len(text) <= limit else text[:limit] + f"\n… [truncated, {len(text) - limit} more characters]"
