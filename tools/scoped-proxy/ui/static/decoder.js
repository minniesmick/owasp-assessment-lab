'use strict';
// Decoder tab: encode / decode / hash helpers for values seen in Juice Shop traffic.
// Everything runs in the browser; nothing is sent to the proxy backend. Output is only ever written to a
// <textarea> value or textContent, never parsed as HTML. The pure functions are exported for `node --test`.
(function (root) {
  const utf8 = new TextEncoder();
  const toBytes = (s) => utf8.encode(s);
  const fromBytes = (b) => new TextDecoder('utf-8').decode(b); // lenient: invalid bytes become U+FFFD

  // ---------------------------------------------------------------- byte helpers
  const bytesToBinary = (bytes) => {
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return out;
  };
  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  function base64Decode(text) {
    let s = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const bad = s.match(/[^A-Za-z0-9+/=]/);
    if (bad) throw new Error(`Not valid Base64: unexpected character "${bad[0]}"`);
    s = s.replace(/=+$/, '');
    if (s.length % 4 === 1) throw new Error('Not valid Base64: length is impossible (1 character left over)');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  function hexDecode(text) {
    const s = text.replace(/0x|\\x|%|[\s:,;-]/gi, '');
    if (!/^[0-9a-f]*$/i.test(s)) throw new Error('Not valid hex: only 0-9 and a-f are allowed');
    if (s.length % 2) throw new Error('Not valid hex: odd number of digits');
    return Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
  }

  // ---------------------------------------------------------------- MD5 (not available in WebCrypto)
  function md5(bytes) {
    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const n = bytes.length;
    const total = (((n + 8) >>> 6) + 1) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[n] = 0x80;
    const view = new DataView(buf.buffer);
    view.setUint32(total - 8, (n << 3) >>> 0, true);
    view.setUint32(total - 4, Math.floor(n / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let off = 0; off < total; off += 64) {
      const M = new Uint32Array(16);
      for (let j = 0; j < 16; j += 1) M[j] = view.getUint32(off + j * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i += 1) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D; D = C; C = B;
        const s = S[((i >> 4) << 2) + (i & 3)];
        B = (B + (((F << s) | (F >>> (32 - s))) >>> 0)) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16);
    const ov = new DataView(out.buffer);
    [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
    return toHex(out);
  }

  async function subtleHash(name, text) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('Hashing needs a secure context (open the UI at http://127.0.0.1:8765)');
    return toHex(new Uint8Array(await globalThis.crypto.subtle.digest(name, toBytes(text))));
  }

  // ---------------------------------------------------------------- text codecs
  const HTML_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®' };
  const htmlDecode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return Object.prototype.hasOwnProperty.call(HTML_NAMED, e.toLowerCase()) ? HTML_NAMED[e.toLowerCase()] : m;
  });
  const htmlEncode = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const unicodeEncode = (s) => Array.from({ length: s.length }, (_, i) => {
    const u = s.charCodeAt(i);
    return u > 127 ? `\\u${u.toString(16).padStart(4, '0')}` : s[i];
  }).join('');
  const unicodeDecode = (s) => s.replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (m, a, b, c) => {
    const cp = parseInt(a || b || c, 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });

  const rot13 = (s) => s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

  const urlDecode = (s) => {
    try { return decodeURIComponent(s); } catch {
      return s.replace(/(?:%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch { return m; } });
    }
  };

  // ---------------------------------------------------------------- JWT (decode only, never verified)
  const JWT_RE = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/;
  const findJwt = (text) => { const m = String(text || '').match(JWT_RE); return m ? m[0] : null; };

  function jwtDecode(input) {
    const token = findJwt(input);
    if (!token) throw new Error('No JWT found (expected something like eyJ….eyJ….signature)');
    const parts = token.split('.');
    const pretty = (part) => {
      const text = fromBytes(base64Decode(part));
      try { return { text: JSON.stringify(JSON.parse(text), null, 2), json: JSON.parse(text) }; } catch { return { text, json: null }; }
    };
    const header = pretty(parts[0]);
    const payload = pretty(parts[1]);
    const notes = [];
    if (header.json && String(header.json.alg).toLowerCase() === 'none') notes.push('alg is "none": the token is unsigned.');
    if (!parts[2]) notes.push('There is no signature part.');
    if (payload.json) {
      for (const k of ['iat', 'nbf', 'exp']) {
        if (typeof payload.json[k] === 'number') notes.push(`${k}: ${new Date(payload.json[k] * 1000).toISOString()}`);
      }
    }
    notes.push('The signature is not verified here.');
    return `Header\n${header.text}\n\nPayload\n${payload.text}\n\nSignature\n${parts[2] || '(none)'}\n\nNotes\n${notes.map((n) => `- ${n}`).join('\n')}`;
  }

  // ---------------------------------------------------------------- operation table
  const OPS = [
    { id: 'url-enc', group: 'Encode', label: 'URL encode', run: (s) => encodeURIComponent(s) },
    { id: 'url-enc-all', group: 'Encode', label: 'URL encode (every byte)', run: (s) => Array.from(toBytes(s), (b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`).join('') },
    { id: 'b64-enc', group: 'Encode', label: 'Base64 encode', run: (s) => btoa(bytesToBinary(toBytes(s))) },
    { id: 'b64url-enc', group: 'Encode', label: 'Base64URL encode', run: (s) => btoa(bytesToBinary(toBytes(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') },
    { id: 'hex-enc', group: 'Encode', label: 'Hex encode', run: (s) => toHex(toBytes(s)) },
    { id: 'html-enc', group: 'Encode', label: 'HTML entities encode', run: htmlEncode },
    { id: 'uni-enc', group: 'Encode', label: 'Unicode escape (\\uXXXX)', run: unicodeEncode },
    { id: 'rot13', group: 'Encode', label: 'ROT13 (encodes and decodes)', run: rot13 },
    { id: 'url-dec', group: 'Decode', label: 'URL decode', run: urlDecode },
    { id: 'b64-dec', group: 'Decode', label: 'Base64 / Base64URL decode', run: (s) => fromBytes(base64Decode(s)) },
    { id: 'hex-dec', group: 'Decode', label: 'Hex decode', run: (s) => fromBytes(hexDecode(s)) },
    { id: 'html-dec', group: 'Decode', label: 'HTML entities decode', run: htmlDecode },
    { id: 'uni-dec', group: 'Decode', label: 'Unicode unescape', run: unicodeDecode },
    { id: 'jwt-dec', group: 'Decode', label: 'JWT decode (header, payload)', run: jwtDecode },
    { id: 'md5', group: 'Hash', label: 'MD5', run: (s) => md5(toBytes(s)) },
    { id: 'sha1', group: 'Hash', label: 'SHA-1', run: (s) => subtleHash('SHA-1', s) },
    { id: 'sha256', group: 'Hash', label: 'SHA-256', run: (s) => subtleHash('SHA-256', s) },
    { id: 'sha512', group: 'Hash', label: 'SHA-512', run: (s) => subtleHash('SHA-512', s) },
  ];
  const byId = Object.fromEntries(OPS.map((o) => [o.id, o]));

  async function apply(id, input) {
    const op = byId[id];
    if (!op) return { ok: false, error: 'Unknown operation' };
    try {
      const output = String(await op.run(String(input ?? '')));
      const note = op.group === 'Decode' && output.includes('�') ? 'Contains bytes that are not valid UTF-8 (shown as �).' : '';
      return { ok: true, output, note };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Which decode operations plausibly fit this input? Ordered, most specific first.
  function detect(input) {
    const t = String(input ?? '').trim();
    if (!t) return [];
    const found = [];
    if (findJwt(t)) found.push('jwt-dec');
    if (/%[0-9a-f]{2}/i.test(t)) found.push('url-dec');
    if (/&(#x?[0-9a-f]+|[a-z]+);/i.test(t)) found.push('html-dec');
    if (/\\u[0-9a-f]{4}|\\u\{[0-9a-f]+\}|\\x[0-9a-f]{2}/i.test(t)) found.push('uni-dec');
    if (/^(?:0x)?(?:[0-9a-f]{2}[\s:,-]?)+$/i.test(t) && t.replace(/0x|[\s:,-]/gi, '').length % 2 === 0) found.push('hex-dec');
    if (/^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(t.replace(/\s+/g, ''))) {
      try {
        const text = fromBytes(base64Decode(t));
        const printable = Array.from(text).filter((c) => c >= ' ' && c !== '�' || c === '\n' || c === '\t').length;
        if (text.length && printable / text.length >= 0.85) found.push('b64-dec');
      } catch { /* not base64 */ }
    }
    return found;
  }

  const api = { OPS, apply, detect, findJwt, md5, base64Decode, hexDecode, htmlDecode, rot13 };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  // ---------------------------------------------------------------- UI (browser only)
  const $ = (s) => document.querySelector(s);
  const ui = { chain: [], token: 0 };

  function populate() {
    const select = $('#dec-op');
    ['Encode', 'Decode', 'Hash'].forEach((group) => {
      const og = document.createElement('optgroup');
      og.label = group;
      OPS.filter((o) => o.group === group).forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label;
        og.appendChild(opt);
      });
      select.appendChild(og);
    });
    try { const saved = localStorage.getItem('scoped-proxy.decoderOp'); if (saved && byId[saved]) select.value = saved; } catch { /* ignore */ }
  }

  function renderSuggestions() {
    const box = $('#dec-suggest');
    box.replaceChildren();
    const ids = detect($('#dec-input').value);
    if (!ids.length) return;
    const label = document.createElement('span');
    label.className = 'dec-suggest-label';
    label.textContent = 'Looks like:';
    box.appendChild(label);
    ids.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dec-chip';
      b.textContent = byId[id].label;
      b.onclick = () => { $('#dec-op').value = id; run(); };
      box.appendChild(b);
    });
  }

  async function run() {
    const id = $('#dec-op').value;
    try { localStorage.setItem('scoped-proxy.decoderOp', id); } catch { /* ignore */ }
    const mine = ++ui.token;
    const result = await apply(id, $('#dec-input').value);
    if (mine !== ui.token) return; // a newer run superseded this one (hashes are async)
    const out = $('#dec-output');
    const status = $('#dec-status');
    status.classList.toggle('is-error', !result.ok);
    if (!result.ok) {
      out.value = '';
      status.textContent = result.error;
      return;
    }
    out.value = result.output;
    const steps = [...ui.chain, byId[id].label].join(' → ');
    status.textContent = `${steps} · ${result.output.length} characters${result.note ? ` · ${result.note}` : ''}`;
  }

  function open(text, opId) {
    ui.chain = [];
    $('#dec-input').value = text || '';
    const suggested = opId || detect(text)[0];
    if (suggested && byId[suggested]) $('#dec-op').value = suggested;
    if (typeof window.activate === 'function') window.activate('decoder');
    renderSuggestions();
    run();
  }

  function init() {
    populate();
    const input = $('#dec-input');
    input.oninput = () => { ui.chain = []; renderSuggestions(); run(); };
    $('#dec-op').onchange = run;
    $('#dec-swap').onclick = () => {
      const out = $('#dec-output').value;
      if (!out) return;
      ui.chain.push(byId[$('#dec-op').value].label);
      input.value = out;
      renderSuggestions();
      run();
    };
    $('#dec-clear').onclick = () => { ui.chain = []; input.value = ''; renderSuggestions(); run(); input.focus(); };
    $('#dec-copy').onclick = async () => {
      const value = $('#dec-output').value;
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        $('#dec-output').select();
        document.execCommand('copy');
      }
      if (typeof window.flash === 'function') window.flash('Output copied.');
    };
    run();
  }

  root.Decoder = { ...api, open };
  init();
})(typeof window !== 'undefined' ? window : globalThis);
