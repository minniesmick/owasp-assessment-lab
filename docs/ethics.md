# Ethical Boundaries

- All testing is performed only against:
  - OWASP Juice Shop running locally in Docker, bound to `127.0.0.1`
  - PortSwigger Web Security Academy labs (targets explicitly provided for training)
- No scanning, probing or testing of any other system, including university infrastructure or public websites.
- No real user data is collected. Juice Shop accounts are the app's built-in test data.
- Scanners (e.g. ZAP) are pointed only at `http://127.0.0.1:3000`.
- The team's own proxy (`tools/scoped-proxy/`) enforces this boundary in code: it can only connect to `127.0.0.1:3000`,
  and its automated test suite (`pytest`, run locally against Juice Shop) shows that escape attempts never reach any other address.
- Findings are reported for learning purposes; no exploit code is published beyond what is needed to document a finding.
