---
id: PS-A05-001
title: SQL injection in a category filter reveals hidden products
source: portswigger
target: "PortSwigger lab: SQL injection vulnerability in WHERE clause allowing retrieval of hidden data — https://portswigger.net/web-security/sql-injection/lab-retrieve-hidden-data"
owasp: A05
cwe: CWE-89
severity: high
cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N"
cvss_score: 7.5
tester: Alper
tools: DevTools, Burp Repeater
date: 2026-09-29
status: draft
evidence:
---

> **Örnek bulgu / Example finding** — Rapor formatını ekibe göstermek için AI ile birlikte yazıldı; Alper adına bırakıldı.
> Written together with AI as a worked example of the report format, kept under Alper's name.
> `status: draft` çünkü ekran görüntüsü henüz eklenmedi; lab'ı çözen kişi kanıtı ekleyip `confirmed` yapar.

## Summary
The product category filter builds a SQL query by concatenating the `category` parameter directly into a
`WHERE` clause. Injecting SQL syntax makes the query always true, so the response returns every product,
including ones the application intended to hide (unreleased items).

## Attack concept
The application runs a query similar to:
```sql
SELECT * FROM products WHERE category = 'Gifts' AND released = 1
```
The `category` value is placed inside the quotes without parameterisation. Closing the quote and adding
`OR 1=1` makes the `WHERE` clause true for every row, and commenting out the rest with `--` drops the
`AND released = 1` restriction, so hidden products are returned as well.

## Steps to reproduce
1. Open the lab and view a product category, e.g. `GET /filter?category=Gifts`.
2. In Burp (or the browser address bar), change the `category` value to the payload below and send the request:
   ```
   /filter?category=Gifts'+OR+1=1--
   ```
   Decoded, the injected value is: `Gifts' OR 1=1--`
3. The response now lists all products, including unreleased ones, and the lab is marked solved.

## Evidence
_Attach a screenshot of the response listing the hidden products (name it `PS-A05-001-1.png`), then set
`status: confirmed` and list it under `evidence:` above._

## Impact
An attacker can bypass the intended filtering and read data the application meant to keep hidden. The same
injection point typically allows reading arbitrary tables (user credentials, etc.) via UNION-based attacks,
so confidentiality impact is High. This lab demonstrates the entry point; integrity and availability are not
affected by this specific payload.

## Detection
- Manual: append a single quote (`'`) to a parameter used in a query and watch for a 500 error or changed
  results; then confirm with `' OR 1=1--`.
- Code review: look for SQL built by string concatenation instead of parameterised queries / prepared statements.
- Automated: scanners such as Burp Scanner or sqlmap flag the injectable parameter.

## Mitigation
- Use parameterised queries (prepared statements); never concatenate user input into SQL.
- Apply least-privilege database accounts and allow-list expected values where possible.
- Reference: [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

## References
- OWASP Top 10:2025 — A05 Injection
- CWE-89: Improper Neutralization of Special Elements used in an SQL Command (SQL Injection)
- PortSwigger Web Security Academy — SQL injection, WHERE clause (retrieve hidden data)
