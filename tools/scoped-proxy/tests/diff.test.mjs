// Tests for ui/static/diff.js. Run: node --test tests/diff.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const D = require('../ui/static/diff.js');
const summary = (r) => r.ops.map((o) => (o.t === 'same' ? ' ' : o.t === 'add' ? '+' : '-') + o.text).join('|');

test('identical text has no changes', () => {
  const r = D.diffLines('a\nb\nc', 'a\nb\nc');
  assert.equal(r.added + r.removed, 0);
  assert.equal(r.ops.length, 3);
});

test('detects additions, removals and replacements', () => {
  assert.equal(summary(D.diffLines('a\nb', 'a\nb\nc')), ' a| b|+c');
  assert.equal(summary(D.diffLines('a\nb\nc', 'a\nc')), ' a|-b| c');
  assert.equal(summary(D.diffLines('a\nb\nc', 'a\nX\nc')), ' a|-b|+X| c');
  assert.equal(summary(D.diffLines('', 'x')), '+x');
  assert.equal(summary(D.diffLines('x', '')), '-x');
});

test('LCS keeps the shared lines when changes are interleaved', () => {
  const r = D.diffLines('1\n2\n3\n4\n5', '1\nB\n3\nD\n5');
  assert.equal(r.added, 2);
  assert.equal(r.removed, 2);
  assert.equal(r.ops.filter((o) => o.t === 'same').map((o) => o.text).join(''), '135');
});

test('line endings do not matter', () => {
  assert.equal(D.diffLines('a\r\nb', 'a\nb').added, 0);
});

test('huge unrelated inputs fall back to an approximate result instead of hanging', () => {
  const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n');
  const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n');
  const r = D.diffLines(a, b);
  assert.equal(r.approximate, true);
  assert.equal(r.removed, 3000);
  assert.equal(r.added, 3000);
});

test('JSON is compared by structure, not by formatting', () => {
  const r = D.compare({ status_code: 200, response_headers: {}, response_body: '{"a":1,"b":{"c":2}}' },
    { status_code: 200, response_headers: {}, response_body: '{\n "a": 1,\n "b": { "c": 2 }\n}' });
  assert.equal(r.identical, true);
  const r2 = D.compare({ status_code: 200, response_headers: {}, response_body: '{"data":{"id":1,"email":"a@b.c"}}' },
    { status_code: 200, response_headers: {}, response_body: '{"data":{"id":2,"email":"x@y.z"}}' });
  assert.equal(r2.identical, false);
  assert.equal(r2.body.added, 2);
});

test('header names are case-insensitive and noisy headers do not count', () => {
  const rows = D.diffHeaders({ 'Content-Type': 'text/html', Date: 'Mon', 'X-A': '1' }, { 'content-type': 'text/html', date: 'Tue', 'X-B': '2' });
  const byName = Object.fromEntries(rows.map((r) => [r.name.toLowerCase(), r]));
  assert.equal(byName['content-type'].kind, 'same');
  assert.equal(byName.date.kind, 'changed');
  assert.equal(byName.date.noise, true);
  assert.equal(byName['x-a'].kind, 'only-a');
  assert.equal(byName['x-b'].kind, 'only-b');
  const r = D.compare({ status_code: 200, response_headers: { Date: 'Mon' }, response_body: 'x' }, { status_code: 200, response_headers: { Date: 'Tue' }, response_body: 'x' });
  assert.equal(r.identical, true);
});

test('a different status is a difference', () => {
  const r = D.compare({ status_code: 200, response_headers: {}, response_body: 'x' }, { status_code: 403, response_headers: {}, response_body: 'x' });
  assert.equal(r.status.same, false);
  assert.equal(r.identical, false);
});

test('collapse keeps context around changes and counts the hidden lines', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `l${i}`);
  const changed = [...lines];
  changed[10] = 'CHANGED';
  const out = D.collapse(D.diffLines(lines.join('\n'), changed.join('\n')).ops, 2);
  assert.deepEqual(out.filter((o) => o.t === 'gap').map((o) => o.count), [8, 7]);
  assert.equal(out.filter((o) => o.t !== 'gap').length, 6); // two lines of context each side of the del/add pair
  assert.deepEqual(D.collapse(D.diffLines('a', 'a').ops, 2), [{ t: 'gap', count: 1 }]);
});
