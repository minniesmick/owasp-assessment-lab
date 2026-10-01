"""mitmproxy addon: records traffic, implements the interceptor, and enforces scope in three layers.

Layer 1 (construction): mitmproxy runs in reverse-proxy mode with a fixed upstream (see app.py),
                        so the client cannot choose a destination.
Layer 2 (request):      every request's connection target (flow.request.host/port, NOT the Host header)
                        must be the pinned target, and CONNECT tunnels are refused.
Layer 3 (socket):       server_connect refuses to open any TCP connection that is not 127.0.0.1:3000.

All hooks and all dashboard handlers run on the same asyncio event loop (see app.py), so pausing and
resuming flows needs no locking and is never done from another thread.
"""
from __future__ import annotations

import time

from mitmproxy import http
from mitmproxy.proxy import server_hooks

from .scope import TARGET_BASE, TARGET_HOST, TARGET_PORT, TARGET_SCHEME, is_target_address
from .settings import Settings
from .store import History, Record, clip

HOP_BY_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection",
              "te", "trailer", "transfer-encoding", "upgrade", "content-length"}


def _blocked_response(reason: str) -> http.Response:
    body = f"403 Forbidden - Out of Scope\n\n{reason}\nThis tool only talks to {TARGET_BASE}\n"
    return http.Response.make(403, body.encode(), {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"})


class ScopeGuard:
    def __init__(self, settings: Settings, history: History) -> None:
        self.settings = settings
        self.history = history
        self.intercept_enabled = False
        self.paused: dict[str, http.HTTPFlow] = {}
        self._started: dict[str, float] = {}

    # ------------------------------------------------------------- layer 2: refuse tunnels / foreign targets

    def http_connect(self, flow: http.HTTPFlow) -> None:
        # Reverse mode never needs CONNECT; a CONNECT means a client is trying to use us as a forward proxy.
        if flow.response is not None:
            return
        self._block(flow, f"CONNECT tunnels are not allowed (requested {flow.request.host}:{flow.request.port})")

    def requestheaders(self, flow: http.HTTPFlow) -> None:
        req = flow.request
        if req.method == "CONNECT":
            self.http_connect(flow)
        elif req.scheme != TARGET_SCHEME or not is_target_address(req.host, req.port):
            # Checked on the real connection target, never on the Host header (which a client can spoof).
            self._block(flow, f"Destination {req.scheme}://{req.host}:{req.port} is outside the local Juice Shop scope")

    # ------------------------------------------------------------- layer 3: socket-level gate

    def server_connect(self, data: server_hooks.ServerConnectionHookData) -> None:
        address = data.server.address
        host, port = (address[0], address[1]) if address else (None, None)
        if not is_target_address(host, port):
            data.server.error = f"blocked by scope gate: {host}:{port}"
            self.history.add(Record(method="CONNECT", url=f"tcp://{host}:{port}", state="blocked",
                                    error="Socket connection refused by scope gate"))

    # ------------------------------------------------------------- recording and interception

    def request(self, flow: http.HTTPFlow) -> None:
        if flow.response is not None:  # already blocked
            return
        record = self.history.add(Record(
            method=flow.request.method,
            url=flow.request.url,
            request_headers=dict(flow.request.headers.items()),
            request_body=clip(flow.request.get_text(strict=False), self.settings.max_body_bytes),
        ))
        flow.metadata["record_id"] = record.id
        self._started[record.id] = time.perf_counter()
        if self.intercept_enabled:
            record.state = "paused"
            self.paused[record.id] = flow
            flow.intercept()

    def response(self, flow: http.HTTPFlow) -> None:
        record = self._record(flow)
        if not record or record.state == "blocked":
            return
        record.status_code = flow.response.status_code
        record.response_headers = dict(flow.response.headers.items())
        record.response_body = clip(flow.response.get_text(strict=False), self.settings.max_body_bytes)
        record.duration_ms = int((time.perf_counter() - self._started.pop(record.id, time.perf_counter())) * 1000)
        record.state = "forwarded"

    def error(self, flow: http.HTTPFlow) -> None:
        record = self._record(flow)
        if record and record.state not in {"dropped", "blocked"}:
            record.state = "error"
            record.error = str(flow.error or "Proxy error")
        if record:
            self.paused.pop(record.id, None)

    def forward(self, record_id: str, headers: dict[str, str] | None, body: str | None) -> bool:
        flow = self.paused.pop(record_id, None)
        record = self.history.get(record_id)
        if not flow or not record:
            return False
        if headers is not None:
            flow.request.headers.clear()
            for key, value in headers.items():
                if key.lower() not in HOP_BY_HOP | {"host"}:
                    flow.request.headers[key] = str(value)
            flow.request.headers["Host"] = f"{TARGET_HOST}:{TARGET_PORT}"  # never user-controlled
        if body is not None:
            flow.request.text = body
        record.request_headers = dict(flow.request.headers.items())
        record.request_body = clip(flow.request.get_text(strict=False), self.settings.max_body_bytes)
        record.state = "captured"
        flow.resume()
        return True

    def drop(self, record_id: str) -> bool:
        flow = self.paused.pop(record_id, None)
        record = self.history.get(record_id)
        if not flow:
            return False
        if record:
            record.state = "dropped"
        flow.kill()
        return True

    # ------------------------------------------------------------- helpers

    def _block(self, flow: http.HTTPFlow, reason: str) -> None:
        flow.response = _blocked_response(reason)
        record = self.history.add(Record(method=flow.request.method, url=flow.request.url, state="blocked",
                                         error=reason, status_code=403))
        flow.metadata["record_id"] = record.id

    def _record(self, flow: http.HTTPFlow) -> Record | None:
        record_id = flow.metadata.get("record_id")
        return self.history.get(record_id) if record_id else None
