'use strict';
// "Finding draft" view: builds a findings/_TEMPLATE.md skeleton from a captured request. Sends nothing; the Markdown goes
// into a textarea value (never HTML) and onto the clipboard or a downloaded file.
(function () {
  const { asHttp, copyText, flash, pathOf, headerText } = window.App;
  const { Report } = window;
  const $ = (s) => document.querySelector(s);
  const RESPONSE_HEADERS = /^(content-type|location|set-cookie|www-authenticate|access-control-allow-origin)$/i;
  const STORE = 'scoped-proxy.tester';
  let record = null;
  let current = null; // { fileName, markdown }

  const stored = () => { try { return localStorage.getItem(STORE) || ''; } catch { return ''; } };
  const remember = (v) => { try { localStorage.setItem(STORE, v); } catch { /* ignore */ } };

  Object.entries(Report.OWASP_NAMES).forEach(([code, name]) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = `${code} ${name}`;
    $('#finding-owasp').appendChild(opt);
  });

  function build() {
    if (!record) return;
    const mask = $('#finding-mask').checked;
    const r = mask ? Report.maskRecord(record) : record;
    const responseHeaders = Object.fromEntries(Object.entries(r.response_headers || {}).filter(([k]) => RESPONSE_HEADERS.test(k)));
    current = Report.buildFinding({
      owasp: $('#finding-owasp').value,
      title: $('#finding-title').value.trim(),
      cwe: $('#finding-cwe').value.trim().toUpperCase(),
      tester: $('#finding-tester').value.trim(),
      tools: $('#finding-tools').value.trim(),
      num: $('#finding-num').value,
      date: new Date().toLocaleDateString('sv-SE'), // YYYY-MM-DD in local time
    }, {
      method: r.method,
      path: pathOf(r.url) || '/',
      requestBlock: asHttp(r),
      status: $('#finding-response').checked ? r.status_code : null,
      responseHead: headerText(responseHeaders),
      responseBody: r.response_body || '',
    });
    $('#finding-output').value = current.markdown;
    $('#finding-filename').textContent = current.fileName;
  }

  function open(r) {
    record = r;
    $('#finding-owasp').value = ''; // the category is the tester's call; a passive hint is not a finding
    $('#finding-title').value = '';
    $('#finding-cwe').value = '';
    $('#finding-tester').value = stored();
    $('#finding-request').textContent = `${r.method} ${pathOf(r.url) || '/'}${r.status_code ? ` → ${r.status_code}` : ''}`;
    $('#finding-empty').classList.add('hidden');
    $('#finding-main').classList.remove('hidden');
    window.App.activate('finding');
    build();
    $('#finding-title').focus();
  }

  ['#finding-owasp', '#finding-num', '#finding-cwe', '#finding-title', '#finding-tools', '#finding-mask', '#finding-response']
    .forEach((id) => { $(id).addEventListener('input', build); });
  $('#finding-tester').addEventListener('input', () => { remember($('#finding-tester').value.trim()); build(); });

  $('#finding-copy').onclick = () => { if (current) copyText(current.markdown, 'finding draft', ' Fill in every TODO before you commit.'); };
  $('#finding-download').onclick = () => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([current.markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: current.fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(`Saved ${current.fileName}. Move it to findings/juice-shop/.`);
  };

  window.FindingView = { open };
  window.ViewMeta.finding = { title: 'Finding draft', subtitle: 'Start a findings/ file from a captured request.' };
})();
