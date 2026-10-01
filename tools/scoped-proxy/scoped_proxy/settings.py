"""Runtime settings. Only the tool's own ports and limits are adjustable; hosts and target are fixed in scope.py."""
from __future__ import annotations

import os
from dataclasses import dataclass

from .scope import BIND_HOST, assert_loopback_bind


def _port(env: str, default: int) -> int:
    raw = os.environ.get(env)
    if raw is None:
        return default
    port = int(raw)
    if not 1024 <= port <= 65535 or port == 3000:
        raise SystemExit(f"FATAL: {env} must be between 1024 and 65535 and not 3000")
    return port


@dataclass(frozen=True)
class Settings:
    bind_host: str
    proxy_port: int
    dashboard_port: int
    history_limit: int = 500
    max_body_bytes: int = 256 * 1024
    max_api_body_bytes: int = 1024 * 1024

    @property
    def dashboard_hosts(self) -> set[str]:
        """Accepted Host header values for the dashboard (DNS-rebinding protection)."""
        return {f"127.0.0.1:{self.dashboard_port}", f"localhost:{self.dashboard_port}"}

    @property
    def dashboard_origins(self) -> set[str]:
        return {f"http://{h}" for h in self.dashboard_hosts}


def load_settings() -> Settings:
    settings = Settings(
        bind_host=BIND_HOST,
        proxy_port=_port("SCOPED_PROXY_PORT", 8080),
        dashboard_port=_port("SCOPED_DASHBOARD_PORT", 8765),
    )
    if settings.proxy_port == settings.dashboard_port:
        raise SystemExit("FATAL: proxy and dashboard ports must differ")
    assert_loopback_bind(settings.bind_host)
    return settings
