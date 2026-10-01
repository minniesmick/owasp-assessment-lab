#!/usr/bin/env python3
"""Pull request ownership check: members may only change their own files.

Runs in CI (.github/workflows/ownership.yml) with the trusted copy of this script from the base branch.
The PR itself is only read as data (git diff / git show); nothing from it is executed.

Rules (team.json maps GitHub usernames to members):
- maintainer (member id in MAINTAINER_IDS): may change anything.
- other members may only add or change
    progress/<their-id>.json
    findings/<source>/<ID>.md       where the finding's `tester` is them
    evidence/<source>/<ID>-<n>.*     where finding <ID> is theirs
- a reviewer may change another member's finding only to set `status: reviewed` (nothing else in the file),
  and nobody may set `reviewed` on their own finding.
- an author who is not in team.json is refused (add the GitHub username to team.json first).

Usage: check_ownership.py --author <github-login> --base <ref> --head <ref>
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAINTAINER_IDS = {"alper"}

FINDING = re.compile(r"^findings/(juice-shop|portswigger)/((?:JS|PS)-A\d{2}-\d{3})-[a-z0-9-]+\.md$")
EVIDENCE = re.compile(r"^evidence/(juice-shop|portswigger)/((?:JS|PS)-A\d{2}-\d{3})-\d+\.(?:png|jpe?g|gif|webp)$")
PROGRESS = re.compile(r"^progress/([a-z0-9_-]+)\.json$")
TESTER = re.compile(r"^tester:\s*(.*?)\s*(?:#.*)?$", re.M)
STATUS = re.compile(r"^status:\s*(.*?)\s*(?:#.*)?$", re.M)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def show(ref: str, path: str) -> str | None:
    result = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT, capture_output=True, text=True)
    return result.stdout if result.returncode == 0 else None


def field(pattern: re.Pattern[str], text: str | None) -> str:
    if not text:
        return ""
    m = pattern.search(text.split("\n---", 2)[0] if text.startswith("---") else text)
    return m.group(1).strip().strip("\"'") if m else ""


def is_owner(tester: str, member: dict) -> bool:
    """`tester` is a free-text name ('Elif', 'elif-demir'): match the first word against the member's name or id."""
    first = re.split(r"[\s-]+", tester.strip().lower())[0] if tester.strip() else ""
    return first in {member["name"].lower(), member["id"].lower()}


def strip_status(text: str) -> str:
    return STATUS.sub("status:", text, count=1)


def check(author: str, changes: list[tuple[str, str]], team: list[dict], base: str, head: str) -> list[str]:
    member = next((m for m in team if (m.get("github") or "").lower() == author.lower()), None)
    if member is None:
        return [f"'{author}' is not listed in team.json. Ask Alper to add your GitHub username, then re-run this check."]
    if member["id"] in MAINTAINER_IDS:
        return []

    problems: list[str] = []
    for status, path in changes:
        if (m := PROGRESS.match(path)):
            if m.group(1) != member["id"]:
                problems.append(f"{path}: this is {m.group(1)}'s progress file; yours is progress/{member['id']}.json.")
            continue

        if (m := FINDING.match(path)):
            old, new = show(base, path), show(head, path) if status != "D" else None
            owners = {field(TESTER, t) for t in (old, new) if t}
            if all(is_owner(t, member) for t in owners):
                if new and field(STATUS, new) == "reviewed" and field(STATUS, old) != "reviewed":
                    problems.append(f"{path}: only a second member sets `status: reviewed` on your finding.")
                continue
            # someone else's finding: reviewers may only flip `status` to `reviewed`
            if status == "M" and old and new and strip_status(old) == strip_status(new) and field(STATUS, new) == "reviewed":
                continue
            problems.append(f"{path}: tester is '{', '.join(sorted(owners))}', not you. "
                            "You may only change `status` to `reviewed` on a finding you reproduced.")
            continue

        if (m := EVIDENCE.match(path)):
            def find(ref: str) -> list[str]:
                names = git("ls-tree", "-r", "--name-only", ref, f"findings/{m.group(1)}/").split("\n")
                return [f for f in names if f.startswith(f"findings/{m.group(1)}/{m.group(2)}-")]

            finding_ref = head
            matches = find(head)
            if not matches:  # deleted together with its finding: look in the base
                finding_ref, matches = base, find(base)
            if not matches:
                problems.append(f"{path}: no finding {m.group(2)} found. Add the finding in the same pull request.")
            elif not is_owner(field(TESTER, show(finding_ref, matches[0])), member):
                problems.append(f"{path}: finding {m.group(2)} belongs to someone else.")
            continue

        problems.append(f"{path}: not one of your files. Members only change their own findings, evidence and progress file; "
                        "everything else is maintained by Alper (open an issue instead).")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--author", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", required=True)
    args = ap.parse_args()

    team = json.loads((ROOT / "team.json").read_text(encoding="utf-8"))["members"]  # trusted: base branch checkout
    merge_base = git("merge-base", args.base, args.head).strip()
    changes = [tuple(line.split("\t", 1)) for line in git("diff", "--name-status", "--no-renames", f"{merge_base}...{args.head}").splitlines()]
    problems = check(args.author, changes, team, merge_base, args.head)
    if problems:
        print(f"[OWNERSHIP] {args.author}: this pull request changes files you do not own:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"Ownership OK: {args.author}, {len(changes)} changed file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
