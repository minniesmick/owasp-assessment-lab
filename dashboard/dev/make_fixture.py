"""Generate dev/fixture.json: sample data for developing populated dashboard states.

Dev only. Loaded with `npm run dev` + `?fixture` in the URL; never included in production builds.
Every finding here is FICTIONAL sample data — do not copy it into findings/.
"""
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import cvss  # noqa: E402

random.seed(7)
team = json.loads((ROOT / "team.json").read_text(encoding="utf-8"))["members"]
catalog = json.loads((ROOT / "data" / "juice-shop-challenges.json").read_text(encoding="utf-8"))

SAMPLES = [
    ("JS", "A05", "SQL injection in login form", "CWE-89", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N", "elif", "reviewed", "DevTools, Burp Repeater"),
    ("JS", "A01", "Access to other users' baskets via ID change", "CWE-639", "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", "elif", "reviewed", "DevTools"),
    ("JS", "A05", "Reflected XSS in search parameter", "CWE-79", "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", "elif", "confirmed", "DevTools"),
    ("JS", "A07", "Admin password guessable by brute force", "CWE-521", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "elif", "confirmed", "ZAP Fuzzer"),
    ("JS", "A02", "Exposed FTP directory listing", "CWE-548", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N", "samed", "reviewed", "Browser"),
    ("JS", "A04", "Weak MD5 password hashes leaked via API", "CWE-328", "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", "samed", "confirmed", "DevTools, curl"),
    ("JS", "A10", "Stack trace disclosed on unhandled error", "CWE-209", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N", "samed", "draft", "curl"),
    ("JS", "A06", "Negative quantity accepted in basket", "CWE-840", "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N", "altay", "confirmed", "Burp Repeater"),
    ("JS", "A03", "Outdated dependency with known vulnerability", "CWE-1104", "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N", "altay", "draft", "npm audit"),
    ("JS", "A08", "Unsigned JWT accepted by the server", "CWE-347", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N", "altay", "confirmed", "DevTools, jwt.io"),
    ("PS", "A05", "UNION attack retrieving data from other tables", "CWE-89", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", "alper", "reviewed", "Burp Repeater"),
    ("PS", "A01", "IDOR on chat transcript download", "CWE-639", "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", "alper", "confirmed", "Burp Proxy"),
    ("PS", "A07", "Username enumeration via response timing", "CWE-204", "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N", "alper", "confirmed", "Burp Intruder"),
]

BODY = """## Summary
Sample finding used to develop the dashboard. **Fictional** — not a real result.

## Attack concept
User-controlled input reaches a sensitive operation without proper validation.

## Steps to reproduce
1. Start Juice Shop locally and open http://127.0.0.1:3000
2. Open **DevTools → Network** and repeat the request with a modified value.

```http
POST /rest/user/login HTTP/1.1
Host: 127.0.0.1:3000
Content-Type: application/json

{"email":"' OR 1=1--","password":"x"}
```

## Impact
An attacker could read or change data that belongs to other users.

## Mitigation
Use parameterized queries and enforce server-side authorization checks.
See the [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/).

<script>alert('this must be escaped, not executed')</script>
"""


def severity(score):
    return "critical" if score >= 9 else "high" if score >= 7 else "medium" if score >= 4 else "low" if score > 0 else "info"


now = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=2)
counters, findings, activity = {}, [], []
for i, (src, owasp, title, cwe, vector, member, status, tools) in enumerate(SAMPLES):
    key = (src, owasp)
    counters[key] = counters.get(key, 0) + 1
    fid = f"{src}-{owasp}-{counters[key]:03d}"
    s = cvss.score(vector)
    added = now - timedelta(days=26 - i * 2, hours=random.randint(0, 8))
    name = next(m["name"] for m in team if m["id"] == member)
    findings.append({
        "id": fid, "title": title, "source": "juice-shop" if src == "JS" else "portswigger",
        "target": "Juice Shop v20.2.0 / sample endpoint" if src == "JS" else "PortSwigger lab (sample)",
        "owasp": owasp, "cwe": cwe, "severity": severity(s["base"]), "cvssVector": vector,
        "cvssScore": s["base"], "cvss": s, "tester": name, "testerId": member,
        "tools": [t.strip() for t in tools.split(",")], "date": added.date().isoformat(), "status": status,
        "evidence": [], "file": f"findings/{'juice-shop' if src == 'JS' else 'portswigger'}/{fid}-sample.md",
        "url": "https://github.com/minniesmick/owasp-assessment-lab", "body": BODY,
    })
    base = {"findingId": fid, "title": title, "severity": severity(s["base"]), "owasp": owasp,
            "member": member, "author": member, "sha": f"{random.getrandbits(28):07x}"}
    activity.append({"type": "finding_added", "date": added.isoformat(), "status": "draft", **base})
    if status in ("confirmed", "reviewed"):
        activity.append({"type": "finding_status", "date": (added + timedelta(days=1)).isoformat(), "from": "draft", "to": "confirmed", **base})
    if status == "reviewed":
        reviewer = random.choice([m["id"] for m in team if m["id"] != member])
        when = added + timedelta(days=2, hours=3)
        activity.append({"type": "review", "date": when.isoformat(), "state": "approved", "member": reviewer,
                         "prAuthor": member, "pr": i + 2, "prTitle": f"Add {fid} {title}", "url": "https://github.com/minniesmick/owasp-assessment-lab/pulls"})
        activity.append({"type": "finding_status", "date": (when + timedelta(minutes=5)).isoformat(), "from": "confirmed", "to": "reviewed", **base})

progress = {}
for m in team:
    pool = [c for c in catalog["challenges"] if c["owasp"] in m["owasp"]] or random.sample(catalog["challenges"], 12)
    solved = random.sample(pool, k=max(1, int(len(pool) * random.uniform(0.3, 0.6))))
    progress[m["id"]] = {"savedAt": now.isoformat(), "solved": [c["key"] for c in solved]}
    for batch in range(3):
        chunk = solved[batch::3]
        if not chunk:
            continue
        by = {}
        for c in chunk:
            by[c["owasp"]] = by.get(c["owasp"], 0) + 1
        activity.append({"type": "challenges", "date": (now - timedelta(days=24 - batch * 9, hours=random.randint(0, 20))).isoformat(),
                         "sha": f"{random.getrandbits(28):07x}", "member": m["id"], "author": m["id"], "count": len(chunk),
                         "byOwasp": by, "challenges": [c["name"] for c in chunk]})

activity.sort(key=lambda e: e["date"], reverse=True)
names = {"A01": "Broken Access Control", "A02": "Security Misconfiguration", "A03": "Software Supply Chain Failures",
         "A04": "Cryptographic Failures", "A05": "Injection", "A06": "Insecure Design", "A07": "Authentication Failures",
         "A08": "Software or Data Integrity Failures", "A09": "Security Logging and Alerting Failures",
         "A10": "Mishandling of Exceptional Conditions"}
fixture = {
    "generatedAt": now.isoformat(), "repo": "minniesmick/owasp-assessment-lab",
    "commit": {"sha": "f1x7ure" + "0" * 33, "short": "fixture", "date": now.isoformat(),
               "url": "https://github.com/minniesmick/owasp-assessment-lab"},
    "juiceShopVersion": catalog["juice_shop_version"],
    "owasp": [{"code": c, "name": n} for c, n in names.items()],
    "team": [{k: m.get(k) for k in ("id", "name", "github", "role", "owasp")} for m in team],
    "challenges": catalog["challenges"], "progress": progress, "findings": findings,
    "activity": activity, "reviewsAvailable": True,
}
out = Path(__file__).with_name("fixture.json")
out.write_text(json.dumps(fixture, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"wrote {out.name}: {len(findings)} findings, {len(activity)} events")
