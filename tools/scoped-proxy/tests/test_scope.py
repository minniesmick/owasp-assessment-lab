"""Unit tests for the scope rules (no network needed)."""
import pytest

from scoped_proxy import scope
from scoped_proxy.scope import ScopeError, is_target_address, repeater_url


@pytest.mark.parametrize("host,port", [("127.0.0.1", 3000)])
def test_target_accepted(host, port):
    assert is_target_address(host, port)


@pytest.mark.parametrize("host,port", [
    ("127.0.0.1", 3001), ("127.0.0.1", 9999), ("127.0.0.1", 80), ("127.0.0.1", None),
    ("localhost", 3000),            # hostnames are never trusted at socket level
    ("127.0.0.2", 3000), ("0.0.0.0", 3000), ("::1", 3000), ("10.0.0.1", 3000),
    ("example.com", 3000), ("", 3000), (None, 3000),
])
def test_everything_else_rejected(host, port):
    assert not is_target_address(host, port)


@pytest.mark.parametrize("path", ["/", "/rest/admin/application-version", "/rest/products/search?q=apple",
                                  "/api/Users/1", "/%2F%2Fencoded-stays-a-path"])
def test_repeater_accepts_paths(path):
    url = repeater_url(path)
    assert (url.scheme, url.host, url.port) == ("http", "127.0.0.1", 3000)


@pytest.mark.parametrize("path", [
    "http://127.0.0.1:9999/", "https://example.com/", "//127.0.0.1:9999/", "///x",
    "@127.0.0.1:9999/", "127.0.0.1:9999/", "/\\127.0.0.1:9999/", "/ x", "/x\r\nHost: evil",
    "/x\tfoo", "", "x", "/ü",
])
def test_repeater_rejects_escapes(path):
    with pytest.raises(ScopeError):
        repeater_url(path)


def test_bind_must_be_loopback():
    scope.assert_loopback_bind("127.0.0.1")
    for host in ("0.0.0.0", "::", "localhost", "192.168.1.10"):
        with pytest.raises(SystemExit):
            scope.assert_loopback_bind(host)


def test_ports_cannot_take_target_port(monkeypatch):
    from scoped_proxy.settings import load_settings
    monkeypatch.setenv("SCOPED_PROXY_PORT", "3000")
    with pytest.raises(SystemExit):
        load_settings()


# ------------------------------------------------------------------ layer 3: socket gate, tested directly
from types import SimpleNamespace

from scoped_proxy.addon import ScopeGuard
from scoped_proxy.settings import Settings
from scoped_proxy.store import History


def _gate(address):
    guard = ScopeGuard(Settings(bind_host="127.0.0.1", proxy_port=18080, dashboard_port=18765), History(10))
    data = SimpleNamespace(server=SimpleNamespace(address=address, error=None))
    guard.server_connect(data)
    return data.server.error, guard.history.blocked_count


def test_socket_gate_allows_only_target():
    assert _gate(("127.0.0.1", 3000)) == (None, 0)


@pytest.mark.parametrize("address", [("127.0.0.1", 9999), ("localhost", 3000), ("93.184.216.34", 80),
                                     ("::1", 3000), None])
def test_socket_gate_blocks_everything_else(address):
    error, blocked = _gate(address)
    assert error and "blocked by scope gate" in error and blocked == 1
