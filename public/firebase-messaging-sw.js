/* Nebula service worker — ONE worker does both jobs:
   1) offline app-shell caching (production builds)
   2) Firebase background push notifications
   ⚠️ REPLACE THE 6 CONFIG VALUES BELOW with YOUR real Firebase config.
      Service workers cannot read .env — this is the one place you paste them. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const CACHE = "nebula-v1";
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put("/index.html", cp)); return res; })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
      return res;
    }).catch(() => hit)),
  );
});

// ⚠️ REPLACE THESE 6 VALUES with your real Firebase config:
firebase.initializeApp({
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_AUTH_DOMAIN",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const t = payload.notification || {};
  self.registration.showNotification(t.title || "Nebula Education", {
    body: t.body || "", icon: "/", tag: "nebula-" + (t.title || ""),
  });
});
