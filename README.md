# OWASP Top 10 Security Assessment Lab

Introduction to Cyber Security — Group Project, 2026/2027 (Option 3).

Security assessment of **OWASP Juice Shop** against all **OWASP Top 10:2025** categories,
supported by deep-dive analyses from **PortSwigger Web Security Academy** labs.
Findings are collected in a structured format and visualized in an assessment dashboard.

## Repository layout
| Path | Content |
|---|---|
| `findings/juice-shop/` | One Markdown file per Juice Shop finding |
| `findings/portswigger/` | One Markdown file per PortSwigger lab write-up |
| `findings/_TEMPLATE.md` | Finding template — copy this |
| `evidence/` | Screenshots, named `<finding-id>-<n>.png` |
| `docs/` | Methodology, OWASP coverage map, ethics |
| `progress/` | Saved Juice Shop progress per member (`scripts/progress.py`) |
| `paper/` | IEEE paper (5–7 pages) |
| `dashboard/` | Assessment dashboard (web UI) |

## Quick start
```bash
docker compose up -d
# open http://127.0.0.1:3000
```
Requires Docker Desktop. The app is bound to localhost only — see `docs/ethics.md`.

## Sharing challenge progress
Juice Shop resets its database on every restart, so progress is shared as "continue codes" in `progress/`.
Requires Python 3 (standard library only).

```bash
python scripts/progress.py save <your-name>   # export your solved challenges → progress/<name>.json, then commit
python scripts/progress.py status             # team overview per OWASP category (changes nothing)
python scripts/progress.py load [name ...]    # apply saved progress to your local Juice Shop
```
Use `status` to see what the team has covered. Use `load` only if you want those challenges
marked solved on your own instance — solve your own categories yourself first.

## Team
| Member | Responsibility |
|---|---|
| Alper | Lab setup, PortSwigger write-ups, dashboard |
| Elif | Juice Shop: A01, A05, A07 |
| Samed | Juice Shop: A02, A04, A10 |
| Altay | Juice Shop: A03, A06, A08, A09 + CVSS scoring |

See `CONTRIBUTING.md` for the workflow.
