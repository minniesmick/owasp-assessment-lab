<div align="center">

[![English](https://img.shields.io/badge/lang-English-blue?style=for-the-badge)](README.md)
[![Türkçe](https://img.shields.io/badge/dil-T%C3%BCrk%C3%A7e-red?style=for-the-badge)](ReadMeTr.md)

# OWASP Top 10 Security Assessment Lab

Introduction to Cyber Security — Group Project, 2026/2027 (Option 3)

</div>

> [!TIP]
> **Team members:** new to GitHub? Start with the Turkish step-by-step guide **[BASLANGIC.md](BASLANGIC.md)**.

Security assessment of **OWASP Juice Shop** against all **OWASP Top 10:2025** categories,
supported by deep-dive analyses from **PortSwigger Web Security Academy** labs.
Findings are collected in a structured format and visualized in an assessment dashboard.

## Contents
- [Repository layout](#repository-layout)
- [Setup](#setup)
- [Workflow](#workflow)
- [Sharing challenge progress](#sharing-challenge-progress)
- [Team](#team)
- [Ethics](#ethics)

## Repository layout
| Path | Content |
|---|---|
| `BASLANGIC.md` | Step-by-step beginner guide (Turkish) |
| `AGENTS.md` | Project rules for AI assistants (ChatGPT, Claude, Copilot …) |
| `findings/_TEMPLATE.md` | Finding template — copy this for every finding |
| `findings/juice-shop/` | One Markdown file per Juice Shop finding (`JS-A05-001-login-sqli.md`) |
| `findings/portswigger/` | One Markdown file per PortSwigger lab write-up (`PS-A05-001-...md`) |
| `evidence/` | Screenshots, named `<finding-id>-<n>.png` |
| `progress/` | Saved Juice Shop challenge progress per member |
| `scripts/progress.py` | Save / view / load challenge progress |
| `scripts/validate.py` | Checks file names, folders and required fields (also runs on GitHub) |
| `docs/` | Methodology, OWASP coverage map, ethics |
| `paper/` | IEEE paper (5–7 pages) |
| `dashboard/` | Assessment dashboard (web UI) — live at https://minniesmick.github.io/owasp-assessment-lab/ |
| `team.json` | Team roster: names, GitHub usernames, owned OWASP categories |
| `data/` | Juice Shop challenge catalog snapshot (for the dashboard) |

## Setup
Requirements: **Docker Desktop**, **Python 3**, a browser with DevTools (Chrome / Firefox).
Optional: **Burp Suite Community** or **OWASP ZAP** — only for challenges that need requests intercepted or repeated.
See [Tools](docs/methodology.md#tools) for when to use which.

```bash
docker compose up -d        # start Juice Shop → http://127.0.0.1:3000
docker compose down         # stop
```
- Version is pinned to **Juice Shop v20.2.0**, so everyone tests the same build.
- Juice Shop **resets all data on every restart**. Take screenshots as soon as you find something.
- The Score Board (`/#/score-board`) lists all challenges; filter by category.

## Workflow
1. Pick a challenge from **your own OWASP categories** (see [Team](#team)).
2. Read the related PortSwigger topic first, then solve it in Juice Shop — start with DevTools (F12), use Burp/ZAP only when needed.
3. Save your progress: `python scripts/progress.py save <your-name>`.
4. For important challenges, write a finding: copy `findings/_TEMPLATE.md`, fill it in, add screenshots to `evidence/`.
5. Check your files: `python scripts/validate.py` — fix every `[HATA]` (error) it prints.
6. Commit and push. The same check runs automatically on GitHub; a red ❌ means something is wrong.
7. Another member reproduces the finding before it is marked `reviewed`.

Findings are written in **English**. Solving a challenge ≠ writing a finding. The paper is built from `findings/`; aim for at least 2–3 findings per OWASP category.
Details: [CONTRIBUTING.md](CONTRIBUTING.md), [docs/methodology.md](docs/methodology.md).

## Sharing challenge progress
Juice Shop's database cannot be shared (it resets on restart), so progress is shared as Juice Shop
**continue codes** stored in `progress/<name>.json`.

| Command | What it does |
|---|---|
| `python scripts/progress.py save <name>` | Adds your solved challenges to `progress/<name>.json`. Cumulative: earlier saves are kept even after a restart. |
| `python scripts/progress.py status` | Team overview per OWASP category and member. Changes nothing. |
| `python scripts/progress.py load [name ...]` | Marks the saved challenges as solved in **your** local Juice Shop (all members if no name). |

Notes:
- Always save with **your own name**. Challenges already credited to a teammate are not credited to you again.
- Use `status` to follow the team. Use `load` only for demos — loading a teammate's challenges marks them solved for you.
- Juice Shop must be running for `save` and `load`. Other URL: set `JUICE_SHOP_URL`.

## Team
| Member | Responsibility |
|---|---|
| Alper | Lab setup, PortSwigger write-ups, dashboard |
| Elif | Juice Shop: A01, A05, A07 |
| Samed | Juice Shop: A02, A04, A10 |
| Altay | Juice Shop: A03, A06, A08, A09 + CVSS scoring |

Full category mapping: [docs/owasp-mapping.md](docs/owasp-mapping.md).

## Ethics
All testing is done **only** against Juice Shop running locally (bound to `127.0.0.1`) and PortSwigger Academy labs.
No other system is tested. See [docs/ethics.md](docs/ethics.md).
