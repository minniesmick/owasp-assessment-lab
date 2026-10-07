"""The scope self-check must pass on the real rules and fail when a rule is weakened."""
from scoped_proxy import selftest
from scoped_proxy.selftest import run_selftest


def test_selftest_passes_on_real_rules():
    result = run_selftest()
    assert result["ok"], [c for c in result["checks"] if not c["ok"]]
    assert result["total"] >= 30 and result["passed"] == result["total"]
    assert {c["group"] for c in result["checks"]} == {"Socket gate", "Repeater path", "Bind address"}
    assert len(result["layers"]) == 5


def test_selftest_fails_when_the_socket_gate_is_weakened(monkeypatch):
    monkeypatch.setattr(selftest, "is_target_address", lambda host, port: True)
    result = run_selftest()
    assert not result["ok"]
    assert all(c["group"] == "Socket gate" for c in result["checks"] if not c["ok"])


def test_selftest_fails_when_the_path_rules_are_weakened(monkeypatch):
    monkeypatch.setattr(selftest, "repeater_url", lambda path: type("U", (), {"host": "127.0.0.1"})())
    result = run_selftest()
    assert not result["ok"]
    assert any(c["group"] == "Repeater path" and not c["ok"] for c in result["checks"])
