# How we work

## Adding a finding (no Git experience needed)
Option A — GitHub website:
1. Open `findings/_TEMPLATE.md`, copy its content.
2. Go to `findings/juice-shop/` → **Add file → Create new file**, name it e.g. `JS-A01-001-basket-idor.md`, paste, fill in.
3. Upload screenshots to `evidence/juice-shop/` (**Add file → Upload files**).
4. Choose **"Create a new branch and start a pull request"** → submit.

Option B — Git / VS Code:
```bash
git checkout -b finding/JS-A01-001
# add files
git add . && git commit -m "Add JS-A01-001 basket IDOR"
git push -u origin finding/JS-A01-001
```
Then open a pull request.

## Before pushing
Run `python scripts/validate.py` and fix every `[HATA]`. The same check runs on GitHub for every push and pull request;
if it fails, open the red ❌ → *Details* to see which file and field is wrong.

## Rules
- One finding = one file = one pull request.
- IDs: `JS-` (Juice Shop) or `PS-` (PortSwigger) + OWASP category + 3-digit number.
- Screenshots: `evidence/<source>/<ID>-<n>.png`. Crop to what matters.
- Another member reproduces the finding and approves the PR before merge.
- Write in your own words. Do not copy PortSwigger or online solution text.
- Test only against localhost Juice Shop and PortSwigger labs (`docs/ethics.md`).
