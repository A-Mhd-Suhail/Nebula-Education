--------------------------------------------------------------------------------
# 🌌 Nebula Education v3.1 — Classroom Intelligence Platform

Real-time school platform: Raspberry Pi/ESP32 hardware → Student · Teacher · HM · MEO · DEO portals.

## What's fixed in v3.1
- Profile loads instantly with real data (live onSnapshot + clear errors)
- Live notification center: NEW (red) vs READ sections, delete, mark-all, clear-read — per-user fan-out (no shared docs)
- Feed is live for everyone (student post → all see instantly)
- Doubt flow: student → all teachers → solve → answer + notification back to student
- Separate Leaderboard & AIR for students and teachers
- Registration uses searchable dropdowns (search bar + dropdown combined) for Class & Subject, plus optional class-join PIN
- Firestore rules locked down (no console score/role faking, no catch-all rule)
- Full Raspberry Pi publisher (Python) + ESP32 BLE tag firmware + Cloud Functions

## Hardware events (MQTT)
Pi publishes JSON to `nebula/school_<id>/events`:
ATTENDANCE · HEARTBEAT · NOISE_ALARM · FIGHT · INATTENTION · SPEECH ·
BOARD_CAPTURE · STUDENT_LEFT · STUDENT_RETURNED · TEACHER_ACTIVITY · ENGAGEMENT

## Local setup
1. npm install
2. Copy .env.example → .env, paste your 6 Firebase values
3. npm run dev
4. Deploy Cloud Functions (optional but recommended): cd functions && npm install && firebase deploy --only functions

## Deploy
Push to GitHub → import in Vercel → add VITE_FIREBASE_* env vars → Deploy.
Add your Vercel domain in Firebase → Authentication → Settings → Authorized domains.

