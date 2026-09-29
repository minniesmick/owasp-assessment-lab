# Methodology (working notes → paper section)

## Environment
- Juice Shop version: 20.2.0 (Docker image `bkimminich/juice-shop:v20.2.0`), bound to `127.0.0.1:3000`
- Host OS / Docker version: _fill in per tester_

## Tools
Testing follows a "least tooling first" approach: start with the browser, add an intercepting proxy only when
a challenge requires modifying or repeating requests. This keeps the barrier low for team members new to
web security and makes each finding reproducible with free tools.

| Tier | Tool | Used for |
|---|---|---|
| Primary | Browser DevTools (Chrome / Firefox) | Inspecting requests/responses (Network), reading client-side JavaScript (Sources), cookies / localStorage / JWTs (Application / Storage), editing and resending requests (Firefox *Edit and Resend*, Chrome *Copy as fetch*) |
| Secondary | Burp Suite Community Edition | Intercepting and modifying requests before they are sent (Proxy), manual request tampering (Repeater), clean request/response evidence screenshots |
| Secondary | OWASP ZAP | Same role as Burp; preferred for repeated/automated requests (Fuzzer) since Burp Community's Intruder is rate-limited |
| Support | curl | Scripted, reproducible requests in the *Steps to reproduce* section |

Which tool was used is recorded per finding in the `tools` field of the finding template.

### Proxy setup note
Browsers do not send `localhost` / `127.0.0.1` traffic through a proxy by default.
- Easiest: use Burp's built-in browser (*Proxy → Open browser*) — no proxy or certificate setup needed.
- Firefox with an external proxy: set `network.proxy.allow_hijacking_localhost = true` in `about:config`.
- Juice Shop runs over plain HTTP locally, so no CA certificate is needed for the lab itself.

### Terminology
The work involves **intercepting** the tester's own browser traffic (an intercepting proxy / MITM on one's own
client), not **sniffing** (passive capture of third-party network traffic). No traffic other than the tester's own
is captured.

## Process
1. Pick OWASP category → read related PortSwigger material.
2. Explore Juice Shop for that category; use the score board challenges as hints.
3. Start with DevTools; switch to Burp/ZAP when requests must be intercepted, modified before sending, or repeated.
4. Document each confirmed issue with `findings/_TEMPLATE.md`.
5. Score with CVSS 3.1 (https://www.first.org/cvss/calculator/3.1).
6. Peer review: another member reproduces the finding before `status: reviewed`.

## Risk classification
| Severity | CVSS |
|---|---|
| Critical | 9.0–10.0 |
| High | 7.0–8.9 |
| Medium | 4.0–6.9 |
| Low | 0.1–3.9 |
| Info | 0.0 |
