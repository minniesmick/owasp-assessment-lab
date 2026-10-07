'use strict';
// Passive checks: observations drawn from traffic that was already captured. Nothing here sends a request.
// They are hints to verify by hand, not confirmed vulnerabilities. Pure functions, exported for `node --test`.
(function (root) {
  const SEVERITY_ORDER = { medium: 0, low: 1, info: 2 };

  // OWASP Top 10:2025 categories used by the rules (see docs/owasp-mapping.md).
  const RULES = {
    'missing-csp': { title: 'No Content-Security-Policy on a page', owasp: 'A02', severity: 'low', why: 'A CSP limits what injected script can do (XSS impact).', fix: 'Send a Content-Security-Policy header on HTML responses.' },
    'missing-frame-protection': { title: 'Page can be framed (no X-Frame-Options / frame-ancestors)', owasp: 'A02', severity: 'low', why: 'Allows clickjacking from another site.', fix: 'Send X-Frame-Options: DENY or CSP frame-ancestors.' },
    'missing-referrer-policy': { title: 'No Referrer-Policy on a page', owasp: 'A02', severity: 'info', why: 'Full URLs may leak to other sites through the Referer header.', fix: 'Send Referrer-Policy: no-referrer or strict-origin-when-cross-origin.' },
    'missing-nosniff': { title: 'No X-Content-Type-Options: nosniff', owasp: 'A02', severity: 'low', why: 'Browsers may guess a content type and run something unexpected.', fix: 'Send X-Content-Type-Options: nosniff.' },
    'cors-wildcard': { title: 'CORS allows any origin (Access-Control-Allow-Origin: *)', owasp: 'A02', severity: 'low', why: 'Any website can read this response from a visitor\'s browser.', fix: 'Allow only the origins that need access.' },
    'cors-wildcard-credentials': { title: 'CORS allows any origin together with credentials', owasp: 'A02', severity: 'medium', why: 'Credentialed cross-origin reads from any site.', fix: 'Never combine a wildcard with Allow-Credentials; use an allow-list.' },
    'cookie-flags': { title: 'Cookie without HttpOnly / Secure / SameSite', owasp: 'A02', severity: 'low', why: 'Script can read the cookie, or it travels without protection.', fix: 'Set HttpOnly, Secure (on HTTPS) and SameSite on session cookies.' },
    'server-banner': { title: 'Server technology disclosed in a header', owasp: 'A02', severity: 'info', why: 'Product and version help an attacker pick known issues.', fix: 'Remove or genericise Server and X-Powered-By.' },
    'directory-listing': { title: 'Directory listing enabled', owasp: 'A02', severity: 'low', why: 'Lists files that were never meant to be browsed.', fix: 'Disable directory indexes; serve only intended files.' },
    'stack-trace': { title: 'Stack trace or internal path in a response', owasp: 'A10', severity: 'medium', why: 'Verbose errors reveal code structure and libraries.', fix: 'Return a generic error page; log details on the server.' },
    'sql-error': { title: 'Database error message in a response', owasp: 'A05', severity: 'medium', why: 'Often means user input reaches a query unescaped.', fix: 'Use parameterised queries and hide database errors.' },
    'jwt-alg-none': { title: 'JWT uses alg "none" (unsigned)', owasp: 'A07', severity: 'medium', why: 'Anyone can forge such a token.', fix: 'Reject unsigned tokens; pin the expected algorithm.' },
    'jwt-no-expiry': { title: 'JWT has no expiry (exp)', owasp: 'A07', severity: 'low', why: 'A stolen token stays valid forever.', fix: 'Add a short exp claim and rotate tokens.' },
    'jwt-sensitive-claims': { title: 'JWT payload carries sensitive data', owasp: 'A04', severity: 'medium', why: 'The payload is only encoded, not encrypted: anyone holding the token can read it.', fix: 'Keep secrets and hashes out of tokens; send only an id.' },
    'hash-in-response': { title: 'Password hash returned by the API', owasp: 'A04', severity: 'medium', why: 'Hashes are exposed to clients and a 32-hex value suggests MD5, which is weak.', fix: 'Never return password fields; hash with bcrypt or Argon2.' },
    'secret-in-url': { title: 'Secret-looking value in a URL query string', owasp: 'A02', severity: 'low', why: 'URLs end up in logs, history and Referer headers.', fix: 'Send secrets in headers or the body, never in the URL.' },
  };

  const header = (headers, name) => {
    if (!headers) return undefined;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === lower) return v;
    return undefined;
  };
  const pathOfUrl = (url) => { try { const u = new URL(url); return u.pathname + u.search; } catch { return String(url || ''); } };
  const pathname = (url) => { try { return new URL(url).pathname; } catch { return String(url || ''); } };
  const snippet = (text, index, len = 140) => String(text).slice(Math.max(0, index - 20), index + len).replace(/\s+/g, ' ').trim();

  const JWT_RE = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g;
  function b64urlJson(part) {
    try {
      let s = part.replace(/-/g, '+').replace(/_/g, '/');
      s += '='.repeat((4 - (s.length % 4)) % 4);
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))));
    } catch { return null; }
  }
  const decodeJwt = (token) => {
    const [h, p] = token.split('.');
    return { header: b64urlJson(h), payload: b64urlJson(p), token };
  };

  const STACK_RE = /\bat\s+[\w$.<>\[\] ]+\s+\(([^)\n]*[\\/][^)\n]*:\d+:\d+)\)|node_modules[\\/]|<ul id="stacktrace">|\bat\s+\S+\s+\(\S+:\d+:\d+\)/;
  const SQL_RE = /SQLITE_ERROR|SequelizeDatabaseError|SQLITE_CONSTRAINT|syntax error at or near|You have an error in your SQL syntax|ORA-\d{5}/;
  const LISTING_RE = /listing directory|<title>Index of |<h1>Index of /i;
  const HASH_FIELD_RE = /"(password|passwd|pwd|hash)"\s*:\s*"([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})"/i;
  const SECRET_PARAM_RE = /[?&](token|access_token|id_token|password|passwd|pwd|secret|api[_-]?key|apikey|auth|jwt)=([^&#\s]{4,})/i;
  const BANNER_RE = /[\w.-]+\/\d|\d+\.\d+/;

  function run(records) {
    const found = new Map(); // key -> observation
    const add = (rule, r, key, detail, evidence) => {
      const id = `${rule}|${key}`;
      let o = found.get(id);
      if (!o) {
        const meta = RULES[rule];
        o = { id, rule, title: meta.title, owasp: meta.owasp, severity: meta.severity, why: meta.why, fix: meta.fix, detail, evidence: evidence || '', count: 0, recordId: r.id, path: pathOfUrl(r.url), method: r.method, status: r.status_code };
        found.set(id, o);
      }
      o.count += 1;
    };

    for (const r of records || []) {
      if (!r || r.state === 'blocked' || r.status_code == null) continue;
      const ok = r.status_code >= 200 && r.status_code < 400;
      const ct = String(header(r.response_headers, 'content-type') || '');
      const isHtml = /text\/html/i.test(ct);
      const isJson = /json/i.test(ct);
      const body = r.response_body || '';
      const path = pathname(r.url);

      // --- headers on pages and API responses
      if (ok && isHtml) {
        const csp = header(r.response_headers, 'content-security-policy');
        if (!csp) add('missing-csp', r, 'site', 'HTML responses carry no Content-Security-Policy.');
        const xfo = header(r.response_headers, 'x-frame-options');
        if (!xfo && !/frame-ancestors/i.test(csp || '')) add('missing-frame-protection', r, 'site', 'Neither X-Frame-Options nor CSP frame-ancestors is sent.');
        if (!header(r.response_headers, 'referrer-policy')) add('missing-referrer-policy', r, 'site', 'No Referrer-Policy header.');
      }
      if (ok && (isHtml || isJson) && !/nosniff/i.test(String(header(r.response_headers, 'x-content-type-options') || ''))) {
        add('missing-nosniff', r, 'site', 'X-Content-Type-Options: nosniff is missing.');
      }

      const acao = header(r.response_headers, 'access-control-allow-origin');
      if (acao === '*') {
        const creds = /true/i.test(String(header(r.response_headers, 'access-control-allow-credentials') || ''));
        add(creds ? 'cors-wildcard-credentials' : 'cors-wildcard', r, 'site', 'Access-Control-Allow-Origin: *' + (creds ? ' with Allow-Credentials: true' : ''));
      }

      const cookie = header(r.response_headers, 'set-cookie');
      if (cookie) {
        const name = String(cookie).split('=')[0].trim();
        const lacking = [];
        if (!/;\s*httponly/i.test(cookie)) lacking.push('HttpOnly');
        if (!/;\s*samesite=/i.test(cookie)) lacking.push('SameSite');
        if (!/;\s*secure/i.test(cookie)) lacking.push('Secure');
        if (lacking.length) add('cookie-flags', r, name, `Cookie "${name}" is missing: ${lacking.join(', ')}.`);
      }

      for (const h of ['server', 'x-powered-by']) {
        const v = header(r.response_headers, h);
        if (v && BANNER_RE.test(String(v))) add('server-banner', r, h, `${h}: ${v}`);
      }

      // --- bodies
      if (body) {
        if (LISTING_RE.test(body)) add('directory-listing', r, path, `Directory listing at ${path}`);
        const sql = body.match(SQL_RE);
        if (sql) add('sql-error', r, path, `Database error text at ${path}`, snippet(body, sql.index));
        const stack = body.match(STACK_RE);
        if (stack) add('stack-trace', r, path, `Stack trace or internal path at ${path}`, snippet(body, stack.index));
        const hash = body.match(HASH_FIELD_RE);
        if (hash) add('hash-in-response', r, path, `Field "${hash[1]}" holds a ${hash[2].length}-character hex value.`, snippet(body, hash.index, 100));
      }

      // --- secrets in URLs
      const secret = String(r.url || '').match(SECRET_PARAM_RE);
      if (secret) add('secret-in-url', r, `${path}|${secret[1].toLowerCase()}`, `Parameter "${secret[1]}" appears in the URL of ${r.method} ${path}.`);

      // --- JWTs seen in this exchange (request headers, URL, response body)
      const haystack = [JSON.stringify(r.request_headers || {}), String(r.url || ''), body].join('\n');
      const seen = new Set();
      for (const token of haystack.match(JWT_RE) || []) {
        if (seen.has(token)) continue;
        seen.add(token);
        const { header: jh, payload } = decodeJwt(token);
        if (!jh) continue;
        if (String(jh.alg).toLowerCase() === 'none') add('jwt-alg-none', r, token.slice(0, 24), 'Token header says alg "none".');
        if (payload && payload.exp === undefined) add('jwt-no-expiry', r, 'site', 'A token without an exp claim was seen.');
        if (payload && /"(password|passwd|pwd|hash|secret|totpSecret)"\s*:/i.test(JSON.stringify(payload))) {
          add('jwt-sensitive-claims', r, 'site', 'The token payload contains a password/hash/secret-like field.', JSON.stringify(payload).slice(0, 140));
        }
      }
    }

    return [...found.values()].sort((a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count || a.rule.localeCompare(b.rule));
  }

  const api = { run, RULES, decodeJwt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Checks = api;
})(typeof window !== 'undefined' ? window : globalThis);
