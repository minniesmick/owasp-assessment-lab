// Tests for ui/static/checks.js. Run: node --test tests/checks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../ui/static/checks.js');

let n = 0;
const rec = (o = {}) => ({
  id: `r${(n += 1)}`, method: 'GET', url: 'http://127.0.0.1:3000/', state: 'forwarded', status_code: 200,
  request_headers: {}, request_body: '', response_headers: {}, response_body: '', ...o,
});
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (header, payload) => `${b64u(header)}.${b64u(payload)}.sig`;
const rules = (records) => C.run(records).map((o) => o.rule);
const html = { 'Content-Type': 'text/html; charset=utf-8' };

test('a hardened HTML page raises nothing', () => {
  const good = rec({ response_headers: { ...html, 'Content-Security-Policy': "default-src 'self'", 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
  assert.deepEqual(rules([good]), []);
});

test('missing security headers on HTML', () => {
  assert.deepEqual(rules([rec({ response_headers: html })]).sort(),
    ['missing-csp', 'missing-frame-protection', 'missing-nosniff', 'missing-referrer-policy'].sort());
});

test('frame-ancestors in CSP counts as frame protection; header names are case-insensitive', () => {
  const r = rec({ response_headers: { 'content-type': 'text/html', 'CONTENT-SECURITY-POLICY': "frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' } });
  assert.deepEqual(rules([r]), []);
});

test('error and asset responses do not trigger page header rules', () => {
  assert.deepEqual(rules([rec({ status_code: 404, response_headers: html })]), []);
  assert.deepEqual(rules([rec({ state: 'blocked', status_code: null })]), []);
  assert.deepEqual(rules([rec({ status_code: null })]), []);
});

test('CORS wildcard, and wildcard with credentials is more severe', () => {
  const a = C.run([rec({ response_headers: { 'Access-Control-Allow-Origin': '*' } })]);
  assert.equal(a[0].rule, 'cors-wildcard');
  const b = C.run([rec({ response_headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true' } })]);
  assert.equal(b[0].rule, 'cors-wildcard-credentials');
  assert.equal(b[0].severity, 'medium');
});

test('cookie flags name the missing attributes, per cookie', () => {
  const r = rec({ response_headers: { 'Set-Cookie': 'token=abc; Path=/' } });
  const [o] = C.run([r]);
  assert.equal(o.rule, 'cookie-flags');
  assert.match(o.detail, /HttpOnly, SameSite, Secure/);
  assert.deepEqual(rules([rec({ response_headers: { 'Set-Cookie': 'sid=1; HttpOnly; Secure; SameSite=Lax' } })]), []);
});

test('server banner only when it carries a product/version', () => {
  assert.deepEqual(rules([rec({ response_headers: { Server: 'nginx/1.25.3' } })]), ['server-banner']);
  assert.deepEqual(rules([rec({ response_headers: { Server: 'web' } })]), []);
});

test('stack traces, SQL errors and directory listings', () => {
  const stack = '<ul id="stacktrace"><li>&nbsp; &nbsp;at Layer.handle [as handle_request] (C:\\app\\node_modules\\express\\lib\\router\\layer.js:95:5)</li></ul>';
  const r1 = rec({ status_code: 500, url: 'http://127.0.0.1:3000/rest/x', response_body: stack });
  assert.deepEqual(rules([r1]), ['stack-trace']);
  assert.equal(C.run([r1])[0].owasp, 'A10');
  const r2 = rec({ status_code: 500, response_body: '{"error":{"message":"SQLITE_ERROR: near \\"x\\": syntax error"}}' });
  assert.ok(rules([r2]).includes('sql-error'));
  const r3 = rec({ url: 'http://127.0.0.1:3000/ftp', response_body: '<title>listing directory /ftp</title>' });
  assert.deepEqual(rules([r3]), ['directory-listing']);
  assert.deepEqual(rules([rec({ response_body: 'plain text, nothing to see at all' })]), []);
});

test('password hashes in API responses', () => {
  const r = rec({ response_headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }, response_body: '{"data":{"email":"a@b.c","password":"0192023a7bbd73250516f069df18b500"}}' });
  const [o] = C.run([r]);
  assert.equal(o.rule, 'hash-in-response');
  assert.match(o.detail, /32-character/);
  assert.deepEqual(rules([rec({ response_body: '{"password":"short"}' })]), []);
});

test('secrets in URLs', () => {
  assert.deepEqual(rules([rec({ url: 'http://127.0.0.1:3000/rest/x?token=abcdef123' })]), ['secret-in-url']);
  assert.deepEqual(rules([rec({ url: 'http://127.0.0.1:3000/rest/products/search?q=apple' })]), []);
});

test('JWT checks: alg none, no exp, sensitive claims', () => {
  const unsigned = jwt({ alg: 'none', typ: 'JWT' }, { data: { id: 1 } });
  const r = rec({ request_headers: { Authorization: `Bearer ${unsigned}` } });
  const got = rules([r]);
  assert.ok(got.includes('jwt-alg-none') && got.includes('jwt-no-expiry'));

  const leaky = jwt({ alg: 'RS256' }, { exp: 9999999999, data: { email: 'a@b.c', password: '0192023a7bbd73250516f069df18b500' } });
  const r2 = rec({ response_body: JSON.stringify({ authentication: { token: leaky } }) });
  const got2 = rules([r2]);
  assert.ok(got2.includes('jwt-sensitive-claims'));
  assert.ok(!got2.includes('jwt-no-expiry') && !got2.includes('jwt-alg-none'));

  const fine = jwt({ alg: 'HS256' }, { exp: 9999999999, sub: '1' });
  assert.deepEqual(rules([rec({ request_headers: { Authorization: `Bearer ${fine}` } })]), []);
});

test('observations are deduplicated and counted; most severe first', () => {
  const page = (p) => rec({ url: `http://127.0.0.1:3000${p}`, response_headers: html });
  const stack = rec({ status_code: 500, response_body: 'at Object.x (/app/server.js:10:5)' });
  const out = C.run([page('/a'), page('/b'), page('/c'), stack]);
  assert.equal(out[0].severity, 'medium');
  const csp = out.find((o) => o.rule === 'missing-csp');
  assert.equal(csp.count, 3);
  assert.equal(csp.path, '/a');
  assert.equal(out.filter((o) => o.rule === 'missing-csp').length, 1);
});

test('every rule has an OWASP 2025 category, severity, why and fix', () => {
  for (const [id, m] of Object.entries(C.RULES)) {
    assert.match(m.owasp, /^A(0[1-9]|10)$/, id);
    assert.ok(['info', 'low', 'medium'].includes(m.severity), id);
    assert.ok(m.title && m.why && m.fix, id);
  }
});
