---
# TR: Bu dosyayi kopyala, dogru klasore koy, yeniden adlandir. '#' ile baslayan satirlar aciklamadir,
#     silebilirsin. Alan adlarini (id:, title: ...) degistirme, sadece degerlerini yaz.
#     Adim adim: BASLANGIC.md -> 4. Bulgu ekleme
# Copy this file to findings/juice-shop/ or findings/portswigger/ and rename:
#   JS-A05-001-login-sqli.md   (Juice Shop)
#   PS-A05-001-sqli-union.md   (PortSwigger)
id: JS-A05-001
title: SQL injection in login form
source: juice-shop            # juice-shop | portswigger
target: "Juice Shop v__ / POST /rest/user/login"   # for PortSwigger: lab name + URL
owasp: A05                    # A01..A10 (OWASP Top 10:2025)
cwe: CWE-89
severity: critical            # critical | high | medium | low | info
cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N"
cvss_score: 9.1
tester: name-surname
tools: DevTools, Burp Repeater   # what you used: DevTools, Burp, ZAP, curl ...
date: 2026-10-01
status: confirmed             # draft | confirmed | reviewed
evidence:
  - evidence/juice-shop/JS-A05-001-1.png
---

## Summary
One or two sentences: what is vulnerable and why it matters.

## Attack concept
How this class of vulnerability works in general (2–4 sentences, own words).

## Steps to reproduce
1. Start Juice Shop locally (`docker compose up -d`) and open http://127.0.0.1:3000
   (mention the tool for each step, e.g. "DevTools → Network", "Burp Repeater")
2. ...
3. ...

Payload / request used:
```http
POST /rest/user/login HTTP/1.1
Host: 127.0.0.1:3000
Content-Type: application/json

{"email":"' OR 1=1--","password":"x"}
```

## Evidence
![Step 1](../../evidence/juice-shop/JS-A05-001-1.png)

## Impact
What an attacker gains (confidentiality / integrity / availability). Justify the CVSS score.

## Detection
How a defender or tester would notice this (manual test, scanner, logs, code review).

## Mitigation
Concrete fix (e.g. parameterized queries) + reference to OWASP Cheat Sheet.

## References
- OWASP Top 10:2025 – A05 Injection
- OWASP Cheat Sheet: ...
