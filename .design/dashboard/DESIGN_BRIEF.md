# Design Brief: OWASP Assessment Lab Dashboard

Strategic context: [PRODUCT.md](../../PRODUCT.md). Register: **product**.

## Problem
Four students, three of them new to security and Git, work in parallel on different OWASP categories. The truth about
the project is scattered across Markdown findings, per-person JSON progress files, commits and pull-request reviews.
Nobody can see at a glance who did what, which categories are still empty, or how serious the findings are — so they
ask each other on WhatsApp, gaps surface too late, and at the final presentation the story has to be rebuilt by hand.

## Solution
A read-only dashboard, rebuilt from the repository on every push and published on GitHub Pages. Opening it answers
"where are we?" in seconds: each member's contribution side by side, OWASP coverage as a single matrix, a register of
findings ordered by risk, and a dated activity log. At the presentation the same screens, in order
Team → Coverage → Findings → Risk, tell the story with real data.

## Experience Principles
1. **Truth over theatre** — every number is traceable to a file or commit; the header always states which commit the data is from. No demo mode, no decorative metrics, no commit counts as a proxy for effort.
2. **Severity is the only loud thing** — chroma is reserved for risk. Structure, navigation and people stay neutral, so a critical finding is unmistakable on any screen.
3. **Contribution without competition** — members appear in a fixed order with the same layout; what they own and what they did is shown factually, never ranked.

## Aesthetic Direction
- **Philosophy**: premium security-operations console, restrained. Dense but calm; typography and alignment carry hierarchy; color is semantic.
- **Scene sentence**: a team member opens it on a laptop in the evening at home, lamp-lit room, for a few minutes between Juice Shop sessions → **dark default**. The instructor sees it once through a projector in a lit classroom → **light high-contrast theme**, one click away, remembered per browser.
- **Color strategy**: *Restrained* surface (tinted neutrals, hue ≈ 255, chroma ≤ 0.015) + a *semantic severity scale* as the only saturated system + one quiet interactive accent. All values in OKLCH.
  | Role | Hue (OKLCH) | Use |
  |---|---|---|
  | critical | ≈ 20 (crimson) | badges, matrix cells, risk points |
  | high | ≈ 50 (orange) | |
  | medium | ≈ 85 (amber) | |
  | low | ≈ 235 (steel blue) | |
  | info | neutral | |
  | accent | ≈ 285 (indigo-violet), low chroma | focus ring, selected tab, links — never decoration |
  Severity is always paired with a text label and a distinct glyph shape (◆ critical, ▲ high, ● medium, ■ low, ○ info) so it survives projectors and color-vision deficiency.
- **Typography**: Geist (UI, headings, body) + Geist Mono (IDs like `JS-A05-001`, CVSS vectors, commit hashes, counts in tables). Fixed rem scale, ratio ≈ 1.2. Tabular numerals everywhere numbers align.
- **Reference points**: Datadog / Wiz security views (severity vocabulary, risk-first sorting) · Vercel dashboard (typographic calm, deploy-log style activity feed) · GitHub Insights (contributor summaries, timelines).
- **Anti-references**: hacker cliché (neon green, glitch, skulls, terminal cosplay) · generic SaaS admin (gradient cards, big-number hero metrics, identical card grids) · gamification (leaderboards, ranks, badges) · student homework (Bootstrap / default Chart.js look).

## Existing Patterns
None — `dashboard/` is empty. This project establishes the tokens. Data conventions already fixed by the repo:
- Finding front matter schema (`findings/_TEMPLATE.md`, enforced by `scripts/validate.py`).
- Progress files `progress/<name>.json` and the Juice Shop → OWASP mapping in `scripts/progress.py`.
- Team and category ownership in `docs/owasp-mapping.md` (to be moved into a machine-readable `team.json`).

## Information Architecture
Top bar: project name · tabs **Team / Coverage / Findings / Risk / Activity** · data stamp ("Data from `a1b2c3d` · 2 h ago") · theme toggle. Hash routes for GitHub Pages: `#/team` (default), `#/coverage`, `#/findings`, `#/findings/:id`, `#/risk`, `#/activity`.

1. **Team** (home) — one-line project status sentence (not a hero metric: *"14 findings across 7 of 10 categories · 31 of 116 challenges solved"*); then four member panels in fixed order, identical structure: name, role/owned categories, challenges solved within owned categories (x / total), findings by status (draft · confirmed · reviewed), reviews given, last activity. Alper's panel also shows his non-metric role (lab, write-ups, dashboard). Below: the latest ~8 activity events.
2. **Coverage** — OWASP Top 10:2025 matrix, one row per category: owner, Juice Shop challenges solved/total (thin bar), PortSwigger write-ups, findings as severity glyph counts, coverage state (*not started · challenges only · findings · reviewed*). Rows with nothing yet are visibly empty, not hidden.
3. **Findings** — register table sorted by CVSS desc: ID (mono), title, OWASP, severity, CVSS, source, tester, status, date. Filters: severity, category, member, source, status (URL-persisted). Row opens `#/findings/:id`: rendered Markdown (steps, evidence images from the repo, impact, mitigation), metadata sidebar, link to the file on GitHub.
4. **Risk** — severity distribution + an exploitability × impact plot derived from each finding's CVSS 3.1 vector sub-scores (real data, not a guessed likelihood). Points link to findings.
5. **Activity** — dated log grouped by day: finding added, status changed, PR reviewed/approved (who reviewed whose), challenges solved (+n per category, from diffs of progress files), write-ups added. Filter by member.

## Component Inventory
| Component | Status | Notes |
|---|---|---|
| App shell + top bar + tabs | New | sticky top bar; tabs scroll horizontally on mobile |
| Data stamp | New | commit hash + relative time; warns if data older than 7 days |
| Theme toggle | New | dark ↔ light, `localStorage` (guarded), respects `prefers-color-scheme` first visit |
| Status sentence | New | replaces hero metrics |
| Member panel | New | ×4, identical structure, no ranking |
| Severity badge | New | glyph + label + color; sizes sm/md |
| Coverage matrix | New | semantic `<table>`, sticky first column on mobile |
| Progress bar (thin) | New | solved/total, neutral fill, value in text |
| Findings table + filters | New | sortable headers, filter chips, empty/filtered-empty states |
| Finding detail | New | sanitized Markdown renderer, metadata aside, evidence images |
| Risk plot | New | hand-built SVG, keyboard-focusable points with labels |
| Severity distribution | New | horizontal stacked bar, labelled |
| Activity feed | New | day groups, event icons per type, member filter |
| Empty / loading / error states | New | skeletons, instructive empty states linking to BASLANGIC.md |

## Key Interactions
- Tab switch: instant, no page transitions beyond a 150 ms fade of content.
- Findings filters update the table immediately and the URL hash (shareable, back-button safe).
- Sorting by clicking column headers; `aria-sort` reflects state.
- Hover/focus on risk points and matrix cells shows a compact tooltip; click navigates.
- Theme toggle cross-fades colors (≤ 200 ms); reduced-motion → instant.
- No modals: finding detail is a route, not a dialog.

## Key States
- **Empty (expected for weeks)**: team panels show zeros plainly and one next step; Findings empty state explains how a finding appears (template → PR → merge) and links BASLANGIC.md; Coverage shows all rows as *not started*.
- **Loading**: skeleton rows/panels matching final layout.
- **Error**: data.json failed to load → clear message + link to the latest Actions run.
- **Stale**: data stamp turns to warning style after 7 days.
- **Partial data**: running locally without GitHub API → review counts show "—" with tooltip "available on the published site".

## Data Pipeline (build-time)
`scripts/build_dashboard_data.py` (stdlib) → `dashboard/public/data.json`, combining: finding front matter + body, progress files, Juice Shop challenge totals per category (committed snapshot, since Pages cannot reach localhost), git log (with `fetch-depth: 0`), PR reviews via GitHub API (`GITHUB_TOKEN`, Actions only), and `team.json` (name, GitHub login, owned categories, role).
GitHub Actions on push to `main`: validate → build data → `npm ci && npm run build` → deploy to GitHub Pages. No commits to `main` (branch protection untouched).

## Responsive Behavior
Desktop-first (laptop 1280–1440 is the main viewport; projector 1024×768 must work). ≤ 900 px: member panels stack 2×2 then 1-column; findings table becomes stacked rows with ID + severity + title prominent; coverage matrix keeps a sticky category column and scrolls horizontally inside its container; tabs scroll horizontally. No horizontal page scroll at 360 px.

## Accessibility Requirements
WCAG AA contrast in both themes (4.5:1 text, 3:1 large text and UI boundaries); severity never color-only (glyph + label); visible focus ring (accent) on every interactive element; full keyboard navigation incl. table sorting and risk-plot points; semantic tables with headers; `prefers-reduced-motion` honored.

## Security (it is a security project)
Findings Markdown is contributor-written → render with a sanitizer (DOMPurify) and no raw HTML passthrough; strict Content-Security-Policy meta; no third-party scripts beyond self-hosted/bundled code and Google Fonts.

## Scope (this round)
Production quality, all five screens, real data pipeline and Pages deployment. Stack: React 19 + Vite + TypeScript, plain CSS with custom-property tokens, hand-built SVG charts, react-router (HashRouter), marked + DOMPurify.

## Out of Scope
Authentication, editing data from the dashboard, notifications, PDF/report export (possible later), i18n (English only), real-time updates between pushes, mobile-specific features beyond responsive layout, any interaction with a running Juice Shop.
