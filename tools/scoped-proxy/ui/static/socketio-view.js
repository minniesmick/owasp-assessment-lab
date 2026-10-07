'use strict';
// socket.io view: renders SocketIo.extract(history) as a table. Reads only what is already in the page; sends nothing.
// Captured text goes in through textContent only.
(function () {
  const { state, activate, select } = window.App;
  const $ = (s) => document.querySelector(s);
  let events = [];

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const clock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB'); };
  const pretty = (ev) => (ev.args.length ? ev.args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join('\n\n') : (ev.detail ? JSON.stringify(ev.detail, null, 2) : ev.raw));

  function compute() {
    events = window.SocketIo.extract(state.history);
    const picker = $('#sio-name');
    const keep = picker.value;
    picker.replaceChildren(Object.assign(el('option', null, 'All'), { value: '' }));
    [...new Set(events.filter((e) => !window.SocketIo.isHeartbeat(e)).map(window.SocketIo.label))].sort().forEach((name) => {
      picker.appendChild(Object.assign(el('option', null, name), { value: name }));
    });
    picker.value = [...picker.options].some((o) => o.value === keep) ? keep : '';
  }

  function render() {
    const name = $('#sio-name').value;
    const beats = $('#sio-heartbeats').checked;
    const rows = events.filter((e) => (beats || !window.SocketIo.isHeartbeat(e)) && (!name || window.SocketIo.label(e) === name)).reverse(); // newest first
    const body = $('#sio-body');
    body.replaceChildren();
    $('#sio-empty').classList.toggle('hidden', rows.length > 0);
    $('#sio-summary').textContent = events.length ? `${rows.length} of ${events.length}` : '';

    rows.forEach((e) => {
      const tr = el('tr');
      tr.appendChild(el('td', 'num', clock(e.time)));
      const dir = el('td');
      dir.appendChild(el('span', `sio-dir sio-${e.dir}`, e.dir === 'in' ? '← server' : '→ browser'));
      tr.appendChild(dir);
      tr.appendChild(el('td', 'mono sio-name', window.SocketIo.label(e)));

      const data = el('td', 'sio-data');
      const more = el('details', 'sio-more');
      more.appendChild(el('summary', null, e.preview || '(no data)'));
      more.appendChild(el('pre', 'code-block', pretty(e)));
      data.appendChild(more);
      tr.appendChild(data);

      const open = el('button', 'link-button mono', 'Open');
      open.type = 'button';
      open.title = 'Open the request this event came from in HTTP history';
      open.onclick = () => { activate('history'); select(e.recordId); };
      tr.appendChild(el('td')).appendChild(open);
      body.appendChild(tr);
    });
  }

  function refresh() { compute(); render(); }

  $('#sio-name').onchange = render;
  $('#sio-heartbeats').onchange = render;
  document.addEventListener('history-changed', () => {
    compute();
    if (!$('#view-socketio').classList.contains('hidden')) render();
  });
  window.ViewMeta.socketio = { title: 'Socket.io', subtitle: 'Events Juice Shop sent over socket.io polling. Nothing is sent.', onShow: refresh };
  refresh();
})();
