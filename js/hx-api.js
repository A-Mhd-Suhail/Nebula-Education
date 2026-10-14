/* THE PENTAGON - data layer. These pages only READ.
   Teachers' portal, classroom hardware and the AI agent write to your backend. */
(function () {
  'use strict';
  var C = window.HX_CONFIG || {};
  try { if (!localStorage.getItem('hx_session')) { location.replace('../login.html?role=student'); return; } } catch (e) {}
  var A = { cfg: C }, tt;
  A.$ = function (s) { return document.querySelector(s); };
  A.arr = function (x) { return Array.isArray(x) ? x : []; };
  A.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  A.p2 = function (n) { return n < 10 ? '0' + n : '' + n; };
  A.ymd = function (d) { return d.getFullYear() + '-' + A.p2(d.getMonth() + 1) + '-' + A.p2(d.getDate()); };
  A.fromKey = function (k) { return new Date(k + 'T00:00:00'); };
  A.nice = function (k) { var d = A.fromKey(k); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
  A.timeOf = function (v) { var d = new Date(v); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  A.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  A.safeUrl = function (u) { try { var x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
  A.safeImg = function (u) { u = String(u || ''); return /^(data:image\/(png|jpe?g|gif|webp);|https?:\/\/|\/)/i.test(u) ? u : ''; };
  A.rd = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  A.wr = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { A.toast('Browser storage is full.'); return false; } };
  A.toast = function (m) { var t = A.$('#toast'); if (!t) return; t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 3200); };

  A.connected = function () { return !!C.API_BASE; };
  function token() { try { return localStorage.getItem('hx_token') || ''; } catch (e) { return ''; } }
  function url(path, params) {
    var u = String(C.API_BASE).replace(/\/$/, '') + path, q = [];
    Object.keys(params || {}).forEach(function (k) { if (params[k] != null && params[k] !== '') q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); });
    return q.length ? u + '?' + q.join('&') : u;
  }
  function req(method, path, o) {
    o = o || {};
    if (!A.connected()) return Promise.reject(new Error('not-connected'));
    var h = { Accept: 'application/json' }, t = token(), body;
    if (t) h.Authorization = 'Bearer ' + t;
    if (o.form) body = o.form; else if (o.json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(o.json); }
    return fetch(url(path, o.params), { method: method, headers: h, body: body }).then(function (r) {
      if (r.status === 401) { location.replace('login.html?role=student'); throw new Error('unauthorized'); }
      if (!r.ok) throw new Error('http-' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }
  A.get = function (p, q) { return req('GET', p, { params: q }); };
  A.post = function (p, j) { return req('POST', p, { json: j || {} }); };
  A.upload = function (p, f) { return req('POST', p, { form: f }); };

  /* loads now, then keeps refreshing: timer + when you come back to the tab + optional live stream */
  A.watch = function (load, apply, status) {
    var last = null, shown = false;
    function run() {
      if (document.hidden) return;
      load().then(function (d) {
        var s = JSON.stringify(d);
        if (s !== last || !shown) { last = s; shown = true; apply(d); }
        status('live', new Date());
      }).catch(function (e) {
        if (!shown) { shown = true; apply(null); }
        status(e && e.message === 'not-connected' ? 'off' : 'error');
      });
    }
    run(); setInterval(run, C.POLL_MS || 30000);
    document.addEventListener('visibilitychange', run); window.addEventListener('focus', run);
    if (C.STREAM_URL && window.EventSource) { try { new EventSource(C.STREAM_URL).addEventListener('update', run); } catch (e) {} }
    return { refresh: run };
  };
  A.statusFn = function () {
    return function (s, t) {
      var chip = A.$('#sync'), b = A.$('#conn');
      if (chip) chip.innerHTML = '<i class="sd ' + s + '"></i>' + (s === 'live' ? 'Live &middot; updated ' + A.timeOf(t) : s === 'off' ? 'Backend not connected' : 'Offline &middot; showing last data');
      if (b) { b.hidden = s === 'live'; b.textContent = s === 'off' ? 'The classroom backend is not connected yet. Set API_BASE in hx-config.js. Notes from your teachers, the classroom hardware and the AI agent will appear here automatically once it is connected.' : 'Could not reach the classroom server. Showing the last data. Trying again soon.'; }
    };
  };

  /* top bar */
  var P = (A.rd('hx_student_v2', {}) || {}).profile, av = A.$('#nav-av');
  if (av) { av.style.backgroundImage = P && P.avatar ? 'url("' + P.avatar + '")' : ''; av.textContent = P && P.avatar ? '' : (P && P.name ? P.name.charAt(0).toUpperCase() : ''); }
  var out = A.$('#logout');
  if (out) out.addEventListener('click', function (e) { e.preventDefault(); try { localStorage.removeItem('hx_session'); } catch (x) {} location.href = '../index.html'; });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-soon]')) { e.preventDefault(); A.toast('This section is coming soon.'); } });
  window.HXAPI = A;
})();
