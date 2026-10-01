'use strict';
// Every value that comes from captured traffic is untrusted (Juice Shop responses contain attack payloads).
// It is inserted with textContent or escaped with esc() — never as raw HTML.

const $ = (s) => document.querySelector(s);
const state = { history: [], selectedId: null, detailTab: 'request', detailKey: '', historyKey: '' };
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
const stateClass = (s) => (/^[a-z]+$/.test(s) ? s : 'error');

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

function renderHistory() {
  const body = $('#history-body');
  const rowHadFocus = !!document.activeElement?.closest?.('#history-body tr');
  const focusInDetail = detailEl.contains(document.activeElement) ? document.activeElement : null;
  if (state.selectedId && !selectedRecord()) state.selectedId = null; // gone after a proxy restart
  $('#detail-slot').appendChild(detailEl); // rescue it before the rows (and an inline detail row) are removed
  body.replaceChildren();
  $('#history-empty').classList.toggle('hidden', state.history.length > 0);
  const counts = {};
  state.history.forEach((r, index) => {
    counts[r.state] = (counts[r.state] || 0) + 1;
    const selected = r.id === state.selectedId;
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    tr.className = selected ? 'selected' : '';
    tr.setAttribute('aria-selected', String(selected));
    tr.tabIndex = selected || (!state.selectedId && index === 0) ? 0 : -1; // roving tabindex: one tab stop for the list
    tr.innerHTML = `<td class="col-method">${esc(r.method)}${r.source === 'repeater' ? '<span class="source-tag">rep</span>' : ''}</td>`
      + `<td class="col-path" title="${esc(r.url)}">${esc(pathOf(r.url) || r.url)}</td>`
      + `<td class="col-status"><span class="status">${esc(r.status_code ?? '—')}</span></td>`
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

function renderDetail() {
  const d = detailEl;
  const r = selectedRecord();
  const key = r ? JSON.stringify(r) + state.detailTab : 'empty';
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
    + `<div class="detail-meta">${r.status_code ? `<span class="status">${esc(r.status_code)}</span>` : ''}`
    + `<span class="state state-${stateClass(r.state)}">${esc(r.state)}</span>`
    + `<span>${esc(r.duration_ms ?? '—')} ms</span><span>${esc(r.created_at)}</span></div>`
    + `<div class="detail-toolbar"><div class="tabs" role="tablist" aria-label="Message">`
    + `<button role="tab" data-tab="request" aria-selected="${tab === 'request'}">Request</button>`
    + `<button role="tab" data-tab="response" aria-selected="${tab === 'response'}">Response</button></div>`
    + `<button class="button ghost" id="send-to-repeat">Send to repeater</button></div>`
    + `<div class="detail-body" role="tabpanel"><h3>Headers</h3><pre class="code-block">${esc(headerText(headers) || '—')}</pre>`
    + `<h3>Body</h3><pre class="code-block">${esc(body || '—')}</pre></div>`;
  d.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => { state.detailTab = b.dataset.tab; renderDetail(); };
  });
  $('#detail-close').onclick = () => select(null);
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

async function renderIntercept() {
  const items = await api('/api/intercept');
  const list = $('#intercept-list');
  list.replaceChildren();
  $('#intercept-empty').classList.toggle('hidden', items.length > 0);
  items.forEach((r) => {
    const card = document.createElement('article');
    card.className = 'intercept-card';
    card.innerHTML = `<header><div><span class="state state-paused">PAUSED</span><h3>${esc(r.method)} ${esc(r.url)}</h3></div>`
      + `<span class="label-note">${esc(r.created_at)}</span></header>`
      + `<div class="edit-grid"><label>Headers<textarea class="edit-headers" rows="8">${esc(headerText(r.request_headers))}</textarea></label>`
      + `<label>Body<textarea class="edit-body" rows="8">${esc(r.request_body || '')}</textarea></label></div>`
      + `<div class="intercept-actions"><button class="button primary forward">Forward request</button><button class="button danger drop">Drop request</button></div>`;
    card.querySelector('.forward').onclick = () => actIntercept(r.id, card, false);
    card.querySelector('.drop').onclick = () => actIntercept(r.id, card, true);
    list.appendChild(card);
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
$('#intercept-toggle').onchange = async (e) => {
  try {
    await api('/api/intercept/toggle', { method: 'POST', body: JSON.stringify({ enabled: e.target.checked }) });
    flash(e.target.checked ? 'Interception enabled.' : 'Interception disabled; paused requests were released.');
    await refresh();
  } catch (x) { e.target.checked = !e.target.checked; flash(x.message, true); }
};
$('#send-repeat').onclick = async () => {
  try {
    const d = await api('/api/repeater', {
      method: 'POST',
      body: JSON.stringify({ method: $('#repeat-method').value, path: $('#repeat-path').value.trim(), headers: parseHeaders($('#repeat-headers').value), body: $('#repeat-body').value }),
    });
    $('#repeat-meta').textContent = `${d.status_code || 'Error'} · ${d.url || ''}`;
    $('#repeat-response').textContent = d.error || `HTTP ${d.status_code}\n\n${headerText(d.headers)}\n\n${d.body || ''}`;
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
  if (!state.history.length) return;
  e.preventDefault();
  const i = state.history.findIndex((r) => r.id === state.selectedId);
  const next = i < 0 ? 0 : Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), state.history.length - 1);
  select(state.history[next].id, { focus: true });
});
// Re-place the detail (side panel vs inline row) and recount columns whenever a layout breakpoint is crossed.
[wideLayout, window.matchMedia('(max-width: 1000px)'), window.matchMedia('(max-width: 640px)')]
  .forEach((mq) => mq.addEventListener('change', () => { state.detailKey = ''; renderHistory(); }));
refresh();
setInterval(refresh, 2500);
