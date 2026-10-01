"""Unit tests for the in-memory history (no network needed)."""
from scoped_proxy.store import History, Record


def test_clear_keeps_paused_and_blocked_counter():
    h = History(10)
    paused = h.add(Record(method="GET", url="http://127.0.0.1:3000/a", state="paused"))
    h.add(Record(method="GET", url="http://127.0.0.1:3000/b"))
    h.add(Record(method="CONNECT", url="tcp://evil.example:443", state="blocked"))
    assert h.clear({paused.id}) == 2
    assert [r.id for r in h.all()] == [paused.id]
    assert h.blocked_count == 1  # blocked attempts are never under-reported


def test_clear_empty_and_still_usable():
    h = History(2)
    assert h.clear(set()) == 0
    h.add(Record(method="GET", url="http://127.0.0.1:3000/a"))
    assert h.clear(set()) == 1 and h.all() == []
    h.add(Record(method="GET", url="http://127.0.0.1:3000/b"))
    assert len(h.all()) == 1
