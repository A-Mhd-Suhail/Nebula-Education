# 🌌 Nebula Education

Smart School Platform — Student · Teacher · HM · MEO · DEO portals with the
interlinked 3-Device system (Tab ⇄ Hardware ⇄ Teacher's Hood).

## Stack
Vite + TypeScript · Firebase (Auth + Firestore) · Vercel hosting

## Local setup
1. npm install
2. Copy .env.example → .env and paste your Firebase web-app config values
3. npm run dev

## Deploy
Push to GitHub → import repo in Vercel → add the same VITE_FIREBASE_* env
vars in Vercel project settings → Deploy.
Add your Vercel domain in Firebase Console → Authentication → Settings →
Authorized domains.