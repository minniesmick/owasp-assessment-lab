"""Build dashboard/public/data.json (and copy evidence images) from the repository.

Sources: team.json, data/juice-shop-challenges.json, findings/**/*.md, progress/*.json,
git history (needs full history: `git fetch --unshallow` / checkout with fetch-depth 0)
and, when GITHUB_TOKEN + GITHUB_REPOSITORY are set (GitHub Actions), pull-request reviews.

Usage:
    python scripts/build_dashboard_data.py
Only Python standard library is used.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cvss  # noqa: E402
from validate import parse_front_matter  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "dashboard" / "public"
DEFAULT_REPO = "minniesmick/owasp-assessment-lab"
IGNORED = {"README.md", "_TEMPLATE.md", ".gitkeep"}

OWASP_NAMES = {
    "A01": "Broken Access Control",
    "A02": "Security Misconfiguration",
    "A03": "Software Supply Chain Failures",
    "A04": "Cryptographic Failures",
    "A05": "Injection",
    "A06": "Insecure Design",
    "A07": "Authentication Failures",
    "A08": "Software or Data Integrity Failures",
    "A09": "Security Logging and Alerting Failures",
    "A10": "Mishandling of Exceptional Conditions",
}


# ---------------------------------------------------------------- helpers

def git(*args):
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True
    ).stdout


def git_show(sha, path):
    try:
        return git("show", f"{sha}:{path}")
    except subprocess.CalledProcessError:
        return None


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


class Team:
    def __init__(self, members):
        self.members = members

    def by_author(self, name, email):
        """Map a git author (or GitHub login) to a member id."""
        name_l, email_l = (name or "").lower(), (email or "").lower()
        for m in self.members:
            gh = (m.get("github") or "").lower()
            keys = {m["id"], m["name"].lower(), *[a.lower() for a in m.get("aliases", [])]}
            if gh:
                keys.add(gh)
                if email_l.endswith(f"+{gh}@users.noreply.github.com") or email_l == f"{gh}@users.noreply.github.com":
                    return m["id"]
            if name_l in keys or email_l in keys:
                return m["id"]
        return None

    def by_login(self, login):
        login_l = (login or "").lower()
        for m in self.members:
            if login_l and login_l == (m.get("github") or "").lower():
                return m["id"]
        return None

    def by_tester(self, tester):
        """'Elif Yilmaz' -> 'elif'. Matches the first word against member names and ids."""
        first = (str(tester or "").strip().split() or [""])[0].lower()
        for m in self.members:
            if first in {m["id"], m["name"].lower()}:
                return m["id"]
        return None


# ---------------------------------------------------------------- findings

def rewrite_evidence_links(body):
    # Findings link images as ../../evidence/<source>/<file>; the dashboard serves them at evidence/...
    return re.sub(r"\]\((?:\.\./)+evidence/", "](evidence/", body)


def read_findings(team, repo):
    findings = []
    for path in sorted((ROOT / "findings").glob("*/*.md")):
        if path.name in IGNORED:
            continue
        fm, body = parse_front_matter(path.read_text(encoding="utf-8"))
        if not fm:
            continue
        rel = path.relative_to(ROOT).as_posix()
        try:
            scores = cvss.score(fm.get("cvss_vector"))
        except ValueError:
            scores = None
        try:
            stated = float(fm.get("cvss_score"))
        except (TypeError, ValueError):
            stated = None
        evidence = fm.get("evidence") if isinstance(fm.get("evidence"), list) else []
        findings.append({
            "id": fm.get("id"),
            "title": fm.get("title"),
            "source": fm.get("source"),
            "target": fm.get("target"),
            "owasp": fm.get("owasp"),
            "cwe": fm.get("cwe"),
            "severity": fm.get("severity"),
            "cvssVector": fm.get("cvss_vector"),
            "cvssScore": stated,
            "cvss": scores,
            "tester": fm.get("tester"),
            "testerId": team.by_tester(fm.get("tester")),
            "tools": [t.strip() for t in str(fm.get("tools") or "").split(",") if t.strip()],
            "date": fm.get("date"),
            "status": fm.get("status"),
            "evidence": evidence,
            "file": rel,
            "url": f"https://github.com/{repo}/blob/main/{rel}",
            "body": rewrite_evidence_links(body.strip()),
        })
    return findings


# ---------------------------------------------------------------- activity from git history

def history_commits(*paths):
    """Chronological commits touching paths: [(sha, iso_date, author, email, [files])]."""
    try:
        out = git("log", "--reverse", "--format=%x1e%H%x1f%aI%x1f%an%x1f%ae", "--name-only", "--", *paths)
    except subprocess.CalledProcessError:
        return []
    commits = []
    for block in out.split("\x1e"):
        block = block.strip()
        if not block:
            continue
        header, *files = block.split("\n")
        sha, date, name, email = header.split("\x1f")
        commits.append((sha, date, name, email, [f for f in files if f.strip()]))
    return commits


def progress_events(team, catalog):
    events, last = [], {}
    names = {c["key"]: c for c in catalog}
    for sha, date, author, email, files in history_commits("progress"):
        for f in files:
            if not re.fullmatch(r"progress/[^/]+\.json", f) or f.endswith("README.md"):
                continue
            raw = git_show(sha, f)
            if raw is None:
                last.pop(f, None)
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            keys = {s["key"] for s in data.get("solved", [])}
            added = sorted(keys - last.get(f, set()))
            last[f] = keys
            if not added:
                continue
            by_owasp = {}
            for k in added:
                code = names.get(k, {}).get("owasp", "-")
                by_owasp[code] = by_owasp.get(code, 0) + 1
            events.append({
                "type": "challenges",
                "date": date,
                "sha": sha[:7],
                "member": Path(f).stem,
                "author": team.by_author(author, email) or author,
                "count": len(added),
                "byOwasp": by_owasp,
                "challenges": [names.get(k, {}).get("name", k) for k in added],
            })
    return events


def finding_events(team):
    events, last_status = [], {}
    for sha, date, author, email, files in history_commits("findings"):
        for f in files:
            name = f.rsplit("/", 1)[-1]
            if not re.fullmatch(r"findings/[^/]+/[^/]+\.md", f) or name in IGNORED:
                continue
            raw = git_show(sha, f)
            if raw is None:
                last_status.pop(f, None)
                continue
            fm, _ = parse_front_matter(raw)
            if not fm:
                continue
            status = fm.get("status")
            base = {
                "date": date,
                "sha": sha[:7],
                "findingId": fm.get("id"),
                "title": fm.get("title"),
                "severity": fm.get("severity"),
                "owasp": fm.get("owasp"),
                "member": team.by_tester(fm.get("tester")),
                "author": team.by_author(author, email) or author,
            }
            if f not in last_status:
                events.append({"type": "finding_added", "status": status, **base})
            elif last_status[f] != status:
                events.append({"type": "finding_status", "from": last_status[f], "to": status, **base})
            last_status[f] = status
    return events


# ---------------------------------------------------------------- reviews (GitHub API, optional)

def github_get(path, token):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def review_events(team, repo):
    """Returns (events, available). Without a token (local builds) reviews are unavailable."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return [], False
    events = []
    try:
        page = 1
        while True:
            pulls = github_get(f"/repos/{repo}/pulls?state=all&per_page=100&page={page}", token)
            for pr in pulls:
                for r in github_get(f"/repos/{repo}/pulls/{pr['number']}/reviews?per_page=100", token):
                    if r.get("state") not in {"APPROVED", "CHANGES_REQUESTED"} or not r.get("submitted_at"):
                        continue
                    reviewer = (r.get("user") or {}).get("login")
                    events.append({
                        "type": "review",
                        "date": r["submitted_at"],
                        "state": r["state"].lower(),
                        "member": team.by_login(reviewer) or reviewer,
                        "prAuthor": team.by_login((pr.get("user") or {}).get("login")) or (pr.get("user") or {}).get("login"),
                        "pr": pr["number"],
                        "prTitle": pr["title"],
                        "url": pr["html_url"],
                    })
            if len(pulls) < 100:
                break
            page += 1
    except (urllib.error.URLError, KeyError, ValueError) as e:
        print(f"warning: could not load pull-request reviews ({e})", file=sys.stderr)
        return [], False
    return events, True


# ---------------------------------------------------------------- assemble

def build():
    repo = os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPO)
    team_data = load_json(ROOT / "team.json")
    team = Team(team_data["members"])
    catalog_data = load_json(ROOT / "data" / "juice-shop-challenges.json")
    catalog = catalog_data["challenges"]

    progress = {}
    for p in sorted((ROOT / "progress").glob("*.json")):
        d = load_json(p)
        progress[p.stem] = {
            "savedAt": d.get("saved_at"),
            "solved": [s["key"] for s in d.get("solved", [])],
        }

    findings = read_findings(team, repo)
    reviews, reviews_available = review_events(team, repo)
    activity = progress_events(team, catalog) + finding_events(team) + reviews
    activity.sort(key=lambda e: e["date"], reverse=True)

    sha = os.environ.get("GITHUB_SHA") or git("rev-parse", "HEAD").strip()
    commit_date = git("show", "-s", "--format=%cI", sha).strip()

    data = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repo": repo,
        "commit": {"sha": sha, "short": sha[:7], "date": commit_date,
                   "url": f"https://github.com/{repo}/commit/{sha}"},
        "juiceShopVersion": catalog_data["juice_shop_version"],
        "owasp": [{"code": c, "name": n} for c, n in OWASP_NAMES.items()],
        "team": [{k: m.get(k) for k in ("id", "name", "github", "role", "owasp")} for m in team.members],
        "challenges": catalog,
        "progress": progress,
        "findings": findings,
        "activity": activity,
        "reviewsAvailable": reviews_available,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    evidence_out = OUT_DIR / "evidence"
    if evidence_out.exists():
        shutil.rmtree(evidence_out)
    shutil.copytree(ROOT / "evidence", evidence_out, ignore=shutil.ignore_patterns("README.md", ".gitkeep"))

    print(f"data.json: {len(findings)} findings, {len(progress)} progress files, "
          f"{len(activity)} activity events, reviews {'on' if reviews_available else 'off (no GITHUB_TOKEN)'}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    build()
