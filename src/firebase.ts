import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/** Read an env var, trimming stray spaces and surrounding quotes. */
function env(key: string): string {
  const raw = String(import.meta.env[key] ?? "").trim();
  return raw.replace(/^["']|["']$/g, "");
}

export const firebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("VITE_FIREBASE_APP_ID"),
};

export const isConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  !firebaseConfig.apiKey.includes("your_"),
);

if (!isConfigured) {
  console.warn(
    "⚠️ Firebase not configured! Check that .env exists, has all 6 VITE_FIREBASE_* values, " +
    "has no quotes/spaces around them, and restart the dev server (Ctrl+C → npm run dev).",
  );
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
