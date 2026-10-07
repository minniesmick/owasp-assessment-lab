'use strict';
// Two identities view: replays one request as account A and account B through the Repeater endpoint (same path-only
// rules, same scope gates) and diffs the answers. Tokens are read from password fields at click time and kept nowhere else.
(function () {
  const { state, api, flash, pathOf, activate, refresh } = window.App;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const METHODS_WITH_BODY = /^(POST|PUT|PATCH)$/;
  let contentType = '';
  let running = false;

  function fillPickers() {
    const tokens = window.Identities.tokensFromHistory(state.history);
    ['#id-pick-a', '#id-pick-b'].forEach((sel) => {
      const keep = $(sel).value;
      $(sel).replaceChildren(Object.assign(el('option', null, tokens.length ? 'Pick a captured token…' : 'No tokens captured yet (log in through the proxy)'), { value: '' }));
      tokens.forEach((t) => $(sel).appendChild(Object.assign(el('option', null, `${t.who} · ${t.where} · ${t.hint}`), { value: t.token })));
      if (tokens.some((t) => t.token === keep)) $(sel).value = keep;
    });
  }
  $('#id-pick-a').onchange = () => { if ($('#id-pick-a').value) $('#id-token-a').value = $('#id-pick-a').value; };
  $('#id-pick-b').onchange = () => { if ($('#id-pick-b').value) $('#id-token-b').value = $('#id-pick-b').value; };
  document.addEventListener('history-changed', () => { if (!$('#view-identities').classList.contains('hidden') && !running) fillPickers(); });

  function open(r) {
    activate('identities');
    const method = r.method.toUpperCase();
    $('#id-method').value = [...$('#id-method').options].some((o) => o.value === method) ? method : 'GET';
    $('#id-path').value = pathOf(r.url) || '/';
    $('#id-body').value = r.request_body || '';
    const ct = Object.entries(r.request_headers || {}).find(([k]) => k.toLowerCase() === 'content-type');
    contentType = ct ? ct[1] : '';
    $('#id-result').classList.add('hidden');
    $('#id-token-a').focus();
  }

  async function send(label, token) {
    const method = $('#id-method').value;
    const base = {};
    if (METHODS_WITH_BODY.test(method) && $('#id-body').value) base['Content-Type'] = contentType || 'application/json';
    const headers = window.Identities.identityHeaders(token, { cookie: $('#id-cookie').checked, base });
    const t0 = performance.now();
    try {
      const d = await api('/api/repeater', {
        method: 'POST',
        body: JSON.stringify({ method, path: $('#id-path').value.trim(), headers, body: METHODS_WITH_BODY.test(method) ? $('#id-body').value : '' }),
      });
      return { label, ...d, ms: Math.round(performance.now() - t0), response_headers: d.headers || {}, response_body: d.body || '' };
    } catch (e) {
      return { label, ok: false, error: e.message, ms: Math.round(performance.now() - t0), response_headers: {}, response_body: '' };
    }
  }

  function renderResults(runs, a, b) {
    const box = $('#id-result');
    box.replaceChildren();
    const table = el('table', 'diff-table id-runs');
    const head = el('tr');
    ['Identity', 'Status', 'Size', 'Time'].forEach((h) => head.appendChild(el('th', null, h)));
    table.appendChild(el('thead')).appendChild(head);
    const body = el('tbody');
    runs.forEach((r) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, r.label));
      tr.appendChild(el('td', 'mono', r.ok ? String(r.status_code) : (r.error || 'failed')));
      tr.appendChild(el('td', 'mono', r.ok ? `${(r.response_body || '').length} chars` : '—'));
      tr.appendChild(el('td', 'mono', `${r.ms} ms`));
      body.appendChild(tr);
    });
    table.appendChild(body);
    box.appendChild(el('div', 'table-wrap')).appendChild(table);

    const v = window.Identities.verdict(a, b);
    box.appendChild(el('p', `id-verdict${v.kind === 'blocked' || v.kind === 'different' ? ' is-ok' : ''}`, v.text));

    const diff = el('div');
    box.appendChild(diff);
    if (a.ok && b.ok) window.DiffView.renderInto(diff, a, b, 'A', 'B');

    const anon = runs.find((r) => r.label === 'No token');
    if (anon && anon.ok && a.ok) {
      box.appendChild(el('h3', 'id-sub', 'A compared with no token'));
      const d2 = el('div');
      box.appendChild(d2);
      window.DiffView.renderInto(d2, a, anon, 'A', 'No token');
    }
    box.classList.remove('hidden');
  }

  $('#id-run').onclick = async () => {
    if (running) return;
    const ta = $('#id-token-a').value.trim();
    const tb = $('#id-token-b').value.trim();
    if (!$('#id-path').value.trim()) { flash('Enter a path first.', true); return; }
    if (!ta || !tb) { flash('Both identities need a token.', true); return; }
    if (/\s/.test(ta + tb)) { flash('A token cannot contain spaces.', true); return; }
    running = true;
    $('#id-run').disabled = true;
    try {
      const a = await send('A', ta);
      const b = await send('B', tb);
      const runs = [a, b];
      if ($('#id-anon').checked) runs.push(await send('No token', ''));
      renderResults(runs, a, b);
      flash('Done. The requests are also in HTTP history (source: repeater).');
      await refresh();
    } finally {
      running = false;
      $('#id-run').disabled = false;
    }
  };
  $('#id-forget').onclick = () => {
    ['#id-token-a', '#id-token-b'].forEach((s) => { $(s).value = ''; });
    ['#id-pick-a', '#id-pick-b'].forEach((s) => { $(s).value = ''; });
    $('#id-result').classList.add('hidden');
    flash('Tokens cleared from this page.');
  };

  window.IdentitiesView = { open };
  window.ViewMeta.identities = { title: 'Two identities', subtitle: 'Replay one request as two accounts and compare the answers.', onShow: fillPickers };
  fillPickers();
})();
