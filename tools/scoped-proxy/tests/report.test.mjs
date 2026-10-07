// Tests for ui/static/report.js. Run: node --test tests/report.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../ui/static/report.js');

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64u({ alg: 'HS256' })}.${b64u({ sub: '1' })}.c2ln`;
const frontKeys = (md) => md.split('---')[1].split('\n').filter((l) => /^[a-z_]+:/.test(l)).map((l) => l.split(':')[0]);

test('credential headers are masked, other headers kept', () => {
  const out = R.maskHeaders({
    Authorization: `Bearer ${JWT}`, Cookie: 'token=abc; language=en', 'Set-Cookie': 'sid=xyz; Path=/; HttpOnly',
    Accept: 'application/json', 'X-Api-Key': 'k',
  });
  assert.equal(out.Authorization, 'Bearer [masked]');
  assert.equal(out.Cookie, 'token=[masked]; language=[masked]');
  assert.equal(out['Set-Cookie'], 'sid=[masked]; Path=/; HttpOnly');
  assert.equal(out.Accept, 'application/json');
  assert.equal(out['X-Api-Key'], '[masked]');
});

test('JWTs are masked in other headers, bodies and URLs; secret query values too', () => {
  assert.equal(R.maskJwts(`{"token":"${JWT}"}`), '{"token":"[masked]"}');
  assert.equal(R.maskUrl(`http://127.0.0.1:3000/x?token=abc123&q=apple`), 'http://127.0.0.1:3000/x?token=[masked]&q=apple');
  const r = R.maskRecord({ url: '/a', request_headers: { 'X-Foo': JWT }, response_headers: {}, request_body: '', response_body: `{"jwt":"${JWT}"}` });
  assert.ok(!JSON.stringify(r).includes(JWT));
});

test('maskRecord leaves the original record untouched and keeps login payloads readable', () => {
  const rec = { url: '/rest/user/login', request_headers: { Authorization: `Bearer ${JWT}` }, response_headers: {}, request_body: '{"email":"a\' OR 1=1--","password":"x"}', response_body: '' };
  const copy = R.maskRecord(rec);
  assert.equal(rec.request_headers.Authorization, `Bearer ${JWT}`);
  assert.equal(copy.request_body, rec.request_body);
});

test('fence is longer than any backtick run in the content', () => {
  assert.equal(R.fence('plain', 'http'), '```http\nplain\n```');
  const f = R.fence('a ```` b', '');
  assert.ok(f.startsWith('`````\n') && f.endsWith('\n`````'));
});

test('slugify and file name', () => {
  assert.equal(R.slugify('SQL injection in the Login form!'), 'sql-injection-in-the-login-form');
  assert.equal(R.slugify('Çok güvenli değil'), 'cok-guvenli-degil');
  assert.equal(R.slugify(''), '');
});

const fields = { owasp: 'A05', title: 'SQL injection in login', cwe: 'CWE-89', tester: 'Alper Yusuf Yaman', tools: 'Scoped Proxy', num: '2', date: '2026-10-07' };
const ctx = { method: 'POST', path: '/rest/user/login', requestBlock: 'POST /rest/user/login HTTP/1.1\nHost: 127.0.0.1:3000', status: 200, responseHead: 'Content-Type: application/json', responseBody: '{"ok":true}' };

test('finding draft uses the template field names, in the same order', () => {
  const tpl = readFileSync(new URL('../../../findings/_TEMPLATE.md', import.meta.url), 'utf8');
  const { markdown, fileName, id } = R.buildFinding(fields, ctx);
  assert.deepEqual(frontKeys(markdown), frontKeys(tpl));
  assert.equal(id, 'JS-A05-002');
  assert.equal(fileName, 'JS-A05-002-sql-injection-in-login.md');
  assert.match(markdown, /^target: "Juice Shop v20\.2\.0 \/ POST \/rest\/user\/login"$/m);
  assert.match(markdown, /^status: draft$/m);
  assert.match(markdown, /^- OWASP Top 10:2025 - A05 Injection$/m);
  // same section order as the template
  const heads = (s) => [...s.matchAll(/^## .+$/gm)].map((m) => m[0]);
  assert.deepEqual(heads(markdown), heads(tpl));
});

test('the draft never invents severity or CVSS and flags what is left to do', () => {
  const { markdown } = R.buildFinding(fields, ctx);
  assert.match(markdown, /^severity: TODO/m);
  assert.match(markdown, /^cvss_vector: "CVSS:3\.1\/TODO"/m);
  assert.ok((markdown.match(/TODO/g) || []).length >= 8);
});

test('unknown category and long responses are handled', () => {
  const long = R.buildFinding({ ...fields, owasp: '', cwe: 'nope' }, { ...ctx, responseBody: 'x'.repeat(5000) });
  assert.match(long.id, /^JS-A0X-002$/);
  assert.match(long.markdown, /^cwe: CWE-0$/m);
  assert.match(long.markdown, /truncated, 5000 characters/);
  assert.ok(long.markdown.length < 4500);
});

test('a response containing code fences cannot break out of the block', () => {
  const { markdown } = R.buildFinding(fields, { ...ctx, responseBody: '```\n## Injected heading\n```' });
  const section = markdown.split('Response observed:')[1].split('## Evidence')[0];
  assert.match(section, /````http/);
});

test('title is kept on one line in the front matter', () => {
  const { markdown } = R.buildFinding({ ...fields, title: 'line one\nline two' }, ctx);
  assert.match(markdown, /^title: line one line two$/m);
});
