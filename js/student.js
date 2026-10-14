/* ==========================================================
   THE PENTAGON - student portal logic (profile page + post page)
   Data is kept in this browser (localStorage) until you connect
   a backend. Search for "BACKEND" to find where to plug it in.
   ========================================================== */
(function () {
  'use strict';

  var KEY = 'hx_student_v2', SESS = 'hx_session';
  var CGPA_DIVISOR = 9.5;          // CGPA estimate = average % / 9.5 (change if your board uses another rule)

  /* ---------- must be logged in ---------- */
  try { if (!localStorage.getItem(SESS)) { location.replace('login.html?role=student'); return; } } catch (e) {}

  /* ---------- data (BACKEND: replace load() / save() with API calls) ---------- */
  function blank() {
    return { profile: null, about: {}, marks: [], skills: [], ach: [], courses: [], done: [], days: [], events: [], goals: [], posts: [], draft: null, conn: {} };
  }
  function load() {
    try { var d = JSON.parse(localStorage.getItem(KEY)); if (d) return Object.assign(blank(), d); } catch (e) {}
    return blank();
  }
  var D = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(D)); }
    catch (e) { toast('Browser storage is full. Remove an image or an old post.'); }
    if (window.PENTAGON_FB && window.PENTAGON_FB.enabled && window.PENTAGON_FB.user()) {
      window.PENTAGON_FB.saveUserData({ studentData: D, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () { toast('Saved locally, but cloud sync failed.'); });
    }
  }

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function today() { return ymd(new Date()); }
  function nice(s) { if (!s) return ''; var d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function list(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
  function el(f, n) { return f.elements[n]; }
  function safeUrl(u) { if (!u) return ''; try { var x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } }
  var tt;
  function toast(m) { var t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function open(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function close(d) { if (d.close) d.close(); else d.removeAttribute('open'); }

  // picture -> centred crop -> small JPEG so it fits in storage
  function pic(file, w, h, cb) {
    var r = new FileReader();
    r.onload = function () {
      var i = new Image();
      i.onload = function () {
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var s = Math.max(w / i.width, h / i.height), iw = w / s, ih = h / s;
        c.getContext('2d').drawImage(i, (i.width - iw) / 2, (i.height - ih) / 2, iw, ih, 0, 0, w, h);
        cb(c.toDataURL('image/jpeg', 0.8));
      };
      i.onerror = function () { toast('That file could not be read as an image.'); };
      i.src = r.result;
    };
    r.readAsDataURL(file);
  }

  // row of chip buttons that behaves like a radio group; value kept in root.dataset.value
  function chipset(root, opts, val, cb) {
    root.innerHTML = opts.map(function (o) { return '<button type="button" class="k' + (o[0] === val ? ' on' : '') + '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join('');
    root.dataset.value = val;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      root.dataset.value = b.getAttribute('data-v');
      $$('button', root).forEach(function (x) { x.classList.toggle('on', x === b); });
      if (cb) cb(root.dataset.value);
    });
  }

  function addEvent(t) { D.events.push({ d: today(), t: t }); if (D.events.length > 100) D.events.shift(); }
  function logDay() { var t = today(); if (D.days.indexOf(t) < 0) D.days.push(t); }
  function streak() {
    var s = {}, n = 0, d = new Date();
    D.days.forEach(function (x) { s[x] = 1; });
    if (!s[ymd(d)]) d.setDate(d.getDate() - 1);
    while (s[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function average() {
    if (!D.marks.length) return null;
    return D.marks.reduce(function (a, m) { return a + m.marks; }, 0) / D.marks.length;
  }

  var TYPES = [
    ['project', 'Project'], ['achievement', 'Achievement'], ['article', 'Article'], ['image', 'Image'], ['video', 'Video'],
    ['link', 'Website'], ['code', 'Code'], ['doc', 'Document'], ['slides', 'Presentation'], ['design', 'Design'],
    ['audio', 'Audio'], ['research', 'Research'], ['event', 'Event'], ['cert', 'Certificate'], ['other', 'Other']
  ];
  function typeName(k) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i][0] === k) return TYPES[i][1]; return 'Post'; }
  function isWon(p) { return p.result === 'won'; }
  function isProject(p) { return p.type === 'project' && p.category === 'academic'; }
  function newest(a) { return a.slice().sort(function (x, y) { return (y.created || 0) - (x.created || 0); }); }

  /* ---------- AIR score (BACKEND / YOUR RULES: replace this formula) ---------- */
  function airScore() {
    // TODO: temporary preview formula, to be replaced with your real AIR score rules
    return Math.round((average() || 0) * 4 + D.posts.length * 10 + D.ach.length * 15 + D.posts.filter(isWon).length * 15 + streak() * 5);
  }

  /* ---------- shared: top bar ---------- */
  function topbar() {
    var av = $('#nav-av'), p = D.profile;
    if (av) { av.style.backgroundImage = p && p.avatar ? 'url("' + p.avatar + '")' : ''; av.textContent = p && p.avatar ? '' : (p && p.name ? p.name.charAt(0).toUpperCase() : ''); }
  }
  $('#logout').addEventListener('click', function (e) {
    e.preventDefault();
    try { localStorage.removeItem(SESS); } catch (x) {}
    location.href = '../index.html';
  });
  document.addEventListener('click', function (e) {
    var s = e.target.closest('[data-soon]'); if (s) { e.preventDefault(); toast('This page is coming soon.'); }
    var c = e.target.closest('[data-close]'); if (c) close(c.closest('dialog'));
  });

  /* compact post card used in the three profile columns */
  function postCard(p) {
    var u = safeUrl(p.link);
    return '<article class="pc">' + (p.img ? '<div class="cv" style="background-image:url(\'' + p.img + '\')"></div>' : '') +
      '<div class="bd"><span class="badge' + (isWon(p) ? ' won' : '') + '">' + esc(typeName(p.type)) + (isWon(p) ? ' · Won' : '') + '</span>' +
      '<h4>' + esc(p.title) + '</h4><p>' + esc(p.desc) + '</p>' +
      '<div class="ft"><span>' + esc(nice(p.date)) + '</span><span>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Open</a> ' : '') +
      '<button class="x" data-act="del-post" data-id="' + p.id + '" title="Delete post">&#10005;</button></span></div></div></article>';
  }

  /* ==========================================================
     PROFILE PAGE
     ========================================================== */
  // BACKEND: replace with real teachers and students from your network
  var PEOPLE = [
    { id: 't1', name: 'Ms. Priya Nair', role: 'Maths teacher', tags: ['maths', 'algebra', 'problem solving', 'puzzles'] },
    { id: 's1', name: 'Rahul S.', role: 'Student · Grade 10', tags: ['robotics', 'chess', 'coding', 'python'] },
    { id: 't2', name: 'Mr. Daniel J.', role: 'Physics teacher', tags: ['physics', 'robotics', 'electronics', 'science'] },
    { id: 's2', name: 'Ananya R.', role: 'Student · Grade 9', tags: ['music', 'guitar', 'english', 'writing'] },
    { id: 't3', name: 'Mrs. Kavitha M.', role: 'English teacher', tags: ['english', 'writing', 'reading', 'debate'] },
    { id: 's3', name: 'Karthik P.', role: 'Student · Grade 11', tags: ['football', 'fitness', 'biology', 'chemistry'] }
  ];

  function dashboard() {
    var dlgP = $('#dlg-profile'), fP = $('#f-profile'), dlgA = $('#dlg-about'), fA = $('#f-about'), tmp = {};
    var ABOUT = ['interests', 'career', 'learnGoals', 'languages', 'strengths', 'coLearner'];

    for (var g = 1; g <= 12; g++) { var o = document.createElement('option'); o.textContent = 'Grade ' + g; el(fP, 'grade').appendChild(o); }
    var oc = document.createElement('option'); oc.textContent = 'College / Undergraduate'; el(fP, 'grade').appendChild(oc);

    /* ----- render ----- */
    function renderProfile() {
      var p = D.profile;
      $('#banner').style.backgroundImage = p && p.banner ? 'url("' + p.banner + '")' : '';
      var av = $('#avatar');
      av.style.backgroundImage = p && p.avatar ? 'url("' + p.avatar + '")' : '';
      av.textContent = p && p.avatar ? '' : (p && p.name ? p.name.charAt(0).toUpperCase() : '?');
      $('#p-name').textContent = p ? p.name : 'Complete your profile';
      $('#p-grade').textContent = p ? p.grade : 'Academic year';
      $('#p-school').textContent = p ? p.school : 'School name';
      $('#p-bio').textContent = p ? p.bio : 'Add your picture, name, grade, school and bio to get started.';
      var avg = average();
      $('#s-avg').textContent = avg == null ? '--' : avg.toFixed(1) + '%';
      $('#s-cgpa').textContent = avg == null ? 'Add your marks' : 'CGPA approx. ' + Math.min(10, avg / CGPA_DIVISOR).toFixed(1);
      $('#s-air').textContent = airScore();
      topbar();
    }
    function renderAbout() {
      var a = D.about, items = [['Interests', 'interests', 1], ['Career goals', 'career'], ['Learning goals', 'learnGoals'], ['Languages known', 'languages', 1], ['Personal strengths', 'strengths', 1], ['Preferred co-learner', 'coLearner']];
      $('#about-grid').innerHTML = items.map(function (it) {
        var v = a[it[1]], body;
        if (!v) body = '<p class="muted">Not added yet</p>';
        else if (it[2]) body = '<div class="chips">' + list(v).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div>';
        else body = '<p>' + esc(v) + '</p>';
        return '<div class="tile"><h3>' + it[0] + '</h3>' + body + '</div>';
      }).join('');
      renderMatches();
    }
    function words(s) { return String(s || '').toLowerCase().split(/[^a-z0-9+#]+/).filter(function (w) { return w.length > 2; }); }
    function renderMatches() {
      var mine = {};
      list(D.about.interests).concat(list(D.about.strengths), D.skills.map(function (s) { return s.name; })).forEach(function (t) { mine[t.toLowerCase()] = 1; words(t).forEach(function (w) { mine[w] = 1; }); });
      words(D.about.career).concat(words(D.about.learnGoals)).forEach(function (w) { mine[w] = 1; });
      var scored = PEOPLE.map(function (p) {
        var n = p.tags.filter(function (t) { return mine[t] || words(t).some(function (w) { return mine[w]; }); }).length;
        return { p: p, pct: Math.min(99, Math.round(100 * n / Math.max(p.tags.length, 3))) };
      }).filter(function (x) { return x.pct > 0; }).sort(function (a, b) { return b.pct - a.pct; }).slice(0, 3);
      $('#match-grid').innerHTML = scored.length ? scored.map(function (x) {
        var asked = D.conn[x.p.id];
        return '<div class="match"><div class="pav">' + esc(x.p.name.replace(/^(Ms|Mr|Mrs)\.? /, '').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2)) + '</div><div><b>' + esc(x.p.name) + '</b><small>' + esc(x.p.role) + ' · ' + x.pct + '% match</small></div>' +
          '<button class="btn ghost sm" data-act="connect" data-id="' + x.p.id + '">' + (asked ? 'Requested' : 'Connect') + '</button></div>';
      }).join('') : '<div class="empty" style="grid-column:1/-1">Add interests and skills to see teachers and students who match you.</div>';
    }
    function renderMarks() {
      var avg = average();
      $('#avg-big').textContent = avg == null ? '--' : avg.toFixed(1) + '%';
      $('#avg-n').textContent = D.marks.length;
      $('#marks').innerHTML = D.marks.length ? D.marks.map(function (m) {
        return '<div class="row"><span class="nm">' + esc(m.subject) + '</span><div class="bar"><i style="width:' + m.marks + '%"></i></div><b>' + m.marks + '%</b><button class="x" data-act="del-mark" data-id="' + m.id + '" title="Remove">&#10005;</button></div>';
      }).join('') : '<div class="empty">Add a subject to see your average here.</div>';
    }
    function renderSkills() {
      [['Academic', '#sk-a'], ['Extra-curricular', '#sk-e']].forEach(function (k) {
        var s = D.skills.filter(function (x) { return x.kind === k[0]; });
        $(k[1]).innerHTML = s.length ? s.map(function (x) {
          return '<span class="chip">' + esc(x.name) + ' <small>' + esc(x.level) + '</small><button class="x" data-act="del-skill" data-id="' + x.id + '" title="Remove">&#10005;</button></span>';
        }).join('') : '<span class="muted sm">None added yet</span>';
      });
    }
    function renderAch() {
      var won = D.posts.filter(isWon).map(function (p) { return { title: p.title, date: p.date, desc: p.desc, kind: typeName(p.type) + ' won', post: 1 }; });
      var a = D.ach.map(function (x) { return { id: x.id, title: x.title, date: x.date, desc: x.desc, kind: 'Achievement' }; }).concat(won)
        .sort(function (x, y) { return (y.date || '').localeCompare(x.date || ''); });
      $('#ach-list').innerHTML = a.length ? a.map(function (x) {
        return '<div class="ach"><div class="ic">&#9733;</div><div><h4>' + esc(x.title) + '</h4><p>' + esc(x.kind) + (x.desc ? ' · ' + esc(x.desc.length > 120 ? x.desc.slice(0, 120) + '...' : x.desc) : '') + '</p></div>' +
          '<span class="d">' + esc(nice(x.date)) + '</span>' + (x.post ? '' : '<button class="x" data-act="del-ach" data-id="' + x.id + '" title="Remove">&#10005;</button>') + '</div>';
      }).join('') : '<div class="empty">Add an achievement, or publish a post marked as won.</div>';
    }
    function renderLearning() {
      $('#streak-badge').textContent = streak() + '-day streak';
      var on = {}; D.days.forEach(function (x) { on[x] = 1; });
      var wk = '', d = new Date(); d.setDate(d.getDate() - 6);
      for (var i = 0; i < 7; i++) { wk += '<span class="wd"><i class="' + (on[ymd(d)] ? 'on' : '') + '"></i><small>' + 'SMTWTFS'.charAt(d.getDay()) + '</small></span>'; d.setDate(d.getDate() + 1); }
      $('#week').innerHTML = wk;

      $('#courses').innerHTML = D.courses.length ? D.courses.map(function (c) {
        return '<div class="course"><div class="t"><span>' + esc(c.name) + '</span><button class="x" data-act="del-course" data-id="' + c.id + '" title="Remove">&#10005;</button></div>' +
          '<div class="pr"><input type="range" min="0" max="100" step="5" value="' + c.progress + '" data-act="progress" data-id="' + c.id + '" aria-label="Progress for ' + esc(c.name) + '"><b>' + c.progress + '%</b></div>' +
          (c.progress >= 100 ? '<button class="btn sm" style="margin-top:8px" data-act="complete" data-id="' + c.id + '">Mark as completed</button>' : '') + '</div>';
      }).join('') : '<div class="empty">Log what you are learning and it appears here.</div>';

      $('#done').innerHTML = D.done.length ? D.done.slice().reverse().map(function (c) { return '<div class="done"><span>' + esc(c.name) + '</span><small>' + esc(nice(c.date)) + '</small></div>'; }).join('') : '<div class="empty">Completed courses appear here.</div>';

      var gs = D.goals.slice().sort(function (a, b) { return (a.done - b.done) || (a.date || '9').localeCompare(b.date || '9'); });
      $('#goals').innerHTML = gs.length ? gs.map(function (g) {
        return '<div class="goal' + (g.done ? ' is-done' : '') + '"><input type="checkbox" data-act="goal" data-id="' + g.id + '"' + (g.done ? ' checked' : '') + '><span>' + esc(g.text) + '</span>' +
          (g.date ? '<small>' + esc(nice(g.date)) + '</small>' : '') + '<button class="x" data-act="del-goal" data-id="' + g.id + '" title="Remove">&#10005;</button></div>';
      }).join('') : '<div class="empty">Set a goal you want to reach next.</div>';

      var ev = D.events.slice(-10).reverse();
      $('#timeline').innerHTML = ev.length ? ev.map(function (x) { return '<li>' + esc(x.t) + '<small>' + esc(nice(x.d)) + '</small></li>'; }).join('') : '<li>Your learning journey starts here.<small>Log your first topic</small></li>';
    }
    function renderPosts() {
      var ps = newest(D.posts), sets = [['#col-all', ps, '#n-all'], ['#col-proj', ps.filter(isProject), '#n-proj'], ['#col-won', ps.filter(isWon), '#n-won']];
      sets.forEach(function (s) {
        $(s[2]).textContent = s[1].length;
        $(s[0]).innerHTML = s[1].length ? s[1].map(postCard).join('') : '<div class="empty">Nothing here yet.</div>';
      });
    }
    function all() { renderProfile(); renderAbout(); renderMarks(); renderSkills(); renderAch(); renderLearning(); renderPosts(); }

    /* ----- quick edit: banner and picture ----- */
    function quick(btn, input, key, w, h, label) {
      $(btn).addEventListener('click', function () { if (!D.profile) { toast('Complete your profile first.'); return; } $(input).click(); });
      $(input).addEventListener('change', function () {
        var f = this.files[0], self = this; if (!f) return;
        pic(f, w, h, function (u) { D.profile[key] = u; addEvent('Updated my ' + label); save(); all(); self.value = ''; });
      });
    }
    quick('#btn-banner', '#in-banner', 'banner', 1200, 300, 'banner');
    quick('#btn-avatar', '#in-avatar', 'avatar', 320, 320, 'profile picture');

    /* ----- profile dialog (required fields) ----- */
    function openProfile() {
      var p = D.profile || {}; tmp = {};
      ['name', 'grade', 'school', 'bio'].forEach(function (k) { el(fP, k).value = p[k] || ''; });
      el(fP, 'banner').value = ''; el(fP, 'avatar').value = '';
      el(fP, 'avatar').required = !p.avatar;
      $('#pf-cancel').hidden = !D.profile; $('#pf-err').textContent = '';
      open(dlgP);
    }
    el(fP, 'banner').addEventListener('change', function () { var f = this.files[0]; tmp.banner = null; if (f) pic(f, 1200, 300, function (u) { tmp.banner = u; }); });
    el(fP, 'avatar').addEventListener('change', function () { var f = this.files[0]; tmp.avatar = null; if (f) pic(f, 320, 320, function (u) { tmp.avatar = u; }); });
    dlgP.addEventListener('cancel', function (e) { if (!D.profile) e.preventDefault(); });
    $('#pf-cancel').addEventListener('click', function () { close(dlgP); });
    fP.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!fP.checkValidity()) { fP.reportValidity(); return; }
      if ((el(fP, 'banner').files.length && !tmp.banner) || (el(fP, 'avatar').files.length && !tmp.avatar)) { $('#pf-err').textContent = 'Your image is still loading. Please try again.'; return; }
      var old = D.profile || {}, first = !D.profile;
      D.profile = { banner: tmp.banner || old.banner || '', avatar: tmp.avatar || old.avatar,
        name: el(fP, 'name').value.trim(), grade: el(fP, 'grade').value, school: el(fP, 'school').value.trim(), bio: el(fP, 'bio').value.trim() };
      addEvent(first ? 'Created my student profile' : 'Updated my profile');
      save(); close(dlgP); all(); toast('Profile saved');
    });
    $('#edit-profile').addEventListener('click', openProfile);

    /* ----- about dialog ----- */
    $('#edit-about').addEventListener('click', function () { ABOUT.forEach(function (k) { el(fA, k).value = D.about[k] || ''; }); open(dlgA); });
    fA.addEventListener('submit', function (e) {
      e.preventDefault();
      ABOUT.forEach(function (k) { D.about[k] = el(fA, k).value.trim(); });
      addEvent('Updated my About me'); save(); close(dlgA); all(); toast('About me saved');
    });

    /* ----- add forms ----- */
    function form(id, fn) {
      var f = $(id);
      f.addEventListener('submit', function (e) { e.preventDefault(); if (!f.checkValidity()) { f.reportValidity(); return; } fn(f); f.reset(); save(); all(); });
    }
    form('#mark-form', function (f) { var s = el(f, 'subject').value.trim(); D.marks.push({ id: uid(), subject: s, marks: Math.min(100, Math.max(0, +el(f, 'marks').value)) }); addEvent('Added marks for ' + s); });
    form('#skill-form', function (f) { var n = el(f, 'name').value.trim(); D.skills.push({ id: uid(), name: n, kind: el(f, 'kind').value, level: el(f, 'level').value }); addEvent('Added skill: ' + n); });
    form('#ach-form', function (f) { var t = el(f, 'title').value.trim(); D.ach.push({ id: uid(), title: t, date: el(f, 'date').value, desc: el(f, 'desc').value.trim() }); addEvent('Achievement: ' + t); });
    form('#goal-form', function (f) { var t = el(f, 'text').value.trim(); D.goals.push({ id: uid(), text: t, date: el(f, 'date').value, done: false }); addEvent('New goal: ' + t); });
    form('#log-form', function (f) {
      var t = el(f, 'topic').value.trim();
      if (!D.courses.some(function (c) { return c.name.toLowerCase() === t.toLowerCase(); })) D.courses.push({ id: uid(), name: t, progress: 0 });
      logDay(); addEvent('Learned: ' + t); toast('Logged. Streak: ' + streak() + (streak() === 1 ? ' day' : ' days'));
    });

    /* ----- clicks on list items ----- */
    function find(a, id) { return a.filter(function (x) { return x.id === id; })[0]; }
    function drop(a, id) { return a.filter(function (x) { return x.id !== id; }); }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (act === 'del-mark') D.marks = drop(D.marks, id);
      else if (act === 'del-skill') D.skills = drop(D.skills, id);
      else if (act === 'del-ach') D.ach = drop(D.ach, id);
      else if (act === 'del-course') D.courses = drop(D.courses, id);
      else if (act === 'del-goal') D.goals = drop(D.goals, id);
      else if (act === 'del-post') { if (!confirm('Delete this post?')) return; D.posts = drop(D.posts, id); }
      else if (act === 'connect') D.conn[id] = !D.conn[id];       // BACKEND: send a real connection request
      else if (act === 'complete') {
        var c = find(D.courses, id); if (!c) return;
        D.done.push({ id: c.id, name: c.name, date: today() }); D.courses = drop(D.courses, id);
        addEvent('Completed ' + c.name); logDay(); toast('Course completed. Well done!');
      } else return;
      save(); all();
    });
    document.addEventListener('input', function (e) {
      if (e.target.getAttribute('data-act') === 'progress') e.target.parentNode.querySelector('b').textContent = e.target.value + '%';
    });
    document.addEventListener('change', function (e) {
      var act = e.target.getAttribute('data-act'), id = e.target.getAttribute('data-id');
      if (act === 'progress') { var c = find(D.courses, id); if (!c) return; c.progress = +e.target.value; addEvent(c.name + ' is now ' + c.progress + '% complete'); logDay(); save(); all(); }
      else if (act === 'goal') { var g = find(D.goals, id); if (!g) return; g.done = e.target.checked; if (g.done) addEvent('Reached goal: ' + g.text); save(); all(); }
    });

    all();
    if (window.PENTAGON_FB && window.PENTAGON_FB.enabled && window.PENTAGON_FB.user()) {
      window.PENTAGON_FB.loadUserData().then(function (remote) {
        if (remote && remote.studentData) { D = Object.assign(blank(), remote.studentData); try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} all(); }
      }).catch(function () { /* local data remains available */ });
    }
    if (!D.profile) openProfile();          // first visit: profile is mandatory
  }

  /* ==========================================================
     POST PAGE
     ========================================================== */
  function postPage() {
    var f = $('#f-post'), img = '', NEED = { video: 'link', link: 'link', code: 'link', image: 'img' };
    topbar();

    function val(id) { return $(id).dataset.value; }
    chipset($('#types'), TYPES, 'project', refresh);
    chipset($('#cat'), [['academic', 'Academic'], ['eca', 'Extra-curricular']], 'academic', refresh);
    chipset($('#res'), [['none', 'None'], ['won', 'Won'], ['participated', 'Participated']], 'none', refresh);
    chipset($('#vis'), [['everyone', 'Everyone'], ['class', 'My class'], ['me', 'Only me']], 'everyone');
    el(f, 'date').value = today();

    function refresh() {
      var t = val('#types'), n = NEED[t];
      el(f, 'link').required = n === 'link'; $('#lb-link').firstChild.nodeValue = n === 'link' ? 'Link *' : 'Link (optional)';
      $('#drop-t').innerHTML = img ? 'Image added. Click to change.' : (n === 'img' ? 'Cover image required. Drop an image or <b>browse</b>' : 'Drop an image here or <b>browse</b>');
      var title = el(f, 'title').value.trim(), desc = el(f, 'desc').value.trim();
      $('#pv-title').textContent = title || 'Your title';
      $('#pv-desc').textContent = desc || 'Your description appears here.';
      $('#pv-badge').textContent = typeName(t) + (val('#res') === 'won' ? ' · Won' : '');
      $('#pv-date').textContent = nice(el(f, 'date').value);
      var cv = $('#pv-cv'); cv.style.backgroundImage = img ? 'url("' + img + '")' : ''; cv.textContent = img ? '' : 'NO IMAGE';
      var proj = t === 'project' && val('#cat') === 'academic', won = val('#res') === 'won';
      [['#w-all', true, 'All posts'], ['#w-proj', proj, 'Projects (academic projects only)'], ['#w-won', won, 'Achievements (only when the result is Won)']].forEach(function (w) {
        $(w[0]).innerHTML = '<span class="' + (w[1] ? 'yes' : 'no') + '">' + (w[1] ? '&#10003;' : '&ndash;') + '</span> ' + w[2];
      });
    }
    ['title', 'desc', 'date'].forEach(function (n) { el(f, n).addEventListener('input', refresh); });
    el(f, 'img').addEventListener('change', function () {
      var file = this.files[0]; if (!file) return;
      pic(file, 900, 560, function (u) { img = u; refresh(); });
    });

    /* draft: one saved draft, restored when you come back */
    function draftNow() { return { type: val('#types'), cat: val('#cat'), res: val('#res'), vis: val('#vis'), title: el(f, 'title').value, desc: el(f, 'desc').value, link: el(f, 'link').value, tags: el(f, 'tags').value, date: el(f, 'date').value, img: img }; }
    function pick(root, v) { var b = $('[data-v="' + v + '"]', root); if (b) b.click(); }
    if (D.draft) {
      var d = D.draft; img = d.img || '';
      pick($('#types'), d.type); pick($('#cat'), d.cat); pick($('#res'), d.res); pick($('#vis'), d.vis);
      el(f, 'title').value = d.title; el(f, 'desc').value = d.desc; el(f, 'link').value = d.link; el(f, 'tags').value = d.tags; el(f, 'date').value = d.date;
      toast('Draft restored');
    }
    refresh();
    $('#save-draft').addEventListener('click', function () { D.draft = draftNow(); save(); toast('Draft saved'); });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#err'); err.textContent = '';
      if (!f.checkValidity()) { f.reportValidity(); return; }
      if (NEED[val('#types')] === 'img' && !img) { err.textContent = 'Please add a cover image for an image post.'; return; }
      var link = el(f, 'link').value.trim(), url = safeUrl(link);
      if (link && !url) { err.textContent = 'Please enter a valid link starting with http:// or https://'; return; }
      var post = { id: uid(), created: Date.now(), type: val('#types'), category: val('#cat'), result: val('#res'), visibility: val('#vis'),
        title: el(f, 'title').value.trim(), desc: el(f, 'desc').value.trim(), link: url, img: img,
        tags: list(el(f, 'tags').value).slice(0, 6), date: el(f, 'date').value || today() };
      D.posts.push(post); D.draft = null;       // BACKEND: send the post to your server here
      addEvent('Posted: ' + post.title); save(); toast('Post published');
      setTimeout(function () { location.href = 'dashboard.html#posts'; }, 700);
    });
  }

  if (document.body.getAttribute('data-page') === 'dashboard') dashboard(); else postPage();
})();
