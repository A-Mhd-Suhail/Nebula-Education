/* THE PENTAGON - My class page.
   Profile and marks come from the student's dashboard.
   Class data (timetable, class averages, attendance, leaderboard) is published
   by the teacher classroom portal into "hx_classroom_v1".
   BACKEND: when you have a server, replace read() below with a request that
   returns this same shape for the student's class. */
(function () {
  'use strict';
  var SESS = 'hx_session', SKEY = 'hx_student_v2', CKEY = 'hx_classroom_v1';
  try { if (!localStorage.getItem(SESS)) { location.replace('../login.html?role=student'); return; } } catch (e) {}

  function read(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function shape(c) {
    return {
      classes: Array.isArray(c.classes) ? c.classes : [],      // [{id, subject, teacher, at (ms), link}]
      classAvg: c.classAvg || {},                              // {"Mathematics": 82.5}
      attendance: c.attendance || null,                        // {present: 46, absent: 3}
      leaderboard: Array.isArray(c.leaderboard) ? c.leaderboard : []   // [{name, avg}]
    };
  }
  var S = read(SKEY), P = S.profile || null, marks = S.marks || [], C = shape(read(CKEY)), avg = null;

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { if (!u) return ''; try { var x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } }
  var tt;
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  function ring(el, pct, text) {
    var c = 2 * Math.PI * 50;
    el.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="rt" cx="60" cy="60" r="50"/><circle class="rv" cx="60" cy="60" r="50" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '" transform="rotate(-90 60 60)"/></svg><b>' + esc(text) + '</b>';
    if (pct != null) requestAnimationFrame(function () { el.querySelector('.rv').style.strokeDashoffset = c * (1 - Math.min(100, pct) / 100); });
  }
  function pctText(v) { return v == null ? '--' : Math.round(v) + '%'; }

  /* ---------- profile summary + leaderboard ---------- */
  function renderHero() {
    [$('#c-av'), $('#nav-av')].forEach(function (e) {
      e.style.backgroundImage = P && P.avatar ? 'url("' + P.avatar + '")' : '';
      e.textContent = P && P.avatar ? '' : (P && P.name ? P.name.charAt(0).toUpperCase() : '?');
    });
    $('#c-name').textContent = P ? P.name : 'Your name';
    $('#c-sub').innerHTML = P ? esc(P.grade) + ' &middot; ' + esc(P.school) : '<a href="dashboard.html">Complete your profile on the dashboard</a>';
    ring($('#r-avg'), avg, pctText(avg));
    $('#avg-note').innerHTML = avg == null ? 'Add marks on your <a href="dashboard.html#performance">dashboard</a>' : 'in ' + marks.length + (marks.length === 1 ? ' subject' : ' subjects');

    var el = $('#lb');
    if (!P) { el.innerHTML = '<p class="cl-hint">Complete your profile to join the leaderboard.</p>'; return; }
    var rows = C.leaderboard.filter(function (r) { return r && r.name && typeof r.avg === 'number' && String(r.name).toLowerCase() !== P.name.toLowerCase(); })
      .map(function (r) { return { name: r.name, avg: r.avg, me: false }; });
    if (avg != null) rows.push({ name: P.name, avg: avg, me: true });
    rows.sort(function (a, b) { return b.avg - a.avg; });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    var shown = rows.slice(0, 5), mine = rows.filter(function (r) { return r.me; })[0];
    if (mine && mine.rank > 5) shown.push(mine);
    el.innerHTML = (shown.length ? shown.map(function (r) {
      return '<div class="cl-lbr' + (r.me ? ' me' : '') + '"><span><em>' + r.rank + '</em>' + esc(r.me ? r.name + ' (you)' : r.name) + '</span><span>' + Math.round(r.avg) + '%</span></div>';
    }).join('') : '<div class="cl-lbr me"><span><em>-</em>' + esc(P.name) + ' (you)</span><span>--</span></div>') +
      (C.leaderboard.length ? '' : '<p class="cl-hint">Your classmates appear here when your teacher publishes the class.</p>');
  }

  /* ---------- analytics ---------- */
  function renderAnalytics() {
    ring($('#r-ov'), avg, pctText(avg));
    $('#ov-note').textContent = avg == null ? 'Add your marks to see this.' : 'Based on your marks';

    var cmap = {};
    Object.keys(C.classAvg).forEach(function (k) { cmap[k.toLowerCase()] = C.classAvg[k]; });
    $('#bars').innerHTML = marks.length ? marks.slice(0, 6).map(function (m) {
      var c = cmap[String(m.subject).toLowerCase()], has = typeof c === 'number';
      return '<div class="g"><div class="pair">' +
        '<i class="c' + (has ? '' : ' none') + '" style="height:' + (has ? Math.min(100, c) : 3) + '%" title="Class average"><u>' + (has ? Math.round(c) : '--') + '</u></i>' +
        '<i class="y" style="height:' + Math.min(100, m.marks) + '%" title="You"><u>' + Math.round(m.marks) + '</u></i></div><span>' + esc(m.subject) + '</span></div>';
    }).join('') : '<p class="cl-empty">Add subject marks on your <a href="dashboard.html#performance">dashboard</a> to see this chart.</p>';

    var a = C.attendance, ul = $('#att');
    if (!a || typeof a.present !== 'number' || typeof a.absent !== 'number') { ring($('#r-att'), null, '--'); ul.innerHTML = '<li>Not published yet</li>'; return; }
    var total = a.present + a.absent, pct = total ? a.present / total * 100 : null;
    ring($('#r-att'), pct, pctText(pct));
    ul.innerHTML = '<li><i></i>Present <b>' + a.present + '</b></li><li><i class="d2"></i>Absent <b>' + a.absent + '</b></li><li><i class="d3"></i>Total <b>' + total + '</b></li>';
  }

  /* ---------- upcoming classes ---------- */
  function dayLabel(ts) {
    var d = new Date(ts), n = new Date(), t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()), d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((d0 - t0) / 864e5);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function upcoming() {
    var now = Date.now() - 3600000;
    return C.classes.filter(function (c) { return c && typeof c.at === 'number' && c.at >= now; }).sort(function (a, b) { return a.at - b.at; });
  }
  function renderClasses() {
    var list = upcoming().slice(0, 6);
    $('#cls-list').innerHTML = list.length ? list.map(function (c) {
      var url = safeUrl(c.link);
      return '<div class="cl-r"><span class="cl-ic"><i class="ti ti-book-2"></i></span><div><b>' + esc(c.subject) + '</b><small>' + dayLabel(c.at) + ' &middot; ' +
        new Date(c.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</small></div><span class="tc">' + esc(c.teacher) + '</span>' +
        (url ? '<a class="cl-join" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Join</a>' : '<button class="cl-join" data-act="nolink" type="button">Join</button>') + '</div>';
    }).join('') : '<p class="cl-empty">No classes scheduled yet. Your teachers\' classes will appear here automatically when they publish them.</p>';
  }

  /* ---------- page events ---------- */
  document.addEventListener('click', function (e) {
    var s = e.target.closest('[data-soon]'); if (s) { e.preventDefault(); toast('This section is coming soon.'); return; }
    var b = e.target.closest('[data-act="nolink"]'); if (b) toast('Your teacher has not added a link for this class yet.');
  });
  $('#go-live').addEventListener('click', function (e) {
    var n = upcoming().filter(function (c) { return safeUrl(c.link); })[0];
    if (n) { e.preventDefault(); window.open(safeUrl(n.link), '_blank', 'noopener'); }
    else toast('No live class link has been published yet.');
  });
  $('#logout').addEventListener('click', function (e) { e.preventDefault(); try { localStorage.removeItem(SESS); } catch (x) {} location.href = '../index.html'; });

  function renderAll() {
    avg = marks.length ? marks.reduce(function (a, m) { return a + m.marks; }, 0) / marks.length : null;
    renderHero(); renderAnalytics(); renderClasses();
  }
  // updates by itself when the dashboard or the teacher portal saves changes in another tab
  window.addEventListener('storage', function (e) {
    if (e.key === CKEY) C = shape(read(CKEY));
    else if (e.key === SKEY) { S = read(SKEY); P = S.profile || null; marks = S.marks || []; }
    else return;
    renderAll();
  });
  renderAll();
})();