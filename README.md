# 🌌 Nebula Education v3.2 — Classroom Intelligence Platform

## Setup
1. `npm install`   (use `npm install firebase@latest` if you want the newest — never `npm audit fix --force`, it downgrades Firebase and breaks the build)
2. Copy `.env.example` → `.env`, paste your 6 Firebase values
3. `npm run dev`

## Audit warnings (read this)
`npm audit` may report moderate vulnerabilities in Firebase's transitive deps
(undici / protobufjs). This is upstream and unfixable on your side. Policy:
- CI/deploy gate: `npm audit --audit-level=high` (script `audit:ci` included)
- Try `npm install firebase@latest` when new versions ship
- ❌ NEVER run `npm audit fix --force` — it downgrades Firebase and breaks everything.
  If someone already did: `rm -rf node_modules package-lock.json && npm install`

## Deploy checklist
- Vercel: push → import → add VITE_FIREBASE_* env vars → deploy. Add the Vercel domain
  in Firebase Console → Authentication → Settings → Authorized domains.
- Cloud Functions (REQUIRED for AIR scores): `firebase login` → `firebase deploy --only functions`
- Deploy rules: `firebase deploy --only firestore:rules,storage`
- Push notifications (optional): Firebase Console → Cloud Messaging → Web Push certificates
  → copy the keypair into `.env` as VITE_FIREBASE_VAPID_KEY. Also replace the 6 config
  values inside `public/firebase-messaging-sw.js` (service workers can't read .env).

## Firestore TTL policies (set once in Firebase Console → Firestore → TTL)
- `boardImages`  → field `capturedAt` → expire after 90 days
- `classroomEvents` → field `timestamp` → 30 days
- `noiseEvents`  → field `createdAt` → 90 days
- `speechLogs`   → field `createdAt` → 30 days

## AIR scores — how they work now
`recomputeAirScore` and `recomputeTeacherScore` are Cloud Functions. The client only
calls them (httpsCallable). Weights come from HM → System Config → settings/hardware.airWeights.
If functions are NOT deployed, scores silently won't update — deploy them!

## Hardware
Pi: `pip install -r requirements.txt`, put `serviceAccount.json` next to publisher.py
(NEVER commit it), edit `config.json`, then `python3 publisher.py` or install the systemd service.
ESP32 tags: flash `esp32/tag.ino`, set a unique TAG_ID per student, link in HM → System Config.
Private MQTT broker (HiveMQ Cloud etc.) credentials go in Firestore settings/hardware
via HM → System Config (mqttBroker / mqttTopicIn / mqttTopicOut / mqttUser / mqttPass).

## Offline
Firestore offline persistence is enabled (works with flaky school Wi-Fi).
The service worker (`public/firebase-messaging-sw.js`) caches the app shell —
registered only in production builds, so dev stays clean.

## GIT SAFETY
`pi/serviceAccount.json` is gitignored. If it was ever committed:
`git rm --cached pi/serviceAccount.json && git commit -m "Remove service account"`
then purge history with BFG / git filter-repo AND rotate the key in Firebase Console.
