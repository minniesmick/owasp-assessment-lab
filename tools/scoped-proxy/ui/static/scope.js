'use strict';
// Scope report view: counters, the layers of the boundary, recent refusals, and an on-demand self-check.
(function () {
  const { api, state, flash, localTime } = window.App;
  const $ = (s) => document.querySelector(s);

  const cell = (text, cls) => {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  };

  function renderBlocked(blockedCount) {
    $('#scope-blocked').textContent = blockedCount;
    const body = $('#scope-blocked-list');
    body.replaceChildren();
    const rows = state.history.filter((r) => r.state === 'blocked').slice(0, 50);
    $('#scope-blocked-empty').classList.toggle('hidden', rows.length > 0);
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const time = document.createElement('td');
      time.innerHTML = localTime(r.created_at); // localTime escapes its input
      tr.appendChild(time);
      tr.appendChild(cell(`${r.method} ${r.url}`, 'scope-mono'));
      tr.appendChild(cell(r.error || 'refused'));
      body.appendChild(tr);
    });
  }

  function renderSelftest(r) {
    $('#scope-target').textContent = r.target;
    $('#scope-bind').textContent = r.bind;
    $('#scope-score').textContent = `${r.passed} / ${r.total}`;
    $('#scope-score').classList.toggle('scope-bad', !r.ok);
    $('#scope-summary').textContent = r.ok
      ? `All ${r.total} checks passed: every out-of-scope input is refused and only the pinned target is allowed.`
      : `${r.total - r.passed} of ${r.total} checks FAILED. Do not use the proxy until this is fixed.`;

    const failed = r.checks.filter((c) => !c.ok);
    const box = $('#scope-failed');
    box.classList.toggle('hidden', failed.length === 0);
    box.textContent = failed.map((c) => `${c.group}: ${c.name} should be ${c.expected}`).join('\n');

    const body = $('#scope-checks');
    body.replaceChildren();
    r.checks.forEach((c) => {
      const tr = document.createElement('tr');
      tr.appendChild(cell(c.group));
      tr.appendChild(cell(c.name, 'scope-mono'));
      tr.appendChild(cell(c.expected));
      tr.appendChild(cell(c.ok ? 'pass' : 'FAIL', c.ok ? 'scope-pass' : 'scope-bad'));
      body.appendChild(tr);
    });

    const layers = $('#scope-layers');
    layers.replaceChildren();
    r.layers.forEach((l) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = l.name;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(` — ${l.text}`));
      layers.appendChild(li);
    });
  }

  async function show() {
    try {
      const [s, r] = await Promise.all([api('/api/state'), api('/api/scope-selftest', { method: 'POST', body: '{}' })]);
      renderBlocked(s.blocked_count);
      renderSelftest(r);
    } catch (e) { flash(e.message, true); }
  }

  $('#scope-run').onclick = show;
  window.ViewMeta.scope = { title: 'Scope', subtitle: 'What the proxy may reach, and proof that the boundary holds.', onShow: show };
})();
