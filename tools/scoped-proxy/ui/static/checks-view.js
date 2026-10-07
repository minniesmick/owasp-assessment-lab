'use strict';
// Passive checks view: renders Checks.run(history) as a table. Reads only what is already in the page; sends nothing.
(function () {
  const { state, activate, select } = window.App;
  const $ = (s) => document.querySelector(s);
  const OWASP_NAMES = {
    A01: 'Broken Access Control', A02: 'Security Misconfiguration', A03: 'Software Supply Chain Failures', A04: 'Cryptographic Failures',
    A05: 'Injection', A06: 'Insecure Design', A07: 'Authentication Failures', A08: 'Software or Data Integrity Failures',
    A09: 'Security Logging and Alerting Failures', A10: 'Mishandling of Exceptional Conditions',
  };
  let observations = [];

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function compute() {
    observations = window.Checks.run(state.history);
    $('#checks-count').textContent = observations.length;
    $('#checks-count').classList.toggle('is-zero', observations.length === 0);
  }

  function render() {
    const sev = $('#checks-severity').value;
    const owasp = $('#checks-owasp').value;
    const rows = observations.filter((o) => (!sev || o.severity === sev) && (!owasp || o.owasp === owasp));
    const body = $('#checks-body');
    body.replaceChildren();
    $('#checks-empty').classList.toggle('hidden', rows.length > 0);
    $('#checks-summary').textContent = observations.length ? `${rows.length} of ${observations.length}` : '';

    rows.forEach((o) => {
      const tr = el('tr');
      tr.appendChild(el('td')).appendChild(el('span', `sev sev-${o.severity}`, o.severity));

      const what = el('td', 'checks-what');
      what.appendChild(el('strong', null, o.title));
      what.appendChild(el('span', 'checks-detail', o.detail));
      if (o.evidence) what.appendChild(el('code', 'checks-evidence', o.evidence));
      const more = el('details', 'checks-more');
      more.appendChild(el('summary', null, 'Why it matters and how to fix'));
      more.appendChild(el('p', null, `${o.why} ${o.fix}`));
      what.appendChild(more);
      tr.appendChild(what);

      const tag = el('td');
      const abbr = el('abbr', 'owasp-tag mono', o.owasp);
      abbr.title = OWASP_NAMES[o.owasp] || o.owasp;
      tag.appendChild(abbr);
      tr.appendChild(tag);

      tr.appendChild(el('td', 'align-end num', String(o.count)));

      const ex = el('td', 'checks-example');
      const open = el('button', 'link-button mono', `${o.method} ${o.path.length > 46 ? `${o.path.slice(0, 45)}…` : o.path}`);
      open.type = 'button';
      open.title = 'Open this request in HTTP history';
      open.onclick = () => { activate('history'); select(o.recordId); };
      ex.appendChild(open);
      tr.appendChild(ex);
      body.appendChild(tr);
    });
  }

  function refresh() { compute(); render(); }

  // OWASP filter options come from the rules so they never drift from the checks.
  [...new Set(Object.values(window.Checks.RULES).map((r) => r.owasp))].sort().forEach((code) => {
    const opt = el('option', null, `${code} ${OWASP_NAMES[code]}`);
    opt.value = code;
    $('#checks-owasp').appendChild(opt);
  });
  $('#checks-severity').onchange = render;
  $('#checks-owasp').onchange = render;
  document.addEventListener('history-changed', () => {
    compute();
    if (!$('#view-checks').classList.contains('hidden')) render();
  });
  window.ViewMeta.checks = { title: 'Passive checks', subtitle: 'Hints drawn from captured traffic. Nothing is sent.', onShow: refresh };
  refresh();
})();
