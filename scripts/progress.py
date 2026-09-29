"""Share Juice Shop challenge progress through the repo.

Juice Shop resets its database on every restart, so the database itself cannot be shared.
Instead, each member saves a "continue code" (Juice Shop's built-in progress token)
to progress/<name>.json, commits it, and others can view or apply it.

Usage (Juice Shop must be running for save/load):
    python scripts/progress.py save <name>       # export my progress to progress/<name>.json
    python scripts/progress.py status            # team overview per OWASP category (read-only)
    python scripts/progress.py load [name ...]   # apply saved progress to my local Juice Shop
    python scripts/progress.py catalog           # (maintainers) snapshot challenge list to data/ for the dashboard

Only Python standard library is used.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE_URL = os.environ.get("JUICE_SHOP_URL", "http://127.0.0.1:3000").rstrip("/")
PROGRESS_DIR = Path(__file__).resolve().parent.parent / "progress"

# Juice Shop challenge category -> OWASP Top 10:2025.
# Some are judgement calls; keep in sync with docs/owasp-mapping.md.
CATEGORY_TO_OWASP = {
    "Broken Access Control": "A01",
    "Unvalidated Redirects": "A01",
    "Security Misconfiguration": "A02",
    "XXE": "A02",
    "Security through Obscurity": "A02",
    "Vulnerable Components": "A03",
    "Cryptographic Issues": "A04",
    "Sensitive Data Exposure": "A04",
    "Injection": "A05",
    "XSS": "A05",
    "Improper Input Validation": "A06",
    "Broken Anti Automation": "A06",
    "Broken Authentication": "A07",
    "Insecure Deserialization": "A08",
    "Observability Failures": "A09",
    "Miscellaneous": "-",
}
# Individual challenges that fit a different category better than their Juice Shop category.
CHALLENGE_OVERRIDES = {
    "errorHandlingChallenge": "A10",
}

OWASP_NAMES = {
    "A01": "Broken Access Control",
    "A02": "Security Misconfiguration",
    "A03": "Software Supply Chain Failures",
    "A04": "Cryptographic Failures",
    "A05": "Injection",
    "A06": "Insecure Design",
    "A07": "Authentication Failures",
    "A08": "Software or Data Integrity Failures",
    "A09": "Security Logging & Alerting Failures",
    "A10": "Mishandling of Exceptional Conditions",
    "-": "Not mapped",
}


def owasp_of(challenge):
    return CHALLENGE_OVERRIDES.get(challenge["key"]) or CATEGORY_TO_OWASP.get(challenge["category"], "-")


def request(path, method="GET"):
    req = urllib.request.Request(BASE_URL + path, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.URLError as e:
        if isinstance(e, urllib.error.HTTPError):
            return None
        sys.exit(f"Juice Shop is not reachable at {BASE_URL}. Run 'docker compose up -d' first. ({e.reason})")


def fetch_challenges():
    return json.loads(request("/api/Challenges"))["data"]


def cmd_save(name):
    out = PROGRESS_DIR / f"{name.lower()}.json"
    my_previous = set()
    # Juice Shop forgets everything on restart: re-apply my previous save first so saving is cumulative.
    if out.exists():
        previous = json.loads(out.read_text(encoding="utf-8"))
        my_previous = {s["key"] for s in previous["solved"]}
        request(f"/rest/continue-code/apply/{previous['continue_code']}", method="PUT")

    # After a `load`, the instance also contains teammates' solves. Juice Shop cannot tell who solved
    # what, so challenges already credited to someone else are not credited to me again.
    others = set()
    for f in PROGRESS_DIR.glob("*.json"):
        if f != out:
            others |= {s["key"] for s in json.loads(f.read_text(encoding="utf-8"))["solved"]}
    others -= my_previous

    challenges = fetch_challenges()
    skipped = [c["name"] for c in challenges if c["solved"] and c["key"] in others]
    challenges = [c for c in challenges if c["key"] not in others]
    code = json.loads(request("/rest/continue-code"))["continueCode"]
    version = json.loads(request("/rest/admin/application-version"))["version"]
    solved = [
        {
            "key": c["key"],
            "name": c["name"],
            "category": c["category"],
            "owasp": owasp_of(c),
            "difficulty": c["difficulty"],
        }
        for c in challenges
        if c["solved"]
    ]
    PROGRESS_DIR.mkdir(exist_ok=True)
    data = {
        "member": name,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "juice_shop_version": version,
        "continue_code": code,
        "solved_count": len(solved),
        "solved": sorted(solved, key=lambda s: (s["owasp"], s["name"])),
    }
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Saved {len(solved)} solved challenges to {out.relative_to(PROGRESS_DIR.parent)}")
    if skipped:
        print(f"Not credited to {name} (already in teammates' files): {', '.join(skipped)}")
    print("Commit this file so the team can see it.")


def load_files(names):
    files = [PROGRESS_DIR / f"{n.lower()}.json" for n in names] if names else sorted(PROGRESS_DIR.glob("*.json"))
    result = []
    for f in files:
        if not f.exists():
            sys.exit(f"No progress file: {f.name}")
        result.append(json.loads(f.read_text(encoding="utf-8")))
    return result


def cmd_load(names):
    entries = load_files(names)
    if not entries:
        sys.exit("No progress files in progress/.")
    for e in entries:
        body = request(f"/rest/continue-code/apply/{e['continue_code']}", method="PUT")
        msg = json.loads(body)["data"] if body else "invalid code (different Juice Shop version?)"
        print(f"{e['member']:<10} {msg}")
    print("Reload the Score Board in your browser to see the result.")


def cmd_status():
    entries = load_files([])
    if not entries:
        sys.exit("No progress files in progress/. Use 'save <name>' first.")

    totals = None
    try:
        totals = defaultdict(int)
        for c in fetch_challenges():
            totals[owasp_of(c)] += 1
    except SystemExit:
        totals = None  # Juice Shop not running: show counts without totals

    members = [e["member"] for e in entries]
    by_owasp = defaultdict(dict)
    for e in entries:
        for s in e["solved"]:
            by_owasp[s["owasp"]].setdefault(s["key"], set()).add(e["member"])

    header = f"{'OWASP':<6}{'Category':<40}{'Team':>8}  " + "".join(f"{m[:8]:>9}" for m in members)
    print(header)
    print("-" * len(header))
    for code in OWASP_NAMES:
        solved_keys = by_owasp.get(code, {})
        team = f"{len(solved_keys)}/{totals[code]}" if totals else str(len(solved_keys))
        per_member = "".join(
            f"{sum(1 for who in solved_keys.values() if m in who):>9}" for m in members
        )
        print(f"{code:<6}{OWASP_NAMES[code]:<40}{team:>8}  {per_member}")
    print()
    for e in entries:
        print(f"{e['member']}: {e['solved_count']} solved, saved {e['saved_at']} (v{e['juice_shop_version']})")


def cmd_catalog():
    """Snapshot the challenge list so the published dashboard knows totals without a running Juice Shop."""
    challenges = fetch_challenges()
    version = json.loads(request("/rest/admin/application-version"))["version"]
    out = PROGRESS_DIR.parent / "data" / "juice-shop-challenges.json"
    out.parent.mkdir(exist_ok=True)
    data = {
        "juice_shop_version": version,
        "challenges": [
            {
                "key": c["key"],
                "name": c["name"],
                "category": c["category"],
                "owasp": owasp_of(c),
                "difficulty": c["difficulty"],
            }
            for c in sorted(challenges, key=lambda c: (owasp_of(c), c["difficulty"], c["name"]))
        ],
    }
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Saved {len(challenges)} challenges (v{version}) to {out.relative_to(PROGRESS_DIR.parent)}")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if args == ["catalog"]:
        return cmd_catalog()
    if not args or args[0] not in {"save", "load", "status"}:
        sys.exit(__doc__)
    if args[0] == "save":
        if len(args) != 2:
            sys.exit("Usage: python scripts/progress.py save <name>")
        cmd_save(args[1])
    elif args[0] == "load":
        cmd_load(args[1:])
    else:
        cmd_status()


if __name__ == "__main__":
    main()
