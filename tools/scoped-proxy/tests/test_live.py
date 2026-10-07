"""Integration tests: start the real tool, try to escape the scope, and prove nothing leaves it.

A "canary" TCP server listens on a free local port that is OUT of scope. Every escape attempt targets it.
If the tool ever opens a connection to it, the canary records a hit and the test fails.
Requires OWASP Juice Shop on http://127.0.0.1:3000 (`docker compose up -d`); skipped otherwise.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parent.parent
PROXY_PORT, DASH_PORT = 18080, 18765
PROXY, DASH = f"http://127.0.0.1:{PROXY_PORT}", f"http://127.0.0.1:{DASH_PORT}"
ORIGIN = {"Origin": DASH, "Content-Type": "application/json"}


def _juice_shop_up() -> bool:
    try:
        return httpx.get("http://127.0.0.1:3000/rest/admin/application-version", timeout=3).status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = pytest.mark.skipif(not _juice_shop_up(), reason="Juice Shop is not running on 127.0.0.1:3000")


class Canary:
    def __init__(self) -> None:
        self.hits: list[bytes] = []
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen()
        self.port = self.sock.getsockname()[1]
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self) -> None:
        while True:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            conn.settimeout(1)
            try:
                self.hits.append(conn.recv(200))
                conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\nLEAKED")
            except OSError:
                pass
            conn.close()


@pytest.fixture(scope="module")
def canary():
    c = Canary()
    yield c
    c.sock.close()


@pytest.fixture(scope="module")
def tool():
    env = {**os.environ, "SCOPED_PROXY_PORT": str(PROXY_PORT), "SCOPED_DASHBOARD_PORT": str(DASH_PORT)}
    proc = subprocess.Popen([sys.executable, "-m", "scoped_proxy"], cwd=ROOT, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    for _ in range(100):
        try:
            if httpx.get(f"{DASH}/api/state", timeout=1).status_code == 200 and \
               httpx.get(f"{PROXY}/rest/admin/application-version", timeout=2).status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.2)
    else:
        proc.kill()
        pytest.fail("tool did not start: " + proc.stdout.read().decode(errors="replace"))
    yield proc
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def raw(port: int, payload: bytes) -> bytes:
    """Send raw bytes to the proxy and return the response (lets us craft requests no browser would send)."""
    with socket.create_connection(("127.0.0.1", port), timeout=5) as s:
        s.sendall(payload)
        chunks = []
        try:
            while chunk := s.recv(4096):
                chunks.append(chunk)
        except socket.timeout:
            pass
    return b"".join(chunks)


# ------------------------------------------------------------------ the proxy works for the real target

def test_juice_shop_reachable_through_proxy(tool):
    r = httpx.get(f"{PROXY}/rest/admin/application-version", timeout=5)
    assert r.status_code == 200 and "version" in r.json()


# ------------------------------------------------------------------ escape attempts through the proxy

def test_absolute_form_is_pinned_to_target(tool, canary):
    resp = raw(PROXY_PORT, f"GET http://127.0.0.1:{canary.port}/ HTTP/1.1\r\nHost: 127.0.0.1:{canary.port}\r\n"
                           f"Connection: close\r\n\r\n".encode())
    assert b"LEAKED" not in resp


def test_spoofed_host_header_is_ignored(tool, canary):
    resp = raw(PROXY_PORT, f"GET http://127.0.0.1:{canary.port}/ HTTP/1.1\r\nHost: 127.0.0.1:3000\r\n"
                           f"Connection: close\r\n\r\n".encode())
    assert b"LEAKED" not in resp
    resp = raw(PROXY_PORT, f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{canary.port}\r\nConnection: close\r\n\r\n".encode())
    assert b"LEAKED" not in resp


def test_connect_tunnel_refused(tool, canary):
    resp = raw(PROXY_PORT, f"CONNECT 127.0.0.1:{canary.port} HTTP/1.1\r\nHost: 127.0.0.1:{canary.port}\r\n\r\n".encode())
    assert not resp.startswith(b"HTTP/1.1 200"), resp[:80]


def test_forward_proxy_use_refused(tool, canary):
    with httpx.Client(proxy=PROXY, timeout=5, trust_env=False) as client:
        try:
            r = client.get(f"http://127.0.0.1:{canary.port}/")
            assert "LEAKED" not in r.text
        except httpx.HTTPError:
            pass
        with pytest.raises(httpx.HTTPError):
            client.get(f"https://127.0.0.1:{canary.port}/")


# ------------------------------------------------------------------ repeater

@pytest.mark.parametrize("path", ["http://127.0.0.1:{p}/", "//127.0.0.1:{p}/", "@127.0.0.1:{p}/",
                                  "/\\127.0.0.1:{p}/", "127.0.0.1:{p}"])
def test_repeater_escapes_blocked(tool, canary, path):
    r = httpx.post(f"{DASH}/api/repeater", headers=ORIGIN, timeout=10,
                   content=json.dumps({"method": "GET", "path": path.format(p=canary.port)}))
    assert r.json()["ok"] is False and r.json()["status_code"] == 403


def test_repeater_host_header_cannot_redirect(tool, canary):
    r = httpx.post(f"{DASH}/api/repeater", headers=ORIGIN, timeout=10, content=json.dumps(
        {"method": "GET", "path": "/rest/admin/application-version", "headers": {"Host": f"127.0.0.1:{canary.port}"}}))
    assert r.json()["ok"] is True and "LEAKED" not in r.json()["body"]


# ------------------------------------------------------------------ dashboard hardening

def test_dashboard_rejects_foreign_host(tool):
    assert httpx.get(f"{DASH}/api/history", headers={"Host": "evil.example"}, timeout=5).status_code == 421


@pytest.mark.parametrize("headers,code", [
    ({"Content-Type": "application/json"}, 403),                                  # no Origin
    ({"Origin": "http://evil.example", "Content-Type": "application/json"}, 403),  # foreign Origin
    ({"Origin": DASH, "Content-Type": "text/plain"}, 415),                         # simple (no-preflight) request
])
def test_dashboard_csrf_protection(tool, headers, code):
    r = httpx.post(f"{DASH}/api/intercept/toggle", headers=headers, content='{"enabled": true}', timeout=5)
    assert r.status_code == code


def test_dashboard_security_headers(tool):
    h = httpx.get(f"{DASH}/", timeout=5).headers
    assert "frame-ancestors 'none'" in h["content-security-policy"]
    assert h["x-frame-options"] == "DENY" and h["x-content-type-options"] == "nosniff"


# ------------------------------------------------------------------ interceptor (pause, edit, forward, drop)

def _toggle(enabled: bool):
    httpx.post(f"{DASH}/api/intercept/toggle", headers=ORIGIN, content=json.dumps({"enabled": enabled}), timeout=5)


def _wait_paused():
    for _ in range(50):
        paused = httpx.get(f"{DASH}/api/intercept", timeout=5).json()
        if paused:
            return paused[0]
        time.sleep(0.1)
    pytest.fail("request was not paused")


def test_interceptor_forward_and_drop(tool):
    _toggle(True)
    try:
        result = {}
        t = threading.Thread(target=lambda: result.update(r=httpx.get(f"{PROXY}/rest/admin/application-version", timeout=15)))
        t.start()
        rec = _wait_paused()
        r = httpx.post(f"{DASH}/api/intercept/{rec['id']}/forward", headers=ORIGIN, timeout=5,
                       content=json.dumps({"headers": {"Accept": "application/json", "X-Lab": "edited"}, "body": ""}))
        assert r.json() == {"forwarded": True}
        t.join(10)
        assert result["r"].status_code == 200  # resumed on the event loop, did not hang

        t2 = threading.Thread(target=lambda: result.update(e=_get_or_error(f"{PROXY}/rest/admin/application-version")))
        t2.start()
        rec = _wait_paused()
        assert httpx.post(f"{DASH}/api/intercept/{rec['id']}/drop", headers=ORIGIN, content="{}", timeout=5).json() == {"dropped": True}
        t2.join(10)
        assert result["e"] != 200
    finally:
        _toggle(False)


def _get_or_error(url):
    try:
        return httpx.get(url, timeout=10).status_code
    except httpx.HTTPError as exc:
        return type(exc).__name__


# ------------------------------------------------------------------ final verdict

def test_canary_never_contacted(tool, canary):
    # Runs last (file order): no escape attempt above may have reached the out-of-scope server.
    time.sleep(0.5)
    assert canary.hits == [], f"scope leak: canary received {canary.hits!r}"


# ------------------------------------------------------------------ scope self-check endpoint

def test_scope_selftest_endpoint(tool):
    r = httpx.post(f"{DASH}/api/scope-selftest", headers=ORIGIN, content="{}", timeout=10)
    body = r.json()
    assert r.status_code == 200 and body["ok"] is True and body["passed"] == body["total"]
    # same CSRF rules as every other POST
    assert httpx.post(f"{DASH}/api/scope-selftest", headers={"Content-Type": "application/json"}, content="{}", timeout=10).status_code == 403
