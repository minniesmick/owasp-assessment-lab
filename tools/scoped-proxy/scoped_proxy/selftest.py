"""Scope self-check: runs the scope rules against known escape attempts and reports pass/fail.

Pure functions only: nothing here opens a socket or sends a request. It shows, on demand, that the same rules the
proxy and repeater enforce still reject what they must reject (the pytest suite does the same with a live canary server).
"""
from __future__ import annotations

from typing import Any

from .scope import BIND_HOST, TARGET_BASE, ScopeError, assert_loopback_bind, is_target_address, repeater_url

ADDRESS_ALLOWED = [("127.0.0.1", 3000)]
ADDRESS_REFUSED = [
    ("127.0.0.1", 3001), ("127.0.0.1", 9999), ("127.0.0.1", 80), ("localhost", 3000), ("127.0.0.2", 3000),
    ("0.0.0.0", 3000), ("::1", 3000), ("10.0.0.1", 3000), ("192.168.1.10", 3000), ("example.com", 443),
    ("93.184.216.34", 80), ("", 3000), (None, 3000),
]
PATH_ALLOWED = ["/", "/rest/admin/application-version", "/rest/products/search?q=apple", "/api/Users/1"]
PATH_REFUSED = [
    "http://127.0.0.1:9999/", "https://example.com/", "//127.0.0.1:9999/", "///x", "@127.0.0.1:9999/",
    "127.0.0.1:9999", "/\\127.0.0.1:9999/", "/ x", "/x\r\nHost: evil", "/x\tfoo", "", "x", "/ü",
]
BIND_REFUSED = ["0.0.0.0", "::", "localhost", "192.168.1.10", ""]

LAYERS = [
    {"name": "Construction", "text": f"mitmproxy runs in reverse mode with a fixed upstream ({TARGET_BASE}); a client never chooses a destination."},
    {"name": "Request check", "text": "The connection target (not the spoofable Host header) must be the pinned target; CONNECT tunnels are refused."},
    {"name": "Socket gate", "text": "Right before any TCP connection is opened the address must be exactly 127.0.0.1:3000."},
    {"name": "Repeater", "text": "Only a path is accepted; the URL is rebuilt, re-checked and checked again by an HTTP client hook; redirects are not followed."},
    {"name": "Bind address", "text": f"Proxy and dashboard listen on {BIND_HOST} only; any other bind address is a startup error."},
]


def _check(group: str, name: str, expected: str, ok: bool) -> dict[str, Any]:
    return {"group": group, "name": name, "expected": expected, "ok": ok}


def run_selftest() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    for host, port in ADDRESS_ALLOWED:
        checks.append(_check("Socket gate", f"{host}:{port}", "allowed", is_target_address(host, port)))
    for host, port in ADDRESS_REFUSED:
        checks.append(_check("Socket gate", f"{host!r}:{port}", "refused", not is_target_address(host, port)))

    for path in PATH_ALLOWED:
        try:
            ok = repeater_url(path).host == "127.0.0.1"
        except ScopeError:
            ok = False
        checks.append(_check("Repeater path", path, "allowed", ok))
    for path in PATH_REFUSED:
        try:
            repeater_url(path)
            ok = False
        except ScopeError:
            ok = True
        checks.append(_check("Repeater path", repr(path), "refused", ok))

    for host in BIND_REFUSED:
        try:
            assert_loopback_bind(host)
            ok = False
        except SystemExit:
            ok = True
        checks.append(_check("Bind address", repr(host), "refused", ok))
    checks.append(_check("Bind address", BIND_HOST, "allowed", _bind_ok(BIND_HOST)))

    passed = sum(1 for c in checks if c["ok"])
    return {"passed": passed, "total": len(checks), "ok": passed == len(checks), "checks": checks,
            "layers": LAYERS, "target": TARGET_BASE, "bind": BIND_HOST}


def _bind_ok(host: str) -> bool:
    try:
        assert_loopback_bind(host)
        return True
    except SystemExit:
        return False
