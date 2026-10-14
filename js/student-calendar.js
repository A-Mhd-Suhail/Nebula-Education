/* THE PENTAGON - academic year calendar. Reads /calendar/year from your backend. */
(function () {
  'use strict';
  var A = window.HXAPI; if (!A) return;
  var C = A.cfg, esc = A.esc, $ = A.$, p2 = A.p2;
  var now = new Date(), today = A.ymd(now), qs = new URLSearchParams(location.search);
  var SM = C.YEAR_START_MONTH || 6, EM = C.YEAR_END_MONTH || 4;
  var Y = +qs.get('y') || (now.getMonth() + 1 >= SM ? now.getFullYear() : now.getFullYear() - 1);
  var months = [];
  for (var i = 0; i < 12; i++) { var mm = (SM - 1 + i) % 12 + 1; months.push({ y: Y + (SM - 1 + i >= 12 ? 1 : 0), m: mm }); if (mm === EM) break; }
  function mk(x) { return x.y + '-' + p2(x.m); }
  var sel = months.filter(function (x) { return mk(x) === qs.get('m'); })[0] ||
    months.filter(function (x) { return x.y === now.getFullYear() && x.m === now.getMonth() + 1; })[0] || months[0];
  var data = null, subj = 'all', SL = [], PE = A.arr(A.rd('hx_personal_v1', []));
  var off = C.WEEKLY_OFF || [0];

  function days() { return (data && data.days) || {}; }
  function buildSubjects() {
    SL = A.arr(data && data.subjects).map(function (x) { return x.name || x; });
    if (!SL.length) Object.keys(days()).forEach(function (k) { A.arr(days()[k].classes).forEach(function (c) { if (SL.indexOf(c.subject) < 0) SL.push(c.subject); }); });
  }
  function sc(n) { var i = SL.indexOf(n); return 'p' + ((i < 0 ? 0 : i) % 3 + 1); }

  function renderMonths() {
    $('#ylabel').textContent = Y + ' to ' + String(Y + 1).slice(2);
    $('#months').innerHTML = months.map(function (x) {
      return '<button type="button" class="mo' + (mk(x) === mk(sel) ? ' on' : '') + '" data-m="' + mk(x) + '">' + new Date(x.y, x.m - 1, 1).toLocaleDateString(undefined, { month: 'short' }) + '</button>'; }).join('');
  }
  function renderFilters() {
    $('#filters').innerHTML = ['all'].concat(SL).map(function (s) { return '<button type="button" class="fch' + (subj === s ? ' on' : '') + '" data-s="' + esc(s) + '">' + (s === 'all' ? 'All subjects' : esc(s)) + '</button>'; }).join('');
  }
  function cell(dt) {
    var k = A.ymd(dt), info = days()[k] || {}, items = [], evs = A.arr(info.events), n = info.notes || {};
    if (info.holiday) items.push(['px', info.holiday]);
    evs.forEach(function (e) { items.push(['px', (e.kind === 'assignment' ? 'Due: ' : '') + e.title]); });
    PE.filter(function (e) { return e.date === k; }).forEach(function (e) { items.push(['px', e.title]); });
    var cl = A.arr(info.classes).filter(function (c) { return subj === 'all' || c.subject === subj; });
    cl.forEach(function (c) { items.push([sc(c.subject), c.subject]); });
    var cls = 'cd' + (info.holiday ? ' h' : evs.some(function (e) { return e.kind === 'exam'; }) ? ' e' : off.indexOf(dt.getDay()) > -1 ? ' w' : '') + (k === today ? ' t' : '');
    return '<button type="button" class="' + cls + '" data-k="' + k + '" aria-label="' + dt.getDate() + ' ' + esc(dt.toLocaleDateString(undefined, { month: 'long' })) + ': ' + A.arr(info.classes).length + ' classes">' +
      '<span class="n">' + dt.getDate() + '</span>' + items.slice(0, 2).map(function (it) { return '<span class="p ' + it[0] + '">' + esc(it[1]) + '</span>'; }).join('') +
      (items.length > 2 ? '<span class="more">+' + (items.length - 2) + ' more</span>' : '') +
      '<span class="dt">' + (n.mine > 0 ? '<i class="k1"></i>' : '') + (n.board > 0 ? '<i class="k2"></i>' : '') + (n.ai > 0 ? '<i class="k3"></i>' : '') + '</span></button>';
  }
  function renderGrid() {
    var first = new Date(sel.y, sel.m - 1, 1), offs = (first.getDay() + 6) % 7, dim = new Date(sel.y, sel.m, 0).getDate(), h = '', j;
    $('#mtitle').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    for (j = 0; j < offs; j++) h += '<div class="cd o"></div>';
    for (j = 1; j <= dim; j++) h += cell(new Date(sel.y, sel.m - 1, j));
    var tail = (offs + dim) % 7; if (tail) for (j = tail; j < 7; j++) h += '<div class="cd o"></div>';
    $('#grid').innerHTML = h;
  }
  function renderSide() {
    var p = data && data.progress || {};
    function row(l, v, c) { return '<div class="prow"><span>' + l + '</span><b>' + (v == null ? '--' : v) + '</b></div><div class="bar2"><i style="width:' + (c || 0) + '%' + (c === undefined ? ';display:none' : '') + '"></i></div>'; }
    $('#progress').innerHTML = row('Syllabus covered', p.syllabusPct == null ? null : Math.round(p.syllabusPct) + '%', p.syllabusPct == null ? undefined : p.syllabusPct) +
      row('Attendance', p.attendancePct == null ? null : Math.round(p.attendancePct) + '%', p.attendancePct == null ? undefined : p.attendancePct) +
      row('Days with notes', p.daysTotal ? p.daysWithNotes + ' of ' + p.daysTotal : null, p.daysTotal ? p.daysWithNotes / p.daysTotal * 100 : undefined);
    var up = A.arr(data && data.upcoming).concat(PE.map(function (e) { return { date: e.date, title: e.title, sub: e.time || 'My event', kind: 'event' }; }))
      .filter(function (u) { return u.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 5);
    $('#upcoming').innerHTML = up.length ? up.map(function (u) {
      var d = A.fromKey(u.date), bg = u.kind === 'exam' ? 'var(--pk)' : u.kind === 'holiday' ? 'var(--gr)' : 'var(--mt)';
      return '<a class="up" style="text-decoration:none;color:inherit" href="calendar.html?d=' + esc(u.date) + '"><div class="ud" style="background:' + bg + '"><b>' + d.getDate() + '</b>' + esc(d.toLocaleDateString(undefined, { month: 'short' })) + '</div><div><b style="font-size:13.5px">' + esc(u.title) + '</b><div class="muted sm">' + esc(u.sub || '') + '</div></div></a>'; }).join('')
      : '<p class="muted sm">Nothing scheduled yet.</p>';
  }
  function renderAll() { buildSubjects(); renderMonths(); renderFilters(); renderGrid(); renderSide(); }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var m = e.target.closest('[data-m]'); if (m) { sel = months.filter(function (x) { return mk(x) === m.getAttribute('data-m'); })[0]; renderMonths(); renderGrid(); history.replaceState(null, '', '?y=' + Y + '&m=' + mk(sel)); return; }
    var s = e.target.closest('[data-s]'); if (s) { subj = s.getAttribute('data-s'); renderFilters(); renderGrid(); return; }
    var c = e.target.closest('.cd[data-k]'); if (c) { location.href = 'calendar.html?d=' + c.getAttribute('data-k'); return; }
    var cl = e.target.closest('[data-close]'); if (cl) cl.closest('dialog').close();
    if (!e.target.closest('.tools2')) $('#sres').hidden = true;
  });
  function step(n) { var i = months.indexOf(sel) + n; if (i < 0 || i >= months.length) return; sel = months[i]; renderMonths(); renderGrid(); history.replaceState(null, '', '?y=' + Y + '&m=' + mk(sel)); }
  $('#mprev').addEventListener('click', function () { step(-1); }); $('#mnext').addEventListener('click', function () { step(1); });
  $('#mtoday').addEventListener('click', function () { var t = months.filter(function (x) { return x.y === now.getFullYear() && x.m === now.getMonth() + 1; })[0]; if (t) { sel = t; renderMonths(); renderGrid(); } else A.toast('Today is outside this academic year.'); });
  $('#yprev').addEventListener('click', function () { location.search = '?y=' + (Y - 1); }); $('#ynext').addEventListener('click', function () { location.search = '?y=' + (Y + 1); });
  $('#pdf').addEventListener('click', function () { window.print(); });

  /* search (asks the backend) */
  var st;
  $('#q').addEventListener('input', function () {
    var v = this.value.trim(), box = $('#sres'); clearTimeout(st);
    if (v.length < 2) { box.hidden = true; return; }
    st = setTimeout(function () {
      box.hidden = false;
      if (!A.connected()) { box.innerHTML = '<a>Search will work once the backend is connected.</a>'; return; }
      A.get('/search', { q: v, year: Y }).then(function (r) {
        var l = A.arr(r && r.results);
        box.innerHTML = l.length ? l.map(function (x) { return '<a href="calendar.html?d=' + esc(x.date) + '"><b>' + esc(x.title || x.subject) + '</b><small>' + esc(A.nice(x.date)) + (x.snippet ? ' &middot; ' + esc(x.snippet) : '') + '</small></a>'; }).join('') : '<a>No matches.</a>';
      }).catch(function () { box.innerHTML = '<a>Search is not available right now.</a>'; });
    }, 300);
  });

  /* personal events (saved on this device) */
  $('#addev').addEventListener('click', function () { var f = $('#f-ev'); f.reset(); f.elements.date.value = today; $('#dlg-ev').showModal(); });
  $('#f-ev').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target; if (!f.checkValidity()) { f.reportValidity(); return; }
    PE.push({ id: A.uid(), title: f.elements.title.value.trim(), date: f.elements.date.value, time: f.elements.time.value });   // BACKEND: POST this to /events if you want it synced
    A.wr('hx_personal_v1', PE); $('#dlg-ev').close(); renderGrid(); renderSide(); A.toast('Event added');
  });

  /* export to any calendar app (.ics) */
  $('#ics').addEventListener('click', function () {
    function f(v) { var d = new Date(v); return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + 'T' + p2(d.getHours()) + p2(d.getMinutes()) + '00'; }
    function t(s) { return String(s).replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n'); }
    function allday(k) { return k.replace(/-/g, ''); }
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//THE PENTAGON//Calendar//EN'], n = 0;
    function ev(a) { L.push('BEGIN:VEVENT', 'UID:' + A.uid() + '@hexagon'); a.forEach(function (x) { L.push(x); }); L.push('END:VEVENT'); n++; }
    Object.keys(days()).forEach(function (k) {
      var d = days()[k];
      A.arr(d.classes).forEach(function (c) { ev(['DTSTART:' + f(c.start), 'DTEND:' + f(c.end || new Date(c.start).getTime() + 3600000), 'SUMMARY:' + t(c.subject + (c.teacher ? ' (' + c.teacher + ')' : ''))]); });
      A.arr(d.events).forEach(function (e) { ev(['DTSTART;VALUE=DATE:' + allday(k), 'SUMMARY:' + t(e.title)]); });
      if (d.holiday) ev(['DTSTART;VALUE=DATE:' + allday(k), 'SUMMARY:' + t(d.holiday)]);
    });
    PE.forEach(function (e) { ev(['DTSTART;VALUE=DATE:' + allday(e.date), 'SUMMARY:' + t(e.title)]); });
    if (!n) { A.toast('Nothing to export yet.'); return; }
    L.push('END:VCALENDAR');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L.join('\r\n')], { type: 'text/calendar' })); a.download = 'my-calendar-' + Y + '.ics'; a.click();
  });

  A.watch(function () { return A.get('/calendar/year', { year: Y }); }, function (d) { data = d; renderAll(); }, A.statusFn());
})();