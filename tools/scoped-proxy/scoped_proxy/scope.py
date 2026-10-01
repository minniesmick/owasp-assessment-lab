"""Scope definition: the single place that decides what the tool may talk to.

The scope is not configurable. The target and the bind address are constants so that no config file,
environment variable or request field can widen it. Ports of the tool itself may be changed (see settings).
"""
from __future__ import annotations

import ipaddress
import re

import httpx

TARGET_SCHEME = "http"
TARGET_HOST = "127.0.0.1"
TARGET_PORT = 3000
TARGET_BASE = f"{TARGET_SCHEME}://{TARGET_HOST}:{TARGET_PORT}"
BIND_HOST = "127.0.0.1"

# Repeater paths: must start with a single "/", printable ASCII only, no backslashes or whitespace.
_PATH_RE = re.compile(r"^/(?!/)[\x21-\x5b\x5d-\x7e]*$")  # 0x5c (backslash) excluded


class ScopeError(ValueError):
    """Raised when something would leave the local Juice Shop scope."""


def is_target_address(host: str | None, port: int | None) -> bool:
    """True only for the pinned Juice Shop socket address (127.0.0.1:3000)."""
    if host is None or port != TARGET_PORT:
        return False
    try:
        return ipaddress.ip_address(host) == ipaddress.ip_address(TARGET_HOST)
    except ValueError:
        return False  # hostnames are never accepted at socket level, only the literal loopback IP


def assert_loopback_bind(host: str) -> None:
    if host != BIND_HOST:
        raise SystemExit(f"FATAL: refusing to bind to {host!r}; only {BIND_HOST} is allowed")


def repeater_url(path: str) -> httpx.URL:
    """Build the repeater URL from a path. The host part is never taken from user input."""
    if not isinstance(path, str) or not _PATH_RE.fullmatch(path):
        raise ScopeError("Path must start with a single '/' and contain only printable ASCII without spaces or '\\'")
    url = httpx.URL(TARGET_BASE + path)
    check_url(url)
    return url


def check_url(url: httpx.URL) -> None:
    """Final check on a fully built URL (also run by the HTTP client right before sending)."""
    if url.scheme != TARGET_SCHEME or url.userinfo or not is_target_address(url.host, url.port):
        raise ScopeError(f"Out of scope: {url}")
