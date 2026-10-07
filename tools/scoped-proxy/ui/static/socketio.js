'use strict';
// socket.io reader: turns the socket.io polling requests found in the captured history into a readable event list.
// Pure functions, no network. Captured data is untrusted text: it is only parsed as JSON and shown with textContent.
// Only HTTP long-polling is visible to the proxy history; once a client upgrades to WebSocket its frames are not recorded.
(function (root) {
  const RS = '\u001e'; // engine.io v4 separates the packets of one polling payload with this character
  const ENGINE = { 0: 'open', 1: 'close', 2: 'ping', 3: 'pong', 5: 'upgrade', 6: 'noop' };
  const SIO = { 0: 'connect', 1: 'disconnect', 2: 'event', 3: 'ack', 4: 'connect_error', 5: 'event', 6: 'ack' };
  const HEARTBEAT = new Set(['ping', 'pong', 'noop']);
  const MAX_PREVIEW = 110;

  // v4: packets joined with RS. v3: "<length>:<packet>" repeated.
  function splitPayload(text) {
    const t = String(text == null ? '' : text);
    if (!t) return [];
    if (!/^\d+:/.test(t)) return t.split(RS).filter((p) => p !== '');
    const out = [];
    let i = 0;
    while (i < t.length) {
      const m = /^(\d+):/.exec(t.slice(i, i + 12));
      if (!m) { out.push(t.slice(i)); break; }
      const start = i + m[0].length;
      out.push(t.slice(start, start + Number(m[1])));
      i = start + Number(m[1]);
    }
    return out;
  }

  const parseJson = (s) => { try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: false }; } };

  // One engine.io packet -> { kind, name, args, ns, ackId, detail, raw }
  function decodePacket(packet) {
    const raw = String(packet);
    if (raw[0] === 'b') return { kind: 'binary', args: [], raw };
    const type = raw[0];
    if (type !== '4') {
      const kind = ENGINE[type];
      if (!kind) return { kind: 'malformed', args: [], raw };
      const detail = type === '0' ? parseJson(raw.slice(1)) : { ok: false };
      return { kind, args: [], detail: detail.ok ? detail.value : null, raw };
    }
    // socket.io packet inside an engine.io "message"
    let s = raw.slice(1);
    const sioType = s[0];
    const kind = SIO[sioType];
    if (!kind) return { kind: 'malformed', args: [], raw };
    s = s.slice(1);
    if (sioType === '5' || sioType === '6') s = s.replace(/^\d+-/, ''); // attachment count of binary packets
    let ns = '/';
    if (s[0] === '/') { const comma = s.indexOf(','); ns = comma < 0 ? s : s.slice(0, comma); s = comma < 0 ? '' : s.slice(comma + 1); }
    const idMatch = /^\d+/.exec(s);
    const ackId = idMatch ? idMatch[0] : null;
    if (idMatch) s = s.slice(idMatch[0].length);
    if (!s) return { kind, args: [], ns, ackId, raw };
    const data = parseJson(s);
    if (!data.ok) return { kind: 'malformed', args: [], ns, raw };
    if (kind === 'event') {
      const list = Array.isArray(data.value) ? data.value : [data.value];
      return { kind, name: String(list[0]), args: list.slice(1), ns, ackId, raw };
    }
    if (kind === 'ack') return { kind, args: Array.isArray(data.value) ? data.value : [data.value], ns, ackId, raw };
    return { kind, args: [data.value], ns, ackId, raw }; // connect / connect_error carry an object
  }

  const short = (s) => (s.length > MAX_PREVIEW ? `${s.slice(0, MAX_PREVIEW - 1)}…` : s);

  // A one-line summary for the table. "challenge solved" is the event Juice Shop sends when a challenge is completed.
  function preview(ev) {
    const first = ev.args[0];
    if (ev.kind === 'open' && ev.detail) return short(`sid ${ev.detail.sid || '?'}, upgrades: ${(ev.detail.upgrades || []).join(', ') || 'none'}`);
    if (ev.kind === 'connect' && first && typeof first === 'object') return short(`sid ${first.sid || '?'}`);
    if (first && typeof first === 'object') {
      const c = first.challenge;
      if (typeof c === 'string') return short(`challenge: ${c}`);
      if (c && typeof c.name === 'string') return short(`challenge: ${c.name}`);
    }
    if (first === undefined) return ev.kind === 'malformed' || ev.kind === 'binary' ? short(ev.raw) : '';
    return short(typeof first === 'string' ? first : JSON.stringify(first));
  }

  const pathOnly = (url) => { try { const u = new URL(url); return { path: u.pathname, query: u.searchParams }; } catch { return { path: '', query: new URLSearchParams() }; } };

  // Every event found in the history records, oldest first. `dir`: "in" = server to browser, "out" = browser to server.
  function extract(records) {
    const events = [];
    const ordered = [...(records || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    for (const r of ordered) {
      const { path, query } = pathOnly(r.url);
      if (!path.startsWith('/socket.io/')) continue;
      const base = { recordId: r.id, time: r.created_at };
      if (query.get('transport') === 'websocket') {
        events.push({ ...base, id: `${r.id}:ws`, dir: 'out', kind: 'upgrade-request', args: [], raw: '', preview: 'Browser asked to switch to WebSocket. Frames after this point are not captured.' });
        continue;
      }
      const incoming = r.method === 'GET'; // polling GET returns server packets; POST carries browser packets
      const text = incoming ? r.response_body : r.request_body;
      splitPayload(text).forEach((p, i) => {
        const ev = decodePacket(p);
        events.push({ ...base, id: `${r.id}:${i}`, dir: incoming ? 'in' : 'out', ...ev, preview: preview(ev) });
      });
    }
    return events;
  }

  const label = (ev) => ev.name || ev.kind;
  const isHeartbeat = (ev) => HEARTBEAT.has(ev.kind);

  const api = { RS, splitPayload, decodePacket, extract, preview, label, isHeartbeat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SocketIo = api;
})(typeof window !== 'undefined' ? window : globalThis);
