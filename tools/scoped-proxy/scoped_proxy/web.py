"""Dashboard: HTTP history, interceptor and repeater.

Hardening (the dashboard holds captured tokens, so it must not be reachable from other websites):
- binds to 127.0.0.1 only;
- rejects any Host header other than 127.0.0.1:<port> / localhost:<port> (DNS-rebinding protection);
- state-changing requests need a same-origin Origin header and a JSON content type (CSRF protection);
- strict Content-Security-Policy, no framing, no referrer, no MIME sniffing;
- no CORS: other origins can neither read responses nor send JSON requests.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .addon import HOP_BY_HOP, ScopeGuard
from .scope import TARGET_BASE, ScopeError, check_url, repeater_url
from .settings import Settings
from .store import History, Record, clip

UI_DIR = Path(__file__).resolve().parent.parent / "ui"
METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                               "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
}


class ToggleBody(BaseModel):
    enabled: bool


class ForwardBody(BaseModel):
    headers: dict[str, str] = Field(default_factory=dict)
    body: str = ""


class RepeatBody(BaseModel):
    method: str = "GET"
    path: str
    headers: dict[str, str] = Field(default_factory=dict)
    body: str = ""


async def _pin_request(request: httpx.Request) -> None:
    # Last check right before bytes leave the client: also catches anything httpx might rewrite.
    check_url(request.url)


def create_app(settings: Settings, history: History, guard: ScopeGuard) -> FastAPI:
    app = FastAPI(title="Scoped Proxy", docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def harden(request: Request, call_next):
        if request.headers.get("host", "").lower() not in settings.dashboard_hosts:
            return PlainTextResponse("Misdirected request: unexpected Host header", status_code=421)
        if request.method not in {"GET", "HEAD"}:
            if request.headers.get("origin") not in settings.dashboard_origins:
                return PlainTextResponse("Forbidden: cross-origin request", status_code=403)
            if not request.headers.get("content-type", "").startswith("application/json"):
                return PlainTextResponse("Unsupported media type", status_code=415)
            if int(request.headers.get("content-length") or 0) > settings.max_api_body_bytes:
                return PlainTextResponse("Request too large", status_code=413)
        response = await call_next(request)
        response.headers.update(SECURITY_HEADERS)
        return response

    app.mount("/static", StaticFiles(directory=UI_DIR / "static"), name="static")

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(UI_DIR / "index.html")

    @app.get("/api/state")
    async def state() -> dict[str, Any]:
        return {
            "intercept_enabled": guard.intercept_enabled,
            "paused_count": len(guard.paused),
            "blocked_count": history.blocked_count,
            "proxy": f"http://{settings.bind_host}:{settings.proxy_port}",
            "target": TARGET_BASE,
        }

    @app.get("/api/history")
    async def all_history() -> list[dict[str, Any]]:
        return [r.to_dict() for r in history.all()]

    @app.get("/api/intercept")
    async def paused() -> list[dict[str, Any]]:
        return [r.to_dict() for rid in guard.paused if (r := history.get(rid))]

    @app.post("/api/intercept/toggle")
    async def toggle(body: ToggleBody) -> dict[str, bool]:
        guard.intercept_enabled = body.enabled
        if not body.enabled:  # release everything that is waiting, nothing stays stuck
            for rid in list(guard.paused):
                guard.forward(rid, None, None)
        return {"enabled": guard.intercept_enabled}

    @app.post("/api/intercept/{record_id}/forward")
    async def forward(record_id: str, body: ForwardBody) -> dict[str, bool]:
        if not guard.forward(record_id, body.headers, body.body):
            raise HTTPException(404, "Paused request no longer exists")
        return {"forwarded": True}

    @app.post("/api/intercept/{record_id}/drop")
    async def drop(record_id: str) -> dict[str, bool]:
        if not guard.drop(record_id):
            raise HTTPException(404, "Paused request no longer exists")
        return {"dropped": True}

    @app.post("/api/repeater")
    async def repeater(body: RepeatBody) -> JSONResponse:
        method = body.method.upper().strip()
        if method not in METHODS:
            raise HTTPException(400, "Unsupported HTTP method")
        try:
            url = repeater_url(body.path)
        except ScopeError as exc:
            history.add(Record(method=method, url=str(body.path)[:300], source="repeater", state="blocked", error=str(exc)))
            return JSONResponse({"ok": False, "status_code": 403, "error": f"403 Forbidden - Out of Scope: {exc}"})

        headers = {k: v for k, v in body.headers.items() if k.lower() not in HOP_BY_HOP | {"host"}}
        record = history.add(Record(method=method, url=str(url), source="repeater", request_headers=headers,
                                    request_body=clip(body.body, settings.max_body_bytes)))
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=False, trust_env=False,
                                         event_hooks={"request": [_pin_request]}) as client:
                resp = await client.request(method, url, headers=headers, content=body.body.encode("utf-8"))
        except (httpx.HTTPError, ScopeError) as exc:
            record.state, record.error = "error", str(exc)
            return JSONResponse({"ok": False, "status_code": 502, "error": str(exc)})

        record.status_code = resp.status_code
        record.response_headers = dict(resp.headers)
        record.response_body = clip(resp.text, settings.max_body_bytes)
        record.duration_ms = int((time.perf_counter() - started) * 1000)
        record.state = "forwarded"
        return JSONResponse({"ok": True, "status_code": resp.status_code, "url": str(url),
                             "headers": dict(resp.headers), "body": record.response_body})

    return app
