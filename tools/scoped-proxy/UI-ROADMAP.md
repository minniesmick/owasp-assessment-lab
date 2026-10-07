# Scoped Proxy UI — roadmap

Open UI improvements for the proxy dashboard (`ui/index.html`, `ui/static/app.css`, `ui/static/app.js`).
Written so work can continue in another session without the earlier conversation.

## Constraints (keep these)
- **UI only.** None of the items below may touch scope enforcement (`scoped_proxy/scope.py`, `addon.py`,
  `repeater_url`, `_pin_request`). Item 7 is the only one that needs a backend change; keep it scope-neutral.
- **Captured traffic is untrusted** (Juice Shop responses contain attack payloads): insert it with
  `textContent` or `esc()`, never as raw HTML.
- **CSP** (`web.py`, `SECURITY_HEADERS`): `script-src 'self'`, `style-src 'self'`, no inline `<style>`/`<script>`,
  no external fonts or CDNs. Setting `element.style` from JS is fine.
- **Visual system:** pure black `#000`, neutral grays, one accent `--accent: #f4b860` (tokens at the top of
  `app.css`). No other hues. IBM Plex Sans / Plex Mono are self-hosted in `ui/static/fonts/`. Icons are inline
  SVG with `class="icon"` (16×16, stroke 1.5). Functional text ≥ 11px. WCAG AA contrast.
- **History stays in memory only.** Do not persist captured requests to disk: they contain session tokens
  and cookies.

## Done (October 2026)
- Black / gray / yellow theme; IBM Plex; SVG icons; no page overflow at 800–1150px.
- HTTP history split view: side detail panel from 1180px, inline under the selected row below that;
  selection survives the 2.5s live refresh; ↑/↓ and Esc; Request / Response tabs; path-only column.
- Interceptor: styled, content-sized editors; cards keyed by id so edits survive the live refresh.
- History filter ("Hide assets", on by default, remembered) and search; "Copy as HTTP" / "Copy as curl"
  for findings; yellow intercept banner on every screen.
- Status code chips coloured by class (`status-2xx` quiet, `3xx` dim, `4xx` accent outline, `5xx` inverted),
  in the history list and the detail meta.
- Local time (`HH:MM:SS`) in the detail meta and interceptor cards; full UTC ISO kept in the `title`.
- Repeater path suggestions skip assets, so API paths are not pushed past the 60-item cap.
- Readable JSON bodies (view only): the history detail body and the repeater response pretty-print JSON with a
  Pretty / Raw toggle (`bodyBlock` / `asJson`), remembered like the asset filter. Interceptor editors untouched.
- Collapsible Body in the history detail (chevron toggle, line/char count when collapsed, remembered like Pretty / Raw).
- Repeater response panel matches the history detail: status chip, duration, Headers / Body (Pretty / Raw, collapse), "Copy response body" / "Copy raw response".
- Interceptor shortcuts: `F` forwards and `D` drops the focused (or first) request; "Forward all" button; `<kbd>` hint.
- Clear history: "Clear" button (two-step confirm) backed by `POST /api/history/clear`; paused requests stay and the blocked counter is not reset.
- Decoder tab (`ui/static/decoder.js`): URL, Base64 / Base64URL, hex, HTML entities, Unicode, ROT13, JWT decode, MD5 / SHA hashes;
  chaining via *Use output as input*, "Looks like" suggestions, and *Decode body* / *Decode JWT* shortcuts in the request details.
  Browser-only; output is written to a textarea value, never as HTML. Tests: `node --test tests/decoder.test.mjs`.
- Scope report (`ui/static/scope.js`): counters, recent blocked attempts, the layers of the boundary, and a *self-check*
  (`POST /api/scope-selftest`, `scoped_proxy/selftest.py`) that runs the scope rules against escape strings; no connection is opened.
- Passive checks (`ui/static/checks.js`, `checks-view.js`): 16 rules over captured traffic, mapped to OWASP Top 10:2025, with
  severity and OWASP filters. Sends no requests. Tests: `node --test tests/checks.test.mjs`.
- Create finding (`ui/static/report.js`, `finding-view.js`): *Create finding* in the request details opens a Finding draft tab with
  a `findings/_TEMPLATE.md` skeleton (same field and section order, checked against the template in a test). Masks tokens and
  cookies by default; severity and CVSS are left as `TODO`. Copy or download. Tests: `node --test tests/report.test.mjs`.

## To do
Order = value for the report and the final presentation. Every item keeps the constraints above: the target and bind address stay
fixed, history stays in memory, captured data is untrusted, and anything that sends requests goes through the existing scope gates.

| # | Feature | What it does | Notes |
|---|---|---|---|
| 3 | **Response diff** | Two responses side by side with a line diff | For A01 (IDOR, access control) |
| 4 | **Two identities** | Keep two tokens (memory only) and replay a request as A, B or both, then diff | For A01. Tokens never touch disk |
| 5 | **Evidence export** | Masked request/response Markdown for screenshots and reports, plus *Copy as Python* (`requests`) | Tokens, cookies and JWTs masked by default |
| 7 | **Match & replace** | Rules that set/remove a header or replace literal text in the body of requests passing through | Literal match only (no regex). Cannot touch `Host`, `Content-Length` or the target; applied after the scope check |
| 8 | **Intruder-lite** | Try a list of payloads at a marked position of a repeater path | Hard caps (200 requests, minimum delay, one job at a time, Stop button). Same path rules and scope gates as the repeater. Payload lists are probes, not credential lists |
| 9 | **Notes and tags** | Per-request note, OWASP tag and star | Stored in the in-memory history only |
| 10 | **socket.io view** | Readable list of the socket.io events Juice Shop sends | Parsed in the browser from captured traffic |

## How to test without touching real traffic
- Start Juice Shop (`docker compose up -d`) and the proxy (`start.bat` / `./start.sh`); open
  http://127.0.0.1:8080 to generate traffic, the UI is at http://127.0.0.1:8765.
- Check 1440px, ~1000px and 375px widths: no horizontal page scroll, no console errors.
- Interceptor layouts can be checked without pausing real requests by stubbing the list in the browser console:
  override `window.fetch` for `GET /api/intercept` to return two fake records, then open the Interceptor view.
  Reload the page afterwards.
- Before committing: `python scripts/validate.py` from the repo root.
