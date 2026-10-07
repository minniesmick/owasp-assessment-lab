// Tests for ui/static/identities.js. Run: node --test tests/identities.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const I = require('../ui/static/identities.js');

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64u({ alg: 'HS256' })}.${b64u(payload)}.c2ln`;
const A = jwt({ data: { id: 1, email: 'admin@juice-sh.op' } });
const B = jwt({ data: { id: 2, email: 'jim@juice-sh.op' } });

test('tokens come from Authorization headers and login responses, labelled by account and de-duplicated', () => {
  const found = I.tokensFromHistory([
    { request_headers: { authorization: `Bearer ${A}` }, response_body: '' },
    { request_headers: {}, response_body: JSON.stringify({ authentication: { token: B, bid: 2 } }) },
    { request_headers: { Authorization: `Bearer ${A}` }, response_body: '' },
    { request_headers: { Authorization: 'Bearer not-a-jwt' }, response_body: '' },
  ]);
  assert.deepEqual(found.map((t) => t.who), ['admin@juice-sh.op', 'jim@juice-sh.op']);
  assert.equal(found[1].where, 'login response');
  assert.ok(found.every((t) => t.hint.length <= 7), 'hint is a short tail, not the token');
});

test('identity headers replace any identity already in the base headers', () => {
  const h = I.identityHeaders(A, { base: { 'Content-Type': 'application/json', authorization: 'Bearer old', Cookie: 'token=old' } });
  assert.equal(h.Authorization, `Bearer ${A}`);
  assert.equal(h.Cookie, `token=${A}`);
  assert.equal(h['Content-Type'], 'application/json');
  assert.ok(!('authorization' in h));
});

test('cookie is optional and an empty token means anonymous', () => {
  assert.deepEqual(Object.keys(I.identityHeaders(A, { cookie: false })), ['Authorization']);
  assert.deepEqual(I.identityHeaders('', { base: { Authorization: 'Bearer old' } }), {});
});

const res = (status, body) => ({ ok: true, status_code: status, body });

test('verdict: same content is flagged as a hint for broken access control', () => {
  const v = I.verdict(res(200, '{"a":1}'), res(200, '{ "a": 1 }'));
  assert.equal(v.kind, 'same');
  assert.match(v.text, /A01/);
});

test('verdict: refused, different content, different status, failure', () => {
  assert.equal(I.verdict(res(200, 'x'), res(403, 'no')).kind, 'blocked');
  assert.equal(I.verdict(res(200, '{"u":1}'), res(200, '{"u":2}')).kind, 'different');
  assert.equal(I.verdict(res(200, 'x'), res(404, 'no')).kind, 'different-status');
  assert.equal(I.verdict(res(401, 'x'), res(401, 'y')).kind, 'same-status');
  assert.equal(I.verdict({ ok: false }, res(200, 'x')).kind, 'error');
});
