'use strict';
// Every value that comes from captured traffic is untrusted (Juice Shop responses contain attack payloads).
// It is inserted with textContent or escaped with esc() — never as raw HTML.

const $ = (s) => document.querySelector(s);
const state = { history: [], selected: null };
const TARGET = 'http://127.0.0.1:3000';

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

function renderHistory() {
  const body = $('#history-body');
  body.replaceChildren();
  $('#history-empty').classList.toggle('hidden', state.history.length > 0);
  const counts = {};
  state.history.forEach((r) => {
    counts[r.state] = (counts[r.state] || 0) + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(r.method)}${r.source === 'repeater' ? '<span class="source-tag">rep</span>' : ''}</td>`
      + `<td title="${esc(r.url)}">${esc(r.url)}</td>`
      + `<td><span class="status">${esc(r.status_code ?? '—')}</span></td>`
      + `<td><span class="state state-${stateClass(r.state)}">${esc(r.state)}</span></td>`
      + `<td>${esc(r.duration_ms ?? '—')} ms</td>`;
    tr.onclick = () => showDetail(r);
    body.appendChild(tr);
  });
  $('#stat-captured').textContent = state.history.length;
  $('#stat-forwarded').textContent = counts.forwarded || 0;
  $('#stat-paused').textContent = counts.paused || 0;
}

function showDetail(r) {
  state.selected = r;
  const d = $('#history-detail');
  d.classList.remove('hidden');
  d.innerHTML = `<div class="panel-head detail-head"><div><h2>${esc(r.method)} ${esc(r.url)}</h2><p>${esc(r.created_at)} · ${esc(r.state)}</p></div>`
    + `<button class="button ghost" id="send-to-repeat">Send to repeater</button></div>`
    + `<div class="detail-grid"><div><h3>Request headers</h3><pre class="code-block">${esc(headerText(r.request_headers) || '—')}</pre>`
    + `<h3 class="detail-gap">Request body</h3><pre class="code-block">${esc(r.request_body || '—')}</pre></div>`
    + `<div><h3>Response headers</h3><pre class="code-block">${esc(headerText(r.response_headers) || '—')}</pre>`
    + `<h3 class="detail-gap">Response body</h3><pre class="code-block">${esc(r.response_body || r.error || '—')}</pre></div></div>`;
  const button = $('#send-to-repeat');
  const path = pathOf(r.url);
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
    state.history = h;
    renderHistory();
    $('#intercept-toggle').checked = s.intercept_enabled;
    $('#pending-count').textContent = s.paused_count;
    $('#stat-blocked').textContent = s.blocked_count;
    $('#proxy-url').textContent = s.proxy;
    if (!$('#view-intercept').classList.contains('hidden')) await renderIntercept();
  } catch (e) { flash(e.message, true); }
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
refresh();
setInterval(refresh, 2500);
