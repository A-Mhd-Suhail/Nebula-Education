/* THE PENTAGON - login / sign up behaviour (used by login.html and signup.html) */
(function () {
  'use strict';
  var page = document.body.getAttribute('data-page');          // 'login' or 'signup'
  var NAMES = { student: 'Student', faculty: 'Faculty', school: 'School Administration', admin: 'Admin' };

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.role-tab'));
  var roleLabel = document.getElementById('auth-role');
  var switchLink = document.getElementById('switch-link');
  var form = document.getElementById('auth-form');
  var status = document.getElementById('auth-status');

  /* ---------- which role? comes from the link, e.g. login.html?role=faculty ---------- */
  var role = new URLSearchParams(window.location.search).get('role');
  if (!NAMES[role]) role = 'student';
  var available = tabs.map(function (t) { return t.getAttribute('data-role'); });
  if (available.indexOf(role) === -1) role = available[0];     // e.g. "admin" has no sign-up tab

  function setRole(r) {
    role = r;
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-role') === r); });
    if (roleLabel) roleLabel.textContent = NAMES[r];
    if (switchLink) {
      var other = page === 'login' ? 'signup.html' : 'login.html';
      // Admin has no public sign-up page
      switchLink.href = (page === 'login' && r === 'admin') ? 'login.html?role=admin' : other + '?role=' + r;
      if (page === 'login') switchLink.parentNode.style.visibility = (r === 'admin') ? 'hidden' : 'visible';
    }
    if (window.history && history.replaceState) history.replaceState(null, '', '?role=' + r);
    status.textContent = ''; status.className = 'auth-status';
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { setRole(t.getAttribute('data-role')); }); });
  setRole(role);

  /* ---------- show / hide password ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.pw-toggle'), function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.parentNode.querySelector('input');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
    });
  });

  /* ---------- submit ---------- */
  function say(msg, bad) { status.textContent = msg; status.className = 'auth-status' + (bad ? ' err' : ''); }

  function destination(r) {
    if (r === 'student') return 'student/dashboard.html';
    if (r === 'faculty') return 'teacher/profile.html';
    return 'index.html';
  }

  function firebaseError(e) {
    var map = { 'auth/invalid-credential': 'Email or password is incorrect.', 'auth/email-already-in-use': 'An account with this email already exists.', 'auth/weak-password': 'Use a stronger password.', 'auth/invalid-email': 'Enter a valid email address.' };
    return map[e && e.code] || (e && e.message) || 'Firebase could not complete the request.';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    if (page === 'signup' && form.password.value !== form.confirm.value) {
      say('The two passwords do not match.', true); return;
    }

    var fb = window.PENTAGON_FB;
    if (!fb || !fb.enabled) { say('Firebase is not configured yet. Add your Firebase web config in js/firebase-config.js.', true); return; }
    say(page === 'login' ? 'Signing in…' : 'Creating your account…');
    var work = page === 'login'
      ? fb.signIn(form.elements.email.value.trim(), form.elements.password.value)
      : fb.signUp(form.elements.email.value.trim(), form.elements.password.value, { role: role, name: form.elements.name.value.trim(), institution: form.elements.institution.value.trim() });
    work.then(function (user) {
      try { localStorage.setItem('hx_session', JSON.stringify({ role: role, uid: user.uid, email: user.email, t: Date.now() })); } catch (err) {}
      window.location.href = destination(role);
    }).catch(function (e) { say(firebaseError(e), true); });
  });

  var forgot = document.querySelector('.row a');
  if (forgot) forgot.addEventListener('click', function (e) {
    e.preventDefault();
    var fb = window.PENTAGON_FB, email = form.elements.email.value.trim();
    if (!email) { say('Enter your email first, then choose Forgot password.', true); return; }
    if (!fb || !fb.enabled) { say('Firebase is not configured yet.', true); return; }
    fb.auth.sendPasswordResetEmail(email).then(function () { say('Password reset email sent.'); }).catch(function (err) { say(firebaseError(err), true); });
  });
})();
