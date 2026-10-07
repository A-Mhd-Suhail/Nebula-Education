import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, limit, onSnapshot, increment, arrayUnion, arrayRemove,
} from "firebase/firestore";

const env = (k: string): string =>
  String(import.meta.env[k] ?? "").trim().replace(/^["']|["']$/g, "");

const cfg = {
  apiKey: env("VITE_FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("VITE_FIREBASE_APP_ID"),
};

export const configured = Boolean(cfg.apiKey && cfg.projectId && !cfg.apiKey.includes("your_"));

const app = initializeApp(cfg);
export const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- types ---------------- */
export type Role = "student" | "teacher" | "hm" | "meo" | "deo";

export interface User {
  uid: string; name: string; email: string; role: Role;
  studentId?: string; teacherId?: string; className?: string; subject?: string;
  airScore: number; createdAt?: number;
}
export interface Session { id: string; teacherUid: string; teacherName: string; subject: string; className: string; startedAt: number; active: boolean; }
export interface Content { id: string; sessionId: string; type: "note" | "video" | "test"; text: string; quiz?: { question: string; options: string[]; correctIndex: number; subject: string }; createdAt: number; }
export interface Assignment { id: string; title: string; due?: string; subject?: string; by?: string; kind?: "homework" | "assignment"; createdAt: number; }
export interface Mark { id: string; studentUid: string; exam: string; subject: string; score: number; total: number; createdAt: number; }
export interface Doubt { id: string; studentUid: string; studentName: string; subject: string; question: string; status: "open" | "solved"; answer?: string; answeredBy?: string; createdAt: number; }
export interface Post { id: string; authorUid: string; authorName: string; role: Role; kind?: "thought" | "achievement"; content: string; likes: string[]; createdAt: number; }
export interface Project { id: string; studentUid: string; studentName: string; title: string; description?: string; link?: string; likes: string[]; createdAt: number; }
export interface Rating { id: string; teacherUid: string; teacherName: string; studentName: string; stars: number; comment?: string; createdAt: number; }
export interface Topic { id: string; date: string; subject: string; topic: string; doneTeacher: boolean; doneAI: boolean; createdAt: number; }
export interface QuizDoc { id: string; question: string; options: string[]; correctIndex: number; subject: string; }
export interface Attendance { id: string; date: string; uid: string; name: string; role: Role; method: string; createdAt: number; }

/* ------------- data layer (index-free: single where + client sort) ------------- */
export const add = async (col: string, data: object): Promise<string> =>
  (await addDoc(collection(db, col), data)).id;

export const set = async (col: string, id: string, data: object): Promise<void> => {
  await setDoc(doc(db, col, id), data, { merge: true });
};

export const get = async <T>(col: string, id: string): Promise<T | null> => {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
};

export const list = async <T>(col: string, w?: [string, unknown]): Promise<T[]> => {
  const qy = w
    ? query(collection(db, col), where(w[0], "==", w[1]), limit(300))
    : query(collection(db, col), limit(300));
  return (await getDocs(qy)).docs.map((d) => ({ id: d.id, ...d.data() }) as T);
};

export const watch = <T>(col: string, cb: (rows: T[]) => void, w?: [string, unknown]): (() => void) => {
  const qy = w
    ? query(collection(db, col), where(w[0], "==", w[1]), limit(200))
    : query(collection(db, col), limit(200));
  return onSnapshot(
    qy,
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
    (err) => console.error(`${col}: ${err.message}`),
  );
};

export const update = async (col: string, id: string, patch: object): Promise<void> => {
  await updateDoc(doc(db, col, id), patch);
};

export const bumpAir = async (uid: string, points: number): Promise<void> => {
  await updateDoc(doc(db, "users", uid), { airScore: increment(points) });
};

export { arrayUnion, arrayRemove };

export const authErr = (e: unknown): string => {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "Invalid email.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Wrong password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "Email already registered.",
    "auth/weak-password": "Password needs at least 6 characters.",
    "auth/too-many-requests": "Too many attempts — try later.",
    "auth/operation-not-allowed": "Enable Email/Password sign-in in Firebase Console.",
  };
  return map[code] ?? "Something went wrong. Try again.";
};
