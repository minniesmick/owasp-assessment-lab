"""Entry point: runs mitmproxy (reverse mode, fixed upstream) and the dashboard on ONE asyncio event loop."""
from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path

import uvicorn
from mitmproxy.options import Options
from mitmproxy.tools.dump import DumpMaster

from .addon import ScopeGuard
from .scope import TARGET_BASE
from .settings import Settings, load_settings
from .store import History
from .web import create_app

CONF_DIR = Path(__file__).resolve().parent.parent / ".mitmproxy"


def build_master(settings: Settings, guard: ScopeGuard) -> DumpMaster:
    options = Options(
        # Layer 1: reverse mode with a fixed upstream. The client never chooses the destination.
        mode=[f"reverse:{TARGET_BASE}"],
        listen_host=settings.bind_host,
        listen_port=settings.proxy_port,
        confdir=str(CONF_DIR),
    )
    master = DumpMaster(options, with_termlog=False, with_dumper=False)
    master.addons.add(guard)
    return master


async def serve(settings: Settings) -> None:
    history = History(settings.history_limit)
    guard = ScopeGuard(settings, history)
    master = build_master(settings, guard)  # must be created inside the running loop
    app = create_app(settings, history, guard)
    server = uvicorn.Server(uvicorn.Config(app, host=settings.bind_host, port=settings.dashboard_port,
                                           log_level="warning", access_log=False, server_header=False))

    print("Scoped Proxy — local OWASP Juice Shop lab")
    print(f"  Open Juice Shop through the proxy: http://{settings.bind_host}:{settings.proxy_port}")
    print(f"  Dashboard:                         http://{settings.bind_host}:{settings.dashboard_port}")
    print(f"  Scope (fixed):                     {TARGET_BASE} only")
    print("  Press Ctrl+C to stop.")

    proxy_task = asyncio.create_task(master.run())
    web_task = asyncio.create_task(server.serve())
    try:
        done, _ = await asyncio.wait({proxy_task, web_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()  # surface startup errors (e.g. port already in use)
    finally:
        master.shutdown()
        server.should_exit = True
        for task in (proxy_task, web_task):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await asyncio.wait_for(task, timeout=5)


def main() -> None:
    settings = load_settings()
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(serve(settings))


if __name__ == "__main__":
    main()
