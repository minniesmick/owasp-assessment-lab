# Scoped Proxy

A small intercepting proxy for the **local OWASP Juice Shop lab** — HTTP history, interceptor (pause / edit /
forward / drop) and repeater — whose scope is **fixed in code to `http://127.0.0.1:3000`**.
Unlike a general-purpose proxy (Burp, ZAP), it cannot be pointed at anything else: the restriction is part of the
design, enforced in several independent layers and verified by automated tests.

> Use it only with the Juice Shop instance started by this repository (`docker compose up -d`, bound to 127.0.0.1).

## Run

Requirements: Python 3.11, Juice Shop running on `http://127.0.0.1:3000`.

| OS | Command |
|---|---|
| Windows | double-click `start.bat` |
| macOS / Linux | `./start.sh` |

Then:
1. Open **http://127.0.0.1:8080** — Juice Shop loads *through* the proxy (no browser proxy settings, no certificates).
2. Open the dashboard at **http://127.0.0.1:8765** — every request appears in *HTTP history*.
3. *Intercept requests* pauses requests so you can edit headers/body and forward or drop them.
   Turning it off releases everything that is paused.
4. *Send to repeater* re-sends a request with changes; only the **path** is editable, the host is fixed.
5. The **Decoder** tab encodes, decodes and hashes values: URL, Base64 / Base64URL, hex, HTML entities, Unicode escapes,
   ROT13, JWT (header and payload, never verified), MD5 / SHA-1 / SHA-256 / SHA-512. *Use output as input* chains steps
   (Base64 decode, then URL decode). In a request's details, *Decode body* and *Decode JWT* (shown when a JWT is found in
   the headers or body) open the value in the Decoder. It runs only in the browser page and sends nothing anywhere.
6. **Checks** lists passive observations drawn from the captured traffic: missing security headers, cookie flags, CORS `*`,
   stack traces, SQL errors, weak or leaky JWTs, hash-like fields, secrets in URLs. Each is tagged with its OWASP Top 10:2025
   category. They are hints to verify by hand, not confirmed findings. The tab sends no requests.
7. **Scope** shows the boundary of the tool and runs a *self-check* that tries escape strings against the scope rules
   without opening any connection.

> [!IMPORTANT]
> Only traffic sent to **:8080** passes through the proxy. A tab opened at `http://127.0.0.1:3000` talks to Juice Shop
> directly, so nothing from it appears in *HTTP history*.
> The browser treats `:3000` and `:8080` as different sites: log in again on `:8080` (sessions, basket and local storage are not shared).

Ports can be changed with `SCOPED_PROXY_PORT` / `SCOPED_DASHBOARD_PORT` (1024–65535, never 3000).
Hosts and the target cannot be changed. History lives in memory only and is gone when the tool stops.

## Security model

### Scope enforcement (proxy → target)

| Layer | Where | What it guarantees |
|---|---|---|
| 1. Construction | `app.py` | mitmproxy runs in **reverse-proxy mode with a fixed upstream** (`reverse:http://127.0.0.1:3000`). Clients never choose a destination; even absolute-form requests to other hosts are sent to Juice Shop. |
| 2. Request check | `addon.py` `requestheaders` / `http_connect` | The real connection target (`request.host`/`port`, **not** the spoofable `Host` header) must equal 127.0.0.1:3000. `CONNECT` tunnels are refused. |
| 3. Socket gate | `addon.py` `server_connect` | Immediately before any TCP connection is opened, the address must be exactly `127.0.0.1:3000` (IP literal; hostnames are not trusted). Anything else is refused and logged as *blocked*. |
| Repeater | `scope.py`, `web.py` | Accepts a path, not a URL; strict path syntax (single leading `/`, printable ASCII, no `\`, spaces or CR/LF); URL re-checked after building and again by an httpx request hook right before sending; no redirects followed; proxy environment variables ignored; user-supplied `Host` header dropped. |
| Interceptor | `addon.py` `forward` | Edits can change headers and body only. The `Host` header is always reset to the target; hop-by-hop headers are removed. |

### Exposure of the tool itself

| Risk | Mitigation |
|---|---|
| Reachable from the network | Proxy and dashboard bind to `127.0.0.1` only; any other bind address is a fatal startup error. |
| Malicious website reading captured tokens via DNS rebinding | Dashboard rejects any `Host` header other than `127.0.0.1:<port>` / `localhost:<port>` (HTTP 421). |
| Malicious website driving the API (CSRF) | State-changing requests require a same-origin `Origin` and `Content-Type: application/json` (forces a CORS preflight that is never granted). |
| Attack payloads in captured traffic executing in the dashboard (XSS) | All captured data is escaped / inserted as text; strict `Content-Security-Policy` (`script-src 'self'`, no inline script/style), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`. |
| Interceptor race conditions / hangs | Proxy and dashboard share **one asyncio event loop**; pausing and resuming never cross threads. |
| Memory exhaustion | History is bounded (500 entries, 256 KiB per body); API request bodies are capped at 1 MiB. |
| Leaking the mitmproxy CA key | `.mitmproxy/` is git-ignored. The CA is never needed (Juice Shop is plain HTTP locally). |

## Verification

```bash
.venv/Scripts/python -m pytest -q        # Windows
.venv/bin/python -m pytest -q            # macOS / Linux
```

59 Python tests (Juice Shop must be running for the integration tests):
- **Unit** — scope rules, repeater path validation (absolute URLs, `//`, `@`, `\`, CR/LF, non-ASCII …),
  loopback-only binding, and the socket gate called directly with out-of-scope addresses.
- **Integration** — starts the real tool and a **canary server on an out-of-scope local port**, then tries to
  reach the canary through every path: absolute-form requests, spoofed `Host` headers, `CONNECT` tunnels,
  forward-proxy use (HTTP and HTTPS), repeater escape strings and a repeater `Host` override. The final test
  asserts that the canary received **zero connections**. It also checks DNS-rebinding/CSRF protection, security
  headers, interceptor forward/drop and clearing the history.

The Decoder and the passive checks are plain JavaScript with their own tests (known vectors for MD5, SHA, Base64, JWT,
and one test per check rule):
```bash
node --test tests/decoder.test.mjs       # Node 20+
node --test tests/checks.test.mjs
```

## Limits (what this does not claim)

- A client that sends no `Accept-Encoding: gzip` gets a `502` for `GET /ftp`. Juice Shop declares `Content-Length: 11319` but
  sends 11307 bytes, and the proxy rejects the mismatch. Browsers ask for gzip, so they are not affected.
- The history keeps response headers as a name-to-value map, so repeated headers (several `Set-Cookie`) collapse to the last one.

- The guarantees cover **this tool**. They do not stop other software on the machine from reaching other hosts.
- Juice Shop must itself stay bound to `127.0.0.1` (the repository's `docker-compose.yml` does this).
- Any local process or user on the same machine can use the proxy and dashboard; the threat model is a
  single-user developer machine. The proxy only ever reaches Juice Shop, which is already reachable locally.
- Correctness of the pinned dependencies (mitmproxy, FastAPI, uvicorn, httpx) is assumed.

## Origin

Started from a scaffold generated with Manus AI from a prompt that specified the local-only constraints.
A review found that the scaffold could not start (mitmproxy's master was created outside an event loop), checked
scope on the spoofable `Host` header (`pretty_url`), allowed CONNECT tunnels to open before the check, and resumed
intercepted flows from a different thread. The tool was rewritten around a fixed reverse-proxy upstream, the
socket-level gate, a single event loop, a path-only repeater and a hardened dashboard, and covered by the tests above.
The original UI design was kept.
