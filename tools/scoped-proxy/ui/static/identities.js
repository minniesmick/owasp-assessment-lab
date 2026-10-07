'use strict';
// Two identities: pure helpers for replaying one request as two accounts and judging the result. No network here.
// Tokens live only in page memory (see identities-view.js) and are never written to storage.
(function (root) {
  const JWT_RE = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
  const decode = (token) => {
    const c = root.Checks || (typeof require === 'function' ? require('./checks.js') : null);
    return c ? c.decodeJwt(token) : { payload: null };
  };
  const sameJson = (a, b) => {
    const norm = (t) => { try { return JSON.stringify(JSON.parse(t)); } catch { return String(t == null ? '' : t).trim(); } };
    return norm(a) === norm(b);
  };
  const ok2xx = (r) => r && r.ok && r.status_code >= 200 && r.status_code < 300;

  // Tokens seen in captured traffic: Authorization headers and login-style response bodies. Labelled by account, never by value.
  function tokensFromHistory(records) {
    const seen = new Map();
    const add = (token, where) => {
      if (seen.has(token)) return;
      const p = decode(token).payload || {};
      const d = p.data || p;
      const who = d.email || d.username || (d.id !== undefined ? `user id ${d.id}` : '') || p.sub || 'unknown account';
      seen.set(token, { token, who: String(who), where, hint: `…${token.slice(-6)}` });
    };
    for (const r of records || []) {
      const auth = Object.entries(r.request_headers || {}).find(([k]) => k.toLowerCase() === 'authorization');
      const m = auth && String(auth[1]).match(/^Bearer\s+(\S+)/i);
      if (m && m[1].split('.').length === 3) add(m[1], 'Authorization header');
      const body = r.response_body || '';
      if (/"token"\s*:\s*"eyJ/.test(body)) for (const t of body.match(JWT_RE) || []) add(t, 'login response');
    }
    return [...seen.values()];
  }

  // Headers that carry an identity. The cookie is optional: Juice Shop reads the Bearer header on most routes and the cookie on a few.
  function identityHeaders(token, { cookie = true, base = {} } = {}) {
    const h = {};
    for (const [k, v] of Object.entries(base)) if (!/^(authorization|cookie)$/i.test(k)) h[k] = v;
    if (token) {
      h.Authorization = `Bearer ${token}`;
      if (cookie) h.Cookie = `token=${token}`;
    }
    return h;
  }

  // A hint, not a verdict: the tester decides whether the data should have been visible.
  function verdict(a, b) {
    if (!a || !b || !a.ok || !b.ok) return { kind: 'error', text: 'At least one request did not complete, so there is nothing to compare.' };
    if (ok2xx(a) && ok2xx(b)) {
      return sameJson(a.body, b.body)
        ? { kind: 'same', text: 'Both identities received the same response. If this data belongs to A only, B can read it: possible broken access control (A01). Verify by hand.' }
        : { kind: 'different', text: 'Both identities succeeded but received different content. That is normal for per-user data; check what differs.' };
    }
    if (ok2xx(a) && [401, 403].includes(b.status_code)) return { kind: 'blocked', text: `B was refused with ${b.status_code}. Access control held for this request.` };
    if (a.status_code === b.status_code) return { kind: 'same-status', text: `Both identities got ${a.status_code}.` };
    return { kind: 'different-status', text: `A got ${a.status_code} and B got ${b.status_code}. Check whether B should have had access.` };
  }

  const api = { tokensFromHistory, identityHeaders, verdict, sameJson };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Identities = api;
})(typeof window !== 'undefined' ? window : globalThis);
