# Methodology (working notes → paper section)

## Environment
- Juice Shop version: _fill in_
- Host OS / Docker version: _fill in per tester_
- Tools: Burp Suite Community, browser DevTools, OWASP ZAP (optional)

## Process
1. Pick OWASP category → read related PortSwigger material.
2. Explore Juice Shop for that category; use the score board challenges as hints.
3. Document each confirmed issue with `findings/_TEMPLATE.md`.
4. Score with CVSS 3.1 (https://www.first.org/cvss/calculator/3.1).
5. Peer review: another member reproduces the finding before `status: reviewed`.

## Risk classification
| Severity | CVSS |
|---|---|
| Critical | 9.0–10.0 |
| High | 7.0–8.9 |
| Medium | 4.0–6.9 |
| Low | 0.1–3.9 |
