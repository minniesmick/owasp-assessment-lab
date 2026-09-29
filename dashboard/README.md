# Assessment Dashboard

Live view of the assessment: team contribution, OWASP Top 10:2025 coverage, findings, risk and activity.
Published at **https://minniesmick.github.io/owasp-assessment-lab/** — rebuilt by
[`.github/workflows/dashboard.yml`](../.github/workflows/dashboard.yml) on every push to `main` (merged PRs, so reviews appear once a PR is merged).

> Maintained by Alper. Team members: please don't edit files here — open an issue or message Alper with UI ideas or bugs,
> so the dashboard stays consistent for the final presentation. PRs touching this folder request his review automatically.

Design brief: [`.design/dashboard/DESIGN_BRIEF.md`](../.design/dashboard/DESIGN_BRIEF.md) · product context: [`PRODUCT.md`](../PRODUCT.md).

## How the data is built
`scripts/build_dashboard_data.py` → `public/data.json` (+ copies `evidence/` to `public/evidence/`), from:

| Source | Used for |
|---|---|
| `team.json` | Members, GitHub usernames, owned OWASP categories |
| `data/juice-shop-challenges.json` | Challenge totals per category (snapshot, `python scripts/progress.py catalog`) |
| `findings/**/*.md` | Findings register, CVSS sub-scores (`scripts/cvss.py`) |
| `progress/*.json` | Challenges solved per member |
| git history | Activity log: solved challenges, findings added, status changes |
| GitHub API (Actions only) | Pull-request reviews |

`README.md` and `_TEMPLATE.md` files are skipped.

## Local development
Requires Node 24+ and Python 3.
```bash
cd dashboard
npm install
npm run data        # build public/data.json from the repo
npm run dev         # http://localhost:5173
```
Sample data for developing populated states (fictional, never deployed):
```bash
npm run fixture     # writes dev/fixture.json
# open http://localhost:5173/?fixture
```

## Stack
React 19 + Vite + TypeScript, plain CSS with OKLCH tokens (`src/styles/tokens.css`), hand-built SVG charts,
`marked` + `DOMPurify` for finding Markdown (contributor input is treated as untrusted), strict CSP in production builds.
