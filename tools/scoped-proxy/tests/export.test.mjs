// Tests for the evidence export and "Copy as Python" helpers in ui/static/report.js. Run: node --test tests/export.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../ui/static/report.js');

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64u({ alg: 'HS256' })}.${b64u({ sub: '1' })}.c2ln`;

test('evidence has a request block and a response block, JSON pretty-printed', () => {
  const md = R.buildEvidence({
    requestBlock: 'GET /rest/products/search?q=a HTTP/1.1\nHost: 127.0.0.1:3000',
    status: 200, responseHeaders: { 'content-type': 'application/json' }, responseBody: '{"status":"success","data":[1]}',
  });
  assert.match(md, /\*\*Request\*\*\n\n```http\nGET \/rest\/products\/search\?q=a HTTP\/1\.1/);
  assert.match(md, /\*\*Response\*\* \(HTTP 200\)/);
  assert.match(md, /content-type: application\/json\n\n\{\n  "status": "success"/);
});

test('evidence without a response says so, and a long body is truncated', () => {
  assert.match(R.buildEvidence({ requestBlock: 'GET / HTTP/1.1', status: null }), /none captured/);
  const md = R.buildEvidence({ requestBlock: 'GET / HTTP/1.1', status: 200, responseHeaders: {}, responseBody: 'x'.repeat(5000) });
  assert.match(md, /truncated, 5000 characters in total/);
  assert.ok(md.length < 3000);
});

test('a body with backticks cannot close the code block early', () => {
  const md = R.buildEvidence({ requestBlock: 'GET / HTTP/1.1', status: 200, responseHeaders: {}, responseBody: '```\n# not a heading' });
  assert.match(md, /````http\nHTTP 200\n\n```\n# not a heading\n````/);
});

test('masked record: no JWT or cookie value reaches the evidence or the script', () => {
  const rec = R.maskRecord({
    method: 'GET', url: `http://127.0.0.1:3000/rest/user/whoami?token=${JWT}`,
    request_headers: { Authorization: `Bearer ${JWT}`, Cookie: `token=${JWT}` },
    request_body: '', response_headers: { 'Set-Cookie': 'sid=abc; Path=/' }, response_body: JSON.stringify({ authentication: { token: JWT } }),
  });
  const md = R.buildEvidence({ requestBlock: `${rec.method} ${rec.url}\nAuthorization: ${rec.request_headers.Authorization}`, status: 200,
    responseHeaders: rec.response_headers, responseBody: rec.response_body });
  const script = R.buildPython({ method: rec.method, url: rec.url, headers: rec.request_headers, body: rec.request_body });
  for (const out of [md, script]) {
    assert.ok(!out.includes(JWT), 'JWT leaked');
    assert.ok(!out.includes('sid=abc'), 'cookie value leaked');
  }
  assert.match(script, /Secrets are masked as \[masked\]/);
});

test('python script: valid literals, body encoded, no body means no data argument', () => {
  const post = R.buildPython({
    method: 'post', url: 'http://127.0.0.1:3000/rest/user/login',
    headers: { 'Content-Type': 'application/json' }, body: '{"email":"a\'b@x.y","password":"p\\"q"}\n',
  });
  assert.match(post, /^import requests\n\nurl = "http:\/\/127\.0\.0\.1:3000\/rest\/user\/login"\nheaders = \{\n    "Content-Type": "application\/json",\n\}/);
  assert.match(post, /data = "\{\\"email\\":\\"a'b@x\.y\\",\\"password\\":\\"p\\\\\\"q\\"\}\\n"\.encode\("utf-8"\)/);
  assert.match(post, /requests\.request\("POST", url, headers=headers, data=data, timeout=10\)/);
  assert.ok(!post.includes('Secrets are masked'));
  const get = R.buildPython({ method: 'GET', url: 'http://127.0.0.1:3000/', headers: {}, body: '' });
  assert.match(get, /headers = \{\}/);
  assert.ok(!get.includes('data'));
});

test('python export refuses anything but the lab target', () => {
  for (const url of ['http://example.com/', 'http://127.0.0.1:3001/x', 'http://127.0.0.1:3000.evil.example/', 'https://127.0.0.1:3000/', '/rest/x']) {
    assert.throws(() => R.buildPython({ method: 'GET', url, headers: {}, body: '' }), /local Juice Shop/, url);
  }
});

test('method is reduced to letters so it cannot break out of the string', () => {
  const s = R.buildPython({ method: 'GET", x=__import__("os")#', url: 'http://127.0.0.1:3000/', headers: {}, body: '' });
  assert.match(s, /requests\.request\("GETXIMPORTOS"|requests\.request\("[A-Z]+", url/);
  assert.ok(!s.includes('__import__'));
});
