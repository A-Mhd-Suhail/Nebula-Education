/* THE PENTAGON - Firebase Auth + Firestore adapter. */
(function () {
  'use strict';
  var cfg = window.PENTAGON_FIREBASE_CONFIG || {};
  var ready = cfg.apiKey && cfg.authDomain && cfg.projectId && window.firebase;
  window.PENTAGON_FB = {
    enabled: !!ready,
    auth: null,
    db: null,
    user: function () { return this.auth && this.auth.currentUser; },
    signUp: function (email, password, profile) {
      if (!this.enabled) return Promise.reject(new Error('Firebase is not configured.'));
      var self = this;
      return this.auth.createUserWithEmailAndPassword(email, password).then(function (c) {
        return c.user.updateProfile({ displayName: profile.name || '' }).then(function () {
          return self.db.collection('users').doc(c.user.uid).set(Object.assign({}, profile, { uid: c.user.uid, email: email, createdAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
        }).then(function () { return c.user; });
      });
    },
    signIn: function (email, password) {
      if (!this.enabled) return Promise.reject(new Error('Firebase is not configured.'));
      return this.auth.signInWithEmailAndPassword(email, password).then(function (c) { return c.user; });
    },
    signOut: function () { return this.auth ? this.auth.signOut() : Promise.resolve(); },
    saveUserData: function (data) {
      var u = this.user();
      if (!this.enabled || !u) return Promise.reject(new Error('Not signed in.'));
      return this.db.collection('users').doc(u.uid).set(data, { merge: true });
    },
    loadUserData: function () {
      var u = this.user();
      if (!this.enabled || !u) return Promise.reject(new Error('Not signed in.'));
      return this.db.collection('users').doc(u.uid).get().then(function (s) { return s.exists ? s.data() : {}; });
    }
  };
  if (!ready) return;
  firebase.initializeApp(cfg);
  window.PENTAGON_FB.auth = firebase.auth();
  window.PENTAGON_FB.db = firebase.firestore();
})();
