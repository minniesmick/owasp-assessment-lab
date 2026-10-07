// Tests for ui/static/decoder.js (pure functions). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const D = require('../ui/static/decoder.js');
const run = async (id, s) => (await D.apply(id, s));
const out = async (id, s) => { const r = await run(id, s); assert.ok(r.ok, r.error); return r.output; };
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

test('MD5 matches RFC 1321 vectors and block boundaries', () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.equal(D.md5(enc('')), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(D.md5(enc('abc')), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(D.md5(enc('message digest')), 'f96b697d7cb7938d525a2f31aaf161d0');
  assert.equal(D.md5(enc('The quick brown fox jumps over the lazy dog')), '9e107d9d372bb6826bd81d3542a419d6');
  assert.equal(D.md5(enc('1234567890'.repeat(8))), '57edf4a22be3c955ac49da2e2107b67a'); // 80 bytes: two blocks
  assert.equal(D.md5(enc('admin123')), '0192023a7bbd73250516f069df18b500'); // Juice Shop admin password hash
});

test('SHA hashes via WebCrypto', async () => {
  assert.equal(await out('sha1', 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(await out('sha256', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal((await out('sha512', 'abc')).length, 128);
  assert.equal(await out('md5', 'abc'), '900150983cd24fb0d6963f7d28e17f72');
});

test('Base64 and Base64URL', async () => {
  assert.equal(await out('b64-enc', 'hello'), 'aGVsbG8=');
  assert.equal(await out('b64-enc', '✓'), '4pyT');
  assert.equal(await out('b64url-enc', '??>'), 'Pz8-');
  assert.equal(await out('b64-dec', 'aGVsbG8'), 'hello'); // missing padding
  assert.equal(await out('b64-dec', 'Pz8-'), '??>'); // url-safe alphabet
  assert.equal(await out('b64-dec', 'aGVs\nbG8='), 'hello'); // whitespace
  assert.equal((await run('b64-dec', 'a$b')).ok, false);
  assert.equal((await run('b64-dec', 'abcde')).ok, false); // impossible length
});

test('invalid UTF-8 is flagged, not hidden', async () => {
  const r = await run('b64-dec', '/w==');
  assert.ok(r.ok && r.output.includes('�') && r.note);
});

test('Hex', async () => {
  assert.equal(await out('hex-enc', 'hi'), '6869');
  assert.equal(await out('hex-dec', '0x68 69'), 'hi');
  assert.equal(await out('hex-dec', '68:69'), 'hi');
  assert.equal((await run('hex-dec', '686')).ok, false);
  assert.equal((await run('hex-dec', 'zz')).ok, false);
});

test('URL encode / decode', async () => {
  assert.equal(await out('url-enc', 'a b&c=é'), 'a%20b%26c%3D%C3%A9');
  assert.equal(await out('url-enc-all', 'A/'), '%41%2F');
  assert.equal(await out('url-dec', '%41%42'), 'AB');
  assert.equal(await out('url-dec', 'x%E0%A4%A y%41'), 'x%E0%A4%A yA'); // malformed part kept, rest decoded
});

test('HTML entities', async () => {
  assert.equal(await out('html-enc', '<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(await out('html-dec', '&lt;b&gt;&#65;&#x42;&amp;amp;&unknown;'), '<b>AB&amp;&unknown;');
  assert.equal(await out('html-dec', '&#99999999;'), '&#99999999;'); // out of range stays untouched
});

test('Unicode escapes and ROT13', async () => {
  assert.equal(await out('uni-enc', 'é€'), '\\u00e9\\u20ac');
  assert.equal(await out('uni-dec', '\\u0041\\x42\\u{1F600}'), 'AB😀');
  assert.equal(await out('rot13', 'Hello, World!'), 'Uryyb, Jbeyq!');
  assert.equal(await out('rot13', await out('rot13', 'Hello')), 'Hello');
});

test('JWT decode shows header, payload, times and the alg:none warning', async () => {
  const token = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ data: { email: 'a@b.c' }, iat: 1700000000 })}.`;
  const text = await out('jwt-dec', `Authorization: Bearer ${token}`);
  assert.match(text, /"alg": "none"/);
  assert.match(text, /"email": "a@b.c"/);
  assert.match(text, /iat: 2023-11-14T22:13:20.000Z/);
  assert.match(text, /unsigned/);
  assert.match(text, /not verified/);
  const signed = `${b64url({ alg: 'HS256' })}.${b64url({ sub: '1' })}.c2ln`;
  assert.doesNotMatch(await out('jwt-dec', signed), /unsigned/);
  assert.equal((await run('jwt-dec', 'hello')).ok, false);
});

test('findJwt only matches JWT-shaped strings', () => {
  const token = `${b64url({ alg: 'HS256' })}.${b64url({ a: 1 })}.sig`;
  assert.equal(D.findJwt(`Cookie: token=${token}; other=1`), token);
  assert.equal(D.findJwt('nothing here'), null);
});

test('detect suggests sensible operations', () => {
  const token = `${b64url({ alg: 'HS256' })}.${b64url({ a: 1 })}.sig`;
  assert.deepEqual(D.detect(''), []);
  assert.ok(D.detect(token).includes('jwt-dec'));
  assert.deepEqual(D.detect('a%20b'), ['url-dec']);
  assert.ok(D.detect('aGVsbG8gd29ybGQ=').includes('b64-dec'));
  assert.ok(D.detect('&lt;b&gt;').includes('html-dec'));
  assert.ok(D.detect('\\u0041').includes('uni-dec'));
  assert.ok(D.detect('68656c6c6f').includes('hex-dec'));
  assert.ok(!D.detect('hello world, this is plain text').includes('b64-dec'));
});

test('unknown operation is an error, not an exception', async () => {
  assert.deepEqual(await run('nope', 'x'), { ok: false, error: 'Unknown operation' });
});
