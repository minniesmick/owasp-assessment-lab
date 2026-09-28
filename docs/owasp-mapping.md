# OWASP Top 10:2025 Coverage Map

Juice Shop = primary assessment target (all 10 categories).
PortSwigger Web Security Academy = deep-dive technical evidence.

| OWASP 2025 | PortSwigger topics | Juice Shop owner | Coverage |
|---|---|---|---|
| A01 Broken Access Control | Access control / IDOR, path traversal, CSRF, CORS, SSRF | Member 2 | strong |
| A02 Security Misconfiguration | Info disclosure, XXE, Host header, web cache poisoning, clickjacking | Member 3 | strong |
| A03 Software Supply Chain Failures | — | Member 4 | Juice Shop only |
| A04 Cryptographic Failures | JWT (partial) | Member 3 | weak |
| A05 Injection | SQLi, NoSQLi, XSS, DOM-based, OS command injection, SSTI | Member 2 | strong |
| A06 Insecure Design | Business logic, race conditions, file upload | Member 4 | medium |
| A07 Authentication Failures | Authentication, OAuth, JWT | Member 2 | strong |
| A08 Software or Data Integrity Failures | Insecure deserialization, prototype pollution | Member 4 | medium |
| A09 Security Logging & Alerting Failures | — | Member 4 | Juice Shop + conceptual |
| A10 Mishandling of Exceptional Conditions | Info disclosure via error messages | Member 3 | weak |

> Some mappings are judgement calls (e.g. XXE, JWT). Justify them in the paper's methodology section.
> Update this table once the final list of solved PortSwigger labs is in.
