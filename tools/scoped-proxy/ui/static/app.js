'use strict';
// Every value that comes from captured traffic is untrusted (Juice Shop responses contain attack payloads).
// It is inserted with textContent or escaped with esc() — never as raw HTML.

const $ = (s) => document.querySelector(s);
const state = { history: [], selectedId: null, detailTab: 'request', detailKey: '', historyKey: '', filter: loadFilter(), pretty: loadPretty() };

// Per-browser convenience preferences only; storage may be unavailable.
function loadFilter() {
  try { return { q: '', hideAssets: localStorage.getItem('scoped-proxy.hideAssets') !== 'false' }; } catch { return { q: '', hideAssets: true }; }
}
function saveFilter() {
  try { localStorage.setItem('scoped-proxy.hideAssets', String(state.filter.hideAssets)); } catch { /* ignore */ }
}
function loadPretty() {
  try { return localStorage.getItem('scoped-proxy.pretty') !== 'false'; } catch { return true; }
}
function setPretty(on) {
  state.pretty = on;
  try { localStorage.setItem('scoped-proxy.pretty', String(on)); } catch { /* ignore */ }
}
const TARGET = 'http://127.0.0.1:3000';

// Common Juice Shop endpoints offered in the repeater path list, on top of paths actually seen in history.
// They are suggestions only; every request still goes through the same scope gate.
const KNOWN_PATHS = [
  '/rest/admin/application-version',
  '/rest/admin/application-configuration',
  '/rest/products/search?q=',
  '/rest/user/whoami',
  '/rest/basket/1',
  '/api/Products',
  '/api/Products/1',
  '/api/Challenges',
  '/api/Users',
  '/api/Feedbacks',
  '/api/BasketItems',
  '/rest/products/1/reviews',
  '/ftp',
  '/robots.txt',
  '/sitemap.xml',
];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function flash(msg, error = false) {
  const el = $('#flash');
  el.textContent = msg;
  el.className = 'flash' + (error ? ' error' : '');
  setTimeout(() => { el.textContent = ''; el.className = 'flash'; }, 3500);
}

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const text = await r.text();
  let d;
  try { d = JSON.parse(text); } catch { d = { detail: text }; }
  if (!r.ok) throw new Error(d.detail || 'Request failed');
  return d;
}

function parseHeaders(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf(':');
    return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1).trim()] : [x, ''];
  }));
}

const headerText = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k}: ${v}`).join('\n');

// A body is "JSON" only if it is an object/array that parses; scalars are left alone.
function asJson(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) return null;
  try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return null; }
}

// Body viewer shared by the history detail and the repeater response (view only; never reformats what is sent).
// Returns HTML with an escaped <pre>; if the body is JSON, a "Pretty / Raw" toggle (class js-pretty-toggle) is added.
function bodyBlock(text, label = 'Body') {
  const value = text || '';
  const pretty = asJson(value);
  const shown = pretty && state.pretty ? pretty : value;
  const toggle = pretty
    ? `<div class="tabs tabs-mini" role="tablist" aria-label="${esc(label)} format">`
      + `<button class="js-pretty-toggle" role="tab" data-pretty="true" aria-selected="${state.pretty}">Pretty</button>`
      + `<button class="js-pretty-toggle" role="tab" data-pretty="false" aria-selected="${!state.pretty}">Raw</button></div>`
    : '';
  return `<div class="body-head"><h3>${esc(label)}</h3>${toggle}</div><pre class="code-block">${esc(shown || '—')}</pre>`;
}

// Wire the Pretty/Raw buttons inside a just-rendered container to a re-render callback.
function wirePrettyToggle(root, rerender) {
  root.querySelectorAll('.js-pretty-toggle').forEach((b) => {
    b.onclick = () => { setPretty(b.dataset.pretty === 'true'); rerender(); };
  });
}
const stateClass = (s) => (/^[a-z]+$/.test(s) ? s : 'error');

// Status chip, coloured by class: 2xx quiet, 3xx dim, 4xx accent outline, 5xx inverted. Errors matter most in testing.
function statusChip(code) {
  if (code == null) return '<span class="status">—</span>';
  const cls = code >= 500 ? 'status-5xx' : code >= 400 ? 'status-4xx' : code >= 300 ? 'status-3xx' : 'status-2xx';
  return `<span class="status ${cls}">${esc(code)}</span>`;
}

// created_at is UTC ISO; show local HH:MM:SS and keep the full timestamp in the tooltip.
function localTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `<span>${esc(iso)}</span>`;
  const hhmmss = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `<span title="${esc(iso)}">${esc(hhmmss)}</span>`;
}

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.origin === TARGET ? u.pathname + u.search : '';
  } catch { return ''; }
}

// Split view: on wide screens the detail panel sits beside the list; below this width it opens under the selected row.
const wideLayout = window.matchMedia('(min-width: 1180px)');
const ICON_CLOSE = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8"/><path d="M12 4l-8 8"/></svg>';

const detailEl = document.getElementById('history-detail'); // moved between the side slot and the inline row
const selectedRecord = () => state.history.find((r) => r.id === state.selectedId) || null;

// Static files and the socket.io channel make up most of a page load; hidden by default so API calls stand out.
const ASSET = /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|otf|json|txt|md)$/i;
function isAsset(r) {
  const path = (pathOf(r.url) || r.url).split('?')[0];
  return path.startsWith('/socket.io/') || ASSET.test(path);
}
function visibleHistory() {
  const q = state.filter.q.trim().toLowerCase();
  return state.history.filter((r) => {
    if (state.filter.hideAssets && isAsset(r)) return false;
    if (!q) return true;
    return `${r.method} ${pathOf(r.url) || r.url} ${r.status_code ?? ''} ${r.state}`.toLowerCase().includes(q);
  });
}

function renderHistory() {
  const body = $('#history-body');
  const rowHadFocus = !!document.activeElement?.closest?.('#history-body tr');
  const focusInDetail = detailEl.contains(document.activeElement) ? document.activeElement : null;
  if (state.selectedId && !selectedRecord()) state.selectedId = null; // gone after a proxy restart
  $('#detail-slot').appendChild(detailEl); // rescue it before the rows (and an inline detail row) are removed
  body.replaceChildren();
  const rows = visibleHistory();
  $('#history-empty').classList.toggle('hidden', state.history.length > 0);
  $('#history-filtered-empty').classList.toggle('hidden', !(state.history.length > 0 && rows.length === 0));
  $('#history-count').textContent = state.history.length ? `${rows.length} of ${state.history.length}` : '';
  const counts = {};
  state.history.forEach((r) => { counts[r.state] = (counts[r.state] || 0) + 1; });
  rows.forEach((r, index) => {
    const selected = r.id === state.selectedId;
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    tr.className = selected ? 'selected' : '';
    tr.setAttribute('aria-selected', String(selected));
    tr.tabIndex = selected || (!state.selectedId && index === 0) ? 0 : -1; // roving tabindex: one tab stop for the list
    tr.innerHTML = `<td class="col-method">${esc(r.method)}${r.source === 'repeater' ? '<span class="source-tag">rep</span>' : ''}</td>`
      + `<td class="col-path" title="${esc(r.url)}">${esc(pathOf(r.url) || r.url)}</td>`
      + `<td class="col-status">${statusChip(r.status_code)}</td>`
      + `<td class="col-state"><span class="state state-${stateClass(r.state)}">${esc(r.state)}</span></td>`
      + `<td class="col-time">${esc(r.duration_ms ?? '—')} ms</td>`;
    tr.onclick = () => select(r.id === state.selectedId ? null : r.id);
    body.appendChild(tr);
    if (selected && !wideLayout.matches) {
      const row = document.createElement('tr');
      row.className = 'detail-row';
      const cell = document.createElement('td');
      cell.colSpan = visibleColumns(); // hidden columns on narrow screens must not become phantom columns
      row.appendChild(cell);
      body.appendChild(row);
    }
  });
  $('#stat-captured').textContent = state.history.length;
  $('#stat-forwarded').textContent = counts.forwarded || 0;
  $('#stat-paused').textContent = counts.paused || 0;
  placeDetail();
  renderDetail();
  if (focusInDetail && detailEl.contains(focusInDetail)) focusInDetail.focus({ preventScroll: true });
  else if (rowHadFocus) currentRow()?.focus({ preventScroll: true });
}

const visibleColumns = () => [...document.querySelectorAll('.history-table thead th')].filter((th) => getComputedStyle(th).display !== 'none').length;

const currentRow = () => (state.selectedId ? $(`#history-body tr[data-id="${CSS.escape(state.selectedId)}"]`) : null);

function placeDetail() {
  const cell = $('#history-body .detail-row td');
  if (cell) cell.appendChild(detailEl);
  detailEl.classList.toggle('hidden', !wideLayout.matches && !state.selectedId);
}

function select(id, { focus = false } = {}) {
  state.selectedId = id;
  state.detailKey = '';
  renderHistory();
  const row = currentRow();
  if (row) {
    row.scrollIntoView({ block: 'nearest' });
    if (focus) row.focus({ preventScroll: true });
  }
  detailEl.scrollTop = 0;
}

// "Copy for finding": the request in the format the finding template expects. Browser-only headers are left out
// so the block stays short; Host is always the pinned target.
const NOISE_HEADER = /^(sec-|user-agent$|accept-encoding$|accept-language$|if-none-match$|if-modified-since$|connection$|keep-alive$|cache-control$|pragma$|priority$|dnt$|upgrade-insecure-requests$|referer$|host$|content-length$|proxy-)/i;
const essentialHeaders = (r) => Object.entries(r.request_headers || {}).filter(([k]) => !NOISE_HEADER.test(k));
const targetHost = new URL(TARGET).host;

function asHttp(r) {
  const lines = [`${r.method} ${pathOf(r.url) || '/'} HTTP/1.1`, `Host: ${targetHost}`, ...essentialHeaders(r).map(([k, v]) => `${k}: ${v}`)];
  return lines.join('\n') + (r.request_body ? `\n\n${r.request_body}` : '');
}

function asCurl(r) {
  const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
  const parts = ['curl -i'];
  if (r.method !== 'GET') parts.push(`-X ${r.method}`);
  parts.push(q(TARGET + (pathOf(r.url) || '/')));
  essentialHeaders(r).forEach(([k, v]) => parts.push(`-H ${q(`${k}: ${v}`)}`));
  if (r.request_body) parts.push(`--data-raw ${q(r.request_body)}`);
  return parts.join(' \\\n  ');
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  flash(`Copied as ${label}. Browser-only headers (User-Agent, sec-*, …) were left out.`);
}

function renderDetail() {
  const d = detailEl;
  const r = selectedRecord();
  const key = r ? JSON.stringify(r) + state.detailTab + state.pretty : 'empty';
  if (key === state.detailKey) return; // unchanged: keep the reader's scroll position during live refresh
  state.detailKey = key;
  if (!r) {
    d.innerHTML = '<div class="detail-empty"><h2>No request selected</h2><p>Select a request in the stream to see its headers and body here.</p></div>';
    return;
  }
  const path = pathOf(r.url);
  const tab = state.detailTab;
  const headers = tab === 'request' ? r.request_headers : r.response_headers;
  const body = tab === 'request' ? r.request_body : (r.response_body || r.error);
  d.innerHTML = `<div class="detail-head"><div class="detail-title"><span class="detail-method">${esc(r.method)}</span>`
    + `<code class="detail-path" title="${esc(r.url)}">${esc(path || r.url)}</code></div>`
    + `<button class="icon-button" id="detail-close" aria-label="Close details" title="Close (Esc)">${ICON_CLOSE}</button></div>`
    + `<div class="detail-meta">${r.status_code ? statusChip(r.status_code) : ''}`
    + `<span class="state state-${stateClass(r.state)}">${esc(r.state)}</span>`
    + `<span>${esc(r.duration_ms ?? '—')} ms</span>${localTime(r.created_at)}</div>`
    + `<div class="detail-actions"><button class="button small" id="copy-http" title="Request block for a finding's Steps to reproduce">Copy as HTTP</button>`
    + `<button class="button small" id="copy-curl">Copy as curl</button></div>`
    + `<div class="detail-toolbar"><div class="tabs" role="tablist" aria-label="Message">`
    + `<button role="tab" data-tab="request" aria-selected="${tab === 'request'}">Request</button>`
    + `<button role="tab" data-tab="response" aria-selected="${tab === 'response'}">Response</button></div>`
    + `<button class="button ghost" id="send-to-repeat">Send to repeater</button></div>`
    + `<div class="detail-body" role="tabpanel"><h3>Headers</h3><pre class="code-block">${esc(headerText(headers) || '—')}</pre>`
    + bodyBlock(body, 'Body') + `</div>`;
  d.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => { state.detailTab = b.dataset.tab; renderDetail(); };
  });
  wirePrettyToggle(d, renderDetail);
  $('#detail-close').onclick = () => select(null);
  $('#copy-http').disabled = !path;
  $('#copy-curl').disabled = !path;
  $('#copy-http').onclick = () => copyText(asHttp(r), 'HTTP');
  $('#copy-curl').onclick = () => copyText(asCurl(r), 'curl');
  const button = $('#send-to-repeat');
  button.disabled = !path;
  button.onclick = () => {
    activate('repeater');
    $('#repeat-method').value = r.method;
    $('#repeat-path').value = path;
    $('#repeat-headers').value = headerText(r.request_headers);
    $('#repeat-body').value = r.request_body || '';
  };
}

// Size a textarea to its rendered content (long header lines wrap), between min and max pixels.
function fitHeight(ta, min, max) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(Math.max(ta.scrollHeight + 2, min), max)}px`;
}

async function renderIntercept() {
  const items = await api('/api/intercept');
  const list = $('#intercept-list');
  $('#intercept-empty').classList.toggle('hidden', items.length > 0);
  // Keyed update: keep cards that are still paused untouched, so edits in progress survive the live refresh.
  const ids = new Set(items.map((r) => r.id));
  [...list.children].forEach((card) => { if (!ids.has(card.dataset.id)) card.remove(); });
  const shown = new Set([...list.children].map((card) => card.dataset.id));
  items.filter((r) => !shown.has(r.id)).forEach((r) => {
    const card = document.createElement('article');
    card.className = 'intercept-card';
    card.dataset.id = r.id;
    const path = pathOf(r.url) || r.url;
    card.innerHTML = `<header><div class="intercept-title"><span class="state state-paused">paused</span>`
      + `<span class="detail-method">${esc(r.method)}</span><code class="detail-path" title="${esc(r.url)}">${esc(path)}</code></div>`
      + `<span class="intercept-time">${localTime(r.created_at)}</span></header>`
      + `<label class="edit-field"><span class="edit-label">Headers <span class="label-note">one Name: Value per line</span></span>`
      + `<textarea class="edit-headers" spellcheck="false" autocomplete="off">${esc(headerText(r.request_headers))}</textarea></label>`
      + `<label class="edit-field"><span class="edit-label">Body${r.request_body ? '' : ' <span class="label-note">empty</span>'}</span>`
      + `<textarea class="edit-body" spellcheck="false" autocomplete="off">${esc(r.request_body || '')}</textarea></label>`
      + `<div class="intercept-actions"><button class="button primary forward">Forward request</button><button class="button danger drop">Drop request</button></div>`;
    const headers = card.querySelector('.edit-headers');
    const body = card.querySelector('.edit-body');
    headers.oninput = () => fitHeight(headers, 180, 560);
    body.oninput = () => fitHeight(body, 96, 560);
    card.querySelector('.forward').onclick = () => actIntercept(r.id, card, false);
    card.querySelector('.drop').onclick = () => actIntercept(r.id, card, true);
    list.appendChild(card);
    fitHeight(headers, 180, 560); // measure after it is in the document
    fitHeight(body, 96, 560);
  });
}

async function actIntercept(id, card, drop) {
  try {
    const rid = encodeURIComponent(id);
    if (drop) await api(`/api/intercept/${rid}/drop`, { method: 'POST', body: '{}' });
    else await api(`/api/intercept/${rid}/forward`, {
      method: 'POST',
      body: JSON.stringify({ headers: parseHeaders(card.querySelector('.edit-headers').value), body: card.querySelector('.edit-body').value }),
    });
    flash(drop ? 'Request dropped.' : 'Request forwarded.');
    await refresh();
  } catch (e) { flash(e.message, true); }
}

async function refresh() {
  try {
    const [h, s] = await Promise.all([api('/api/history'), api('/api/state')]);
    const historyKey = JSON.stringify(h);
    if (historyKey !== state.historyKey) { // only redraw when traffic changed: keeps focus, selection and scroll
      state.historyKey = historyKey;
      state.history = h;
      renderHistory();
    }
    $('#intercept-toggle').checked = s.intercept_enabled;
    renderBanner(s);
    $('#pending-count').textContent = s.paused_count;
    $('#stat-blocked').textContent = s.blocked_count;
    $('#proxy-url').textContent = s.proxy;
    updatePathSuggestions();
    if (!$('#view-intercept').classList.contains('hidden')) await renderIntercept();
  } catch (e) { flash(e.message, true); }
}

function updatePathSuggestions() {
  // Paths seen in history (most recent first), then known endpoints not already listed.
  const seen = [];
  for (const r of state.history) {
    if (isAsset(r)) continue; // keep static files/socket.io out so API paths are not pushed past the cap
    const p = pathOf(r.url);
    if (p && !seen.includes(p)) seen.push(p);
  }
  const paths = [...seen, ...KNOWN_PATHS.filter((p) => !seen.includes(p))].slice(0, 60);
  const list = $('#path-suggestions');
  list.replaceChildren();
  for (const p of paths) {
    const opt = document.createElement('option');
    opt.value = p;
    list.appendChild(opt);
  }
}

const LABELS = {
  history: ['HTTP history', 'Inspect requests and responses captured through the local proxy.'],
  intercept: ['Interceptor', 'Paused requests waiting for a deliberate decision.'],
  repeater: ['Repeater', 'Send a modified request to the local Juice Shop.'],
};

function activate(view) {
  document.querySelectorAll('.view').forEach((x) => x.classList.add('hidden'));
  $(`#view-${view}`).classList.remove('hidden');
  document.querySelectorAll('.nav-button').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  $('#page-title').textContent = LABELS[view][0];
  $('#page-subtitle').textContent = LABELS[view][1];
  if (view === 'intercept') renderIntercept().catch((e) => flash(e.message, true));
}

document.querySelectorAll('.nav-button').forEach((b) => { b.onclick = () => activate(b.dataset.view); });
$('#refresh-button').onclick = refresh;
async function setIntercept(enabled) {
  try {
    await api('/api/intercept/toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
    flash(enabled ? 'Interception enabled.' : 'Interception disabled; paused requests were released.');
  } catch (x) { flash(x.message, true); }
  await refresh();
}

// While interception is on, Juice Shop appears to hang until requests are forwarded: say so on every screen.
function renderBanner(s) {
  $('#intercept-banner').classList.toggle('hidden', !s.intercept_enabled);
  const n = s.paused_count;
  $('#intercept-banner-count').textContent = n
    ? `${n} request${n === 1 ? '' : 's'} paused — Juice Shop waits until you forward or drop ${n === 1 ? 'it' : 'them'}.`
    : 'Requests pause until you forward or drop them.';
}

$('#intercept-toggle').onchange = (e) => setIntercept(e.target.checked);
$('#banner-open').onclick = () => activate('intercept');
$('#banner-off').onclick = () => setIntercept(false);
$('#history-search').oninput = (e) => { state.filter.q = e.target.value; renderHistory(); };
$('#hide-assets').checked = state.filter.hideAssets;
$('#hide-assets').onchange = (e) => { state.filter.hideAssets = e.target.checked; saveFilter(); renderHistory(); };
$('#clear-filters').onclick = () => {
  state.filter = { q: '', hideAssets: false };
  $('#history-search').value = '';
  $('#hide-assets').checked = false;
  saveFilter();
  renderHistory();
};
$('#send-repeat').onclick = async () => {
  try {
    const d = await api('/api/repeater', {
      method: 'POST',
      body: JSON.stringify({ method: $('#repeat-method').value, path: $('#repeat-path').value.trim(), headers: parseHeaders($('#repeat-headers').value), body: $('#repeat-body').value }),
    });
    $('#repeat-meta').textContent = `${d.status_code || 'Error'} · ${d.url || ''}`;
    const prettyBody = state.pretty && asJson(d.body);
    $('#repeat-response').textContent = d.error
      || `HTTP ${d.status_code}\n\n${headerText(d.headers)}\n\n${prettyBody || d.body || ''}`;
    flash(d.ok ? 'Repeater request complete.' : 'Repeater request rejected.', !d.ok);
    await refresh();
  } catch (e) { flash(e.message, true); }
};
// Keyboard: arrows move through the stream, Esc closes the detail (ignored while typing in a field).
document.addEventListener('keydown', (e) => {
  if ($('#view-history').classList.contains('hidden') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'Escape' && state.selectedId) { select(null); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = visibleHistory();
  if (!rows.length) return;
  e.preventDefault();
  const i = rows.findIndex((r) => r.id === state.selectedId);
  const next = i < 0 ? 0 : Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1);
  select(rows[next].id, { focus: true });
});
// Re-place the detail (side panel vs inline row) and recount columns whenever a layout breakpoint is crossed.
[wideLayout, window.matchMedia('(max-width: 1000px)'), window.matchMedia('(max-width: 640px)')]
  .forEach((mq) => mq.addEventListener('change', () => { state.detailKey = ''; renderHistory(); }));
let refitTimer;
window.addEventListener('resize', () => {
  clearTimeout(refitTimer);
  refitTimer = setTimeout(() => {
    document.querySelectorAll('.edit-headers').forEach((t) => fitHeight(t, 180, 560));
    document.querySelectorAll('.edit-body').forEach((t) => fitHeight(t, 96, 560));
  }, 150);
});
refresh();
setInterval(refresh, 2500);
