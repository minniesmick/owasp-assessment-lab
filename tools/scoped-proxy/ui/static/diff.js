'use strict';
// Response diff: compares two captured exchanges (status, headers, body). Pure functions, no network; exported for `node --test`.
(function (root) {
  // Headers that change on every response and say nothing about access control.
  const NOISE = /^(date|etag|last-modified|age|x-request-id|x-response-time|keep-alive|connection|vary|content-length)$/i;
  const MAX_CELLS = 4_000_000; // LCS table size cap (about 2000 x 2000 lines)

  function prettyJson(text) {
    const t = String(text == null ? '' : text);
    const s = t.trim();
    if (!/^[{[]/.test(s)) return t;
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return t; }
  }
  const splitLines = (text) => (text === '' ? [] : String(text).replace(/\r\n/g, '\n').split('\n'));

  // Line diff. ops: [{ t: 'same'|'del'|'add', text }]. Common prefix and suffix are trimmed first; the middle uses an LCS table.
  // When the middle is too big for the table the result is approximate (all removals, then all additions) and says so.
  function diffLines(aText, bText) {
    const a = splitLines(aText);
    const b = splitLines(bText);
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }

    const ops = a.slice(0, start).map((text) => ({ t: 'same', text }));
    const ma = a.slice(start, endA);
    const mb = b.slice(start, endB);
    let approximate = false;

    if (ma.length * mb.length > MAX_CELLS) {
      approximate = true;
      ops.push(...ma.map((text) => ({ t: 'del', text })), ...mb.map((text) => ({ t: 'add', text })));
    } else if (!ma.length || !mb.length) {
      ops.push(...ma.map((text) => ({ t: 'del', text })), ...mb.map((text) => ({ t: 'add', text })));
    } else {
      const n = ma.length;
      const m = mb.length;
      const w = m + 1;
      const table = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
          table[i * w + j] = ma[i] === mb[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (ma[i] === mb[j]) { ops.push({ t: 'same', text: ma[i] }); i += 1; j += 1; }
        else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) { ops.push({ t: 'del', text: ma[i] }); i += 1; }
        else { ops.push({ t: 'add', text: mb[j] }); j += 1; }
      }
      while (i < n) { ops.push({ t: 'del', text: ma[i] }); i += 1; }
      while (j < m) { ops.push({ t: 'add', text: mb[j] }); j += 1; }
    }
    ops.push(...a.slice(endA).map((text) => ({ t: 'same', text })));
    return {
      ops,
      approximate,
      added: ops.filter((o) => o.t === 'add').length,
      removed: ops.filter((o) => o.t === 'del').length,
    };
  }

  // Keep only changed lines plus `context` unchanged lines around them; the rest becomes { t: 'gap', count }.
  function collapse(ops, context = 3) {
    const keep = new Array(ops.length).fill(false);
    ops.forEach((o, i) => {
      if (o.t === 'same') return;
      for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k += 1) keep[k] = true;
    });
    const out = [];
    let gap = 0;
    ops.forEach((o, i) => {
      if (keep[i]) {
        if (gap) { out.push({ t: 'gap', count: gap }); gap = 0; }
        out.push(o);
      } else gap += 1;
    });
    if (gap) out.push({ t: 'gap', count: gap });
    return out;
  }

  // Header rows by case-insensitive name. kind: same | changed | only-a | only-b. noise rows do not count as differences.
  function diffHeaders(aHeaders, bHeaders) {
    const index = (h) => {
      const m = new Map();
      for (const [k, v] of Object.entries(h || {})) m.set(k.toLowerCase(), { name: k, value: String(v) });
      return m;
    };
    const A = index(aHeaders);
    const B = index(bHeaders);
    const names = [...new Set([...A.keys(), ...B.keys()])].sort();
    return names.map((key) => {
      const x = A.get(key);
      const y = B.get(key);
      const kind = !x ? 'only-b' : !y ? 'only-a' : x.value === y.value ? 'same' : 'changed';
      return { name: (x || y).name, a: x ? x.value : null, b: y ? y.value : null, kind, noise: NOISE.test(key) };
    });
  }

  function compare(ra, rb) {
    const headers = diffHeaders(ra.response_headers, rb.response_headers);
    const body = diffLines(prettyJson(ra.response_body), prettyJson(rb.response_body));
    const status = { a: ra.status_code, b: rb.status_code, same: ra.status_code === rb.status_code };
    const headerDiffs = headers.filter((h) => h.kind !== 'same' && !h.noise).length;
    const bodyDiffs = body.added + body.removed;
    return { status, headers, body, headerDiffs, bodyDiffs, identical: status.same && !headerDiffs && !bodyDiffs };
  }

  const api = { compare, diffLines, diffHeaders, collapse, prettyJson, NOISE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Diff = api;
})(typeof window !== 'undefined' ? window : globalThis);
