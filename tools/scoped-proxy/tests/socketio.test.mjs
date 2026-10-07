// Tests for ui/static/socketio.js. Run: node --test tests/socketio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../ui/static/socketio.js');
const RS = '\u001e';
const rec = (o) => ({ id: 'r1', method: 'GET', created_at: '2026-10-01T10:00:00+00:00', request_body: '', response_body: '', ...o });

test('v4 payload is split on the record separator, v3 on length prefixes', () => {
  assert.deepEqual(S.splitPayload(`40${RS}42["a",1]`), ['40', '42["a",1]']);
  assert.deepEqual(S.splitPayload('2:40' + '9:42["a",1]'), ['40', '42["a",1]']);
  assert.deepEqual(S.splitPayload(''), []);
});

test('open packet exposes sid and upgrades', () => {
  const ev = S.decodePacket('0{"sid":"abc","upgrades":["websocket"],"pingInterval":25000}');
  assert.equal(ev.kind, 'open');
  assert.equal(ev.detail.sid, 'abc');
  assert.match(S.preview(ev), /sid abc, upgrades: websocket/);
});

test('event with namespace and ack id', () => {
  const ev = S.decodePacket('42/admin,17["hello",{"x":1},"y"]');
  assert.equal(ev.kind, 'event');
  assert.equal(ev.name, 'hello');
  assert.equal(ev.ns, '/admin');
  assert.equal(ev.ackId, '17');
  assert.deepEqual(ev.args, [{ x: 1 }, 'y']);
});

test('challenge solved is summarised by challenge name', () => {
  const ev = S.decodePacket('42["challenge solved",{"challenge":"Score Board","hidden":false}]');
  assert.equal(S.label(ev), 'challenge solved');
  assert.equal(S.preview(ev), 'challenge: Score Board');
  assert.equal(S.preview(S.decodePacket('42["x",{"challenge":{"name":"DOM XSS"}}]')), 'challenge: DOM XSS');
});

test('connect, ack, heartbeat and junk', () => {
  assert.equal(S.decodePacket('40{"sid":"s1"}').kind, 'connect');
  assert.equal(S.decodePacket('43/n,5["ok"]').kind, 'ack');
  assert.ok(S.isHeartbeat(S.decodePacket('2')) && S.isHeartbeat(S.decodePacket('3')) && S.isHeartbeat(S.decodePacket('6')));
  assert.equal(S.decodePacket('42[not json').kind, 'malformed');
  assert.equal(S.decodePacket('9zzz').kind, 'malformed');
  assert.equal(S.decodePacket('bAAEC').kind, 'binary');
});

test('extract reads server packets from GET responses and browser packets from POST bodies', () => {
  const events = S.extract([
    rec({ id: 'r2', method: 'POST', url: 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling&sid=s1', created_at: '2026-10-01T10:00:02+00:00', request_body: '42["notification",{"a":1}]' }),
    rec({ id: 'r1', url: 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling', response_body: `0{"sid":"s1","upgrades":[]}${RS}40` }),
    rec({ id: 'r3', url: 'http://127.0.0.1:3000/rest/products', response_body: '42["not","socket"]' }),
  ]);
  assert.deepEqual(events.map((e) => `${e.dir}:${S.label(e)}`), ['in:open', 'in:connect', 'out:notification']);
  assert.ok(events.every((e) => e.recordId !== 'r3'));
});

test('websocket upgrade is reported but its frames are not invented', () => {
  const [ev] = S.extract([rec({ url: 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=websocket&sid=s1' })]);
  assert.equal(ev.kind, 'upgrade-request');
  assert.match(ev.preview, /not captured/);
});

test('hostile payloads stay data', () => {
  const ev = S.decodePacket('42["<img src=x onerror=alert(1)>",{"__proto__":{"polluted":true}}]');
  assert.equal(ev.name, '<img src=x onerror=alert(1)>');
  assert.equal({}.polluted, undefined);
  assert.equal(S.extract([rec({ url: 'not a url', response_body: '40' })]).length, 0);
});
