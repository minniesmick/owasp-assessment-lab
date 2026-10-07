'use strict';
// Diff view: compare the responses of two captured requests. Everything is drawn with textContent; captured data is untrusted.
(function () {
  const { state, activate, pathOf } = window.App;
  const $ = (s) => document.querySelector(s);
  const MAX_SHOWN = 1500; // body lines drawn before the rest is summarised

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // Draws the comparison of two exchanges ({ status_code, response_headers, response_body }) into `box`.
  function renderInto(box, ra, rb, labelA, labelB) {
    const c = window.Diff.compare(ra, rb);
    box.replaceChildren();

    const sum = el('div', 'diff-summary');
    sum.appendChild(el('span', `diff-verdict ${c.identical ? 'is-same' : 'is-diff'}`, c.identical ? 'Identical responses' : 'Responses differ'));
    sum.appendChild(el('span', null, `Status ${ra.status_code ?? '—'} → ${rb.status_code ?? '—'}${c.status.same ? ' (same)' : ''}`));
    sum.appendChild(el('span', null, `${c.headerDiffs} header ${c.headerDiffs === 1 ? 'difference' : 'differences'}`));
    sum.appendChild(el('span', null, `body +${c.body.added} −${c.body.removed} lines`));
    box.appendChild(sum);

    // headers
    const changed = c.headers.filter((h) => h.kind !== 'same' && !h.noise);
    const rest = c.headers.filter((h) => h.kind === 'same' || h.noise);
    const table = (rows) => {
      const t = el('table', 'diff-table');
      const head = el('tr');
      ['Header', labelA, labelB].forEach((x) => head.appendChild(el('th', null, x)));
      t.appendChild(el('thead')).appendChild(head);
      const body = el('tbody');
      rows.forEach((h) => {
        const tr = el('tr', h.kind === 'same' ? '' : `diff-${h.kind}`);
        tr.appendChild(el('td', 'mono', h.name));
        tr.appendChild(el('td', 'mono', h.a === null ? '—' : h.a));
        tr.appendChild(el('td', 'mono', h.b === null ? '—' : h.b));
        body.appendChild(tr);
      });
      t.appendChild(body);
      return t;
    };
    const hp = el('div', 'diff-block');
    hp.appendChild(el('h3', null, 'Headers'));
    if (changed.length) hp.appendChild(el('div', 'table-wrap')).appendChild(table(changed));
    else hp.appendChild(el('p', 'diff-none', 'No header differences.'));
    if (rest.length) {
      const d = el('details', 'diff-more');
      d.appendChild(el('summary', null, `Unchanged or noisy headers (${rest.length})`));
      d.appendChild(el('div', 'table-wrap')).appendChild(table(rest));
      hp.appendChild(d);
    }
    box.appendChild(hp);

    // body
    const bp = el('div', 'diff-block');
    const head = el('div', 'diff-body-head');
    head.appendChild(el('h3', null, 'Body'));
    const toggle = el('label', 'chip-toggle');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = true;
    toggle.appendChild(cb);
    toggle.appendChild(el('span', null, 'Changes only'));
    head.appendChild(toggle);
    bp.appendChild(head);
    if (c.body.approximate) bp.appendChild(el('p', 'diff-none', 'The bodies are very large and unlike each other, so this is a coarse comparison.'));
    const pre = el('div', 'diff-lines');
    pre.setAttribute('role', 'group');
    pre.setAttribute('aria-label', 'Body differences');
    bp.appendChild(pre);
    const draw = () => {
      pre.replaceChildren();
      const ops = cb.checked ? window.Diff.collapse(c.body.ops, 3) : c.body.ops;
      if (!ops.length) { pre.appendChild(el('div', 'diff-line diff-gap', 'Both bodies are empty.')); return; }
      ops.slice(0, MAX_SHOWN).forEach((o) => {
        if (o.t === 'gap') { pre.appendChild(el('div', 'diff-line diff-gap', `… ${o.count} unchanged ${o.count === 1 ? 'line' : 'lines'}`)); return; }
        pre.appendChild(el('div', `diff-line diff-${o.t}`, `${o.t === 'add' ? '+' : o.t === 'del' ? '−' : ' '} ${o.text}`));
      });
      if (ops.length > MAX_SHOWN) pre.appendChild(el('div', 'diff-line diff-gap', `… ${ops.length - MAX_SHOWN} more lines not shown`));
    };
    cb.onchange = draw;
    draw();
    box.appendChild(bp);
  }

  // ---------------------------------------------------------------- history comparison tab
  const usable = () => state.history.filter((r) => r.state !== 'blocked' && r.status_code != null).slice(0, 200);
  const label = (r) => `${r.created_at ? new Date(r.created_at).toLocaleTimeString('sv-SE') : ''}  ${r.method} ${pathOf(r.url) || r.url} → ${r.status_code}${r.source === 'repeater' ? ' (repeater)' : ''}`;

  function fillSelects() {
    const rows = usable();
    ['#diff-a', '#diff-b'].forEach((sel) => {
      const keep = $(sel).value;
      $(sel).replaceChildren(Object.assign(el('option', null, 'Choose a request…'), { value: '' }));
      rows.forEach((r) => $(sel).appendChild(Object.assign(el('option', null, label(r)), { value: r.id })));
      if (rows.some((r) => r.id === keep)) $(sel).value = keep;
    });
  }

  function compareSelected() {
    const find = (id) => state.history.find((r) => r.id === id);
    const a = find($('#diff-a').value);
    const b = find($('#diff-b').value);
    $('#diff-empty').classList.toggle('hidden', !!(a && b));
    $('#diff-result').classList.toggle('hidden', !(a && b));
    if (a && b) renderInto($('#diff-result'), a, b, 'A', 'B');
  }

  // Start from one request: the newest other response to the same method and path becomes the second side.
  function open(r) {
    activate('diff');
    fillSelects();
    $('#diff-a').value = r.id;
    const path = (u) => pathOf(u).split('?')[0];
    const other = usable().find((x) => x.id !== r.id && x.method === r.method && path(x.url) === path(r.url));
    $('#diff-b').value = other ? other.id : '';
    compareSelected();
  }

  $('#diff-a').onchange = compareSelected;
  $('#diff-b').onchange = compareSelected;
  $('#diff-swap').onclick = () => { const a = $('#diff-a').value; $('#diff-a').value = $('#diff-b').value; $('#diff-b').value = a; compareSelected(); };

  window.DiffView = { open, renderInto };
  window.ViewMeta.diff = { title: 'Response diff', subtitle: 'Compare two captured responses line by line.', onShow: () => { fillSelects(); compareSelected(); } };
})();
