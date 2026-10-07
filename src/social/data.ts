// src/social/data.ts — data layer for the entire social + classroom + study system
import { useEffect, useState } from "react";
import { doc, deleteDoc, updateDoc, increment } from "firebase/firestore";
import { db, add, set, get, list, watch, update, arrayUnion, arrayRemove } from "../firebase";
import type { User } from "../firebase";

/* ============================ types ============================ */
export type VType = "government" | "private";

export interface Profile {
  uid: string; role: User["role"]; name: string;
  photo?: string; banner?: string;
  headline?: string; bio?: string; about?: string;
  school?: string; academicYear?: string; grade?: string;
  yearsExperience?: number;
  education?: string[]; achievements?: string[];
  skillsAcademic?: string[]; skillsPhysical?: string[];
  interests?: string; careerGoals?: string; learningGoals?: string;
  languages?: string; strengths?: string; preferredCoLearner?: string;
  verificationType?: VType | null; verified?: boolean;
  views?: number; socialScore?: number; updatedAt?: number;
}
export interface PostDoc {
  id: string; authorUid: string; authorName: string; authorRole: User["role"];
  kind: string; title: string; body: string; image?: string;
  likes: string[]; interested: string[]; shares: number; createdAt: number;
}
export interface CommentDoc { id: string; postId: string; authorUid: string; authorName: string; text: string; createdAt: number; }
export interface FollowDoc { id: string; followerUid: string; followingUid: string; createdAt: number; }
export interface InboxDoc { id: string; uid: string; withUid: string; withName: string; last: string; at: number; }
export interface MsgDoc { id: string; threadId: string; from: string; fromName: string; text: string; at: number; }
export interface NotifDoc { id: string; toUid: string; title: string; body: string; read: boolean; at: number; }
export interface CourseDoc { id: string; ownerUid: string; title: string; status: "current" | "completed"; progress: number; createdAt: number; updatedAt: number; }
export interface GoalDoc { id: string; ownerUid: string; title: string; due: string; done: boolean; createdAt: number; }
export interface MeetingDoc { id: string; title: string; when: string; place: string; agenda: string; by: string; at: number; }
export interface SalaryDoc { id: string; teacherUid: string; teacherName: string; month: string; amount: number; status: string; note: string; at: number; }
export interface AnnDoc { id: string; title: string; body: string; audience: string; by: string; at: number; }
export interface EventDoc { id: string; title: string; date: string; className: string; note: string; by: string; at: number; }
export interface NoteSection { h: string; points: string[]; }
export interface NoteDoc { id: string; className: string; subject: string; title: string; sections: NoteSection[]; source: string; by: string; byUid: string; at: number; }
export interface StudyRoomDoc { id: string; subject: string; topic: string; hostUid: string; hostName: string; active: boolean; createdAt: number; }
export interface ViolationDoc { id: string; uid: string; roomId: string; reason: string; at: number; }
export interface BanDoc { uid: string; until: number; reason: string; monthsBanned: string[]; }

export const SUBJECTS = [
  "Mathematics", "Science", "English", "Social Studies", "Hindi",
  "Telugu", "Physics", "Chemistry", "Biology", "Computer Science",
];

/* ============================ helpers ============================ */
export const canModerate = (r: User["role"]): boolean => r === "hm" || r === "meo" || r === "deo";
export const threadIdOf = (a: string, b: string): string => [a, b].sort().join("__");
export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const monthKey = (): string => todayISO().slice(0, 7);
export const dayKey = todayISO;

/** Live collection hook (single where — same pattern as views.tsx useWatch). */
export function useCol<T>(col: string, w?: [string, unknown]): T[] {
  const [rows, setRows] = useState<T[]>([]);
  const key = w ? `${w[0]}|${String(w[1])}` : "";
  useEffect(() => {
    const un = watch<T>(col, setRows, w);
    return () => { un(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col, key]);
  return rows;
}

export async function getUserDoc(uid: string): Promise<User | null> {
  return await get<User>("users", uid);
}

export async function notify(toUid: string, title: string, body: string): Promise<void> {
  try { await add("notifications", { toUid, title, body, read: false, at: Date.now() }); } catch { /* ignore */ }
}

/* ============================ profiles ============================ */
export async function ensureProfile(u: User): Promise<Profile> {
  const ex = await get<Profile>("profiles", u.uid);
  if (ex) return ex;
  const fresh: Profile = { uid: u.uid, role: u.role, name: u.name, views: 0, socialScore: 0, updatedAt: Date.now() };
  await set("profiles", u.uid, fresh);
  return fresh;
}
export async function saveProfile(uid: string, patch: Partial<Profile>): Promise<void> {
  await set("profiles", uid, { ...patch, updatedAt: Date.now() });
}
export async function verifyTeacher(uid: string, type: VType | null): Promise<void> {
  await set("profiles", uid, { verified: !!type, verificationType: type, updatedAt: Date.now() });
}

export async function registerView(viewedUid: string, viewerUid: string): Promise<void> {
  if (!viewedUid || viewedUid === viewerUid) return;
  try {
    const id = `${viewedUid}__${viewerUid}__${dayKey()}`;
    const ex = await get<{ id: string }>("profileViews", id);
    if (!ex) {
      await set("profileViews", id, { viewedUid, viewerUid, at: Date.now() });
      await updateDoc(doc(db, "profiles", viewedUid), { views: increment(1) }).catch(async () => {
        await set("profiles", viewedUid, { views: 1, updatedAt: Date.now() });
      });
      scheduleAir(viewedUid);
    }
  } catch (e) { console.debug("[social] view", e); }
}

/* ============================ Sync (follow) ============================ */
export async function isSynced(meUid: string, other: string): Promise<boolean> {
  const rows = (await list<FollowDoc>("follows", ["followerUid", meUid]).catch(() => [])) ?? [];
  return rows.some((f) => f.followingUid === other);
}
export async function toggleSync(meUid: string, other: string): Promise<boolean> {
  const id = `${meUid}__${other}`;
  const ex = await get<FollowDoc>("follows", id);
  if (ex) { await deleteDoc(doc(db, "follows", id)); scheduleAir(other); return false; }
  await set("follows", id, { followerUid: meUid, followingUid: other, createdAt: Date.now() });
  await notify(other, "⚡ New Sync", "Someone synced with your profile");
  scheduleAir(other);
  return true;
}

/* ============================ Air Score engine ============================ */
export async function syncAir(uid: string): Promise<void> {
  try {
    const posts = (await list<PostDoc>("posts", ["authorUid", uid]).catch(() => [])) ?? [];
    let likes = 0, interested = 0, shares = 0, comments = 0;
    for (const p of posts) {
      likes += (p.likes ?? []).length;
      interested += (p.interested ?? []).length;
      shares += p.shares ?? 0;
      const cs = await list<CommentDoc>("postComments", ["postId", p.id]).catch(() => []);
      comments += cs?.length ?? 0;
    }
    const views = (await list<{ id: string }>("profileViews", ["viewedUid", uid]).catch(() => []))?.length ?? 0;
    const followers = (await list<FollowDoc>("follows", ["followingUid", uid]).catch(() => []))?.length ?? 0;
    const score = likes * 2 + interested * 3 + shares * 4 + comments * 2 + views + followers * 5;
    const prof = await get<Profile>("profiles", uid);
    const prev = prof?.socialScore ?? 0;
    await set("profiles", uid, { uid, socialScore: score, updatedAt: Date.now() });
    if (score !== prev) {
      await updateDoc(doc(db, "users", uid), { airScore: increment(score - prev) });
    }
  } catch (e) { console.debug("[social] air", e); }
}
const pendingAir = new Set<string>();
let airTimer: number | null = null;
export function scheduleAir(uid: string): void {
  pendingAir.add(uid);
  if (airTimer !== null) return;
  airTimer = window.setTimeout(() => {
    airTimer = null;
    const ids = [...pendingAir]; pendingAir.clear();
    ids.forEach((u) => { void syncAir(u); });
  }, 4000);
}

/* ============================ posts & impressions ============================ */
export const POST_KINDS = ["Achievement", "Student Achievement", "Idea", "Project", "Portfolio", "Update"] as const;

export async function createPost(u: User, kind: string, title: string, body: string, image?: string): Promise<void> {
  await add("posts", {
    authorUid: u.uid, authorName: u.name, authorRole: u.role, kind,
    title: title.trim(), body: body.trim(), image: image ?? "",
    likes: [], interested: [], shares: 0, createdAt: Date.now(),
  });
  scheduleAir(u.uid);
}
export async function toggleLike(post: PostDoc, uid: string): Promise<void> {
  const has = (post.likes ?? []).includes(uid);
  await update("posts", post.id, { likes: has ? arrayRemove(uid) : arrayUnion(uid) });
  scheduleAir(post.authorUid);
}
export async function markInterested(post: PostDoc, u: User): Promise<void> {
  if ((post.interested ?? []).includes(u.uid)) return;
  await update("posts", post.id, { interested: arrayUnion(u.uid) });
  await notify(post.authorUid, "⭐ Interested", `${u.name} is interested in "${post.title}" — say hi!`);
  scheduleAir(post.authorUid);
}
export async function sharePost(post: PostDoc, u: User): Promise<void> {
  await update("posts", post.id, { shares: (post.shares ?? 0) + 1 });
  try { await navigator.clipboard?.writeText(`${post.title} — ${post.body}`); } catch { /* ignore */ }
  await notify(post.authorUid, "Post shared", `${u.name} shared "${post.title}"`);
  scheduleAir(post.authorUid);
}
export async function addComment(post: PostDoc, u: User, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  await add("postComments", { postId: post.id, authorUid: u.uid, authorName: u.name, text: t, createdAt: Date.now() });
  await notify(post.authorUid, "New comment", `${u.name}: ${t.slice(0, 60)}`);
  scheduleAir(post.authorUid);
}

/* ============================ messages ============================ */
export async function sendMessage(me: User, other: User, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const tid = threadIdOf(me.uid, other.uid);
  await add("messages", { threadId: tid, from: me.uid, fromName: me.name, text: t, at: Date.now() });
  const last = t.slice(0, 80);
  await set("inbox", `${me.uid}__${tid}`, { uid: me.uid, withUid: other.uid, withName: other.name, last, at: Date.now() });
  await set("inbox", `${other.uid}__${tid}`, { uid: other.uid, withUid: me.uid, withName: me.name, last, at: Date.now() });
  await notify(other.uid, "New message", `${me.name}: ${last}`);
}

/* ============================ learning (student) ============================ */
export async function addCourse(uid: string, title: string): Promise<void> {
  await add("courses", { ownerUid: uid, title: title.trim(), status: "current", progress: 0, createdAt: Date.now(), updatedAt: Date.now() });
}
export async function setCourseProgress(c: CourseDoc, p: number): Promise<void> {
  const progress = Math.max(0, Math.min(100, Math.round(p)));
  await update("courses", c.id, { progress, status: progress >= 100 ? "completed" : "current", updatedAt: Date.now() });
}
export async function toggleCourseDone(c: CourseDoc): Promise<void> {
  const done = c.status !== "completed";
  await update("courses", c.id, { status: done ? "completed" : "current", progress: done ? 100 : Math.min(c.progress, 99), updatedAt: Date.now() });
}
export async function addGoal(uid: string, title: string, due: string): Promise<void> {
  if (!title.trim()) return;
  await add("goals", { ownerUid: uid, title: title.trim(), due, done: false, createdAt: Date.now() });
}
export async function toggleGoal(g: GoalDoc): Promise<void> {
  await update("goals", g.id, { done: !g.done });
}

export function cgpaFrom(marks: Array<{ score: number; total: number }>): { avg: number; cgpa: number } {
  let s = 0, t = 0;
  marks.forEach((m) => { s += m.score; t += m.total; });
  const avg = t ? (s / t) * 100 : 0;
  return { avg: Math.round(avg * 10) / 10, cgpa: Math.round(avg) / 10 };
}

export function streakFrom(dates: string[]): number {
  const have = new Set(dates);
  const iso = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const d = new Date();
  if (!have.has(iso(d))) { d.setDate(d.getDate() - 1); if (!have.has(iso(d))) return 0; }
  let streak = 0;
  while (have.has(iso(d))) { streak += 1; d.setDate(d.getDate() - 1); }
  return streak;
}

/* ============================ co-learner matching ============================ */
const toks = (s?: string): Set<string> =>
  new Set((s ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4));
export function matchProfile(aBlob: string, bBlob: string): number {
  const A = toks(aBlob); const B = toks(bBlob);
  let n = 0;
  A.forEach((w) => { if (B.has(w)) n += 1; });
  return n;
}

/* ============================ school hub ============================ */
export async function addMeeting(me: User, title: string, when: string, place: string, agenda: string): Promise<void> {
  await add("meetings", { title: title.trim(), when, place: place.trim(), agenda: agenda.trim(), by: me.name, at: Date.now() });
}
export async function addSalary(teacher: User, month: string, amount: number, status: string, note: string): Promise<void> {
  await add("salaries", { teacherUid: teacher.uid, teacherName: teacher.name, month, amount, status, note: note.trim(), at: Date.now() });
}
export async function addAnnouncement(me: User, title: string, body: string, audience: string): Promise<void> {
  await add("announcements", { title: title.trim(), body: body.trim(), audience, by: me.name, at: Date.now() });
}
export async function addEvent(me: User, title: string, date: string, className: string, note: string): Promise<void> {
  await add("events", { title: title.trim(), date, className, note: note.trim(), by: me.name, at: Date.now() });
}

/* ============================ notes engine (on-device structuring) ============================ */
export function structureNotes(raw: string, fallbackTitle: string): { title: string; sections: NoteSection[] } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections: NoteSection[] = [];
  let cur: NoteSection = { h: "Key Points", points: [] };
  const isHeading = (l: string): boolean =>
    /:$/.test(l) || /^(unit|chapter|topic|section|part|theorem|law|rule)\b/i.test(l) ||
    (l.length <= 42 && !/[.;]$/.test(l) && l.split(/\s+/).length <= 7);
  for (const l of lines) {
    if (isHeading(l)) {
      if (cur.points.length || sections.length) sections.push(cur);
      cur = { h: l.replace(/:$/, ""), points: [] };
    } else {
      cur.points.push(l.replace(/^[-*•\d.)\s]+/, ""));
    }
  }
  if (cur.points.length || sections.length === 0) sections.push(cur);
  const title = sections[0] && sections[0].h !== "Key Points" ? sections[0].h : fallbackTitle;
  return { title, sections };
}
export async function saveNote(me: User, className: string, subject: string, title: string, sections: NoteSection[], source: string): Promise<void> {
  await add("notes", { className, subject: subject || "General", title, sections, source, by: me.name, byUid: me.uid, at: Date.now() });
}

/* ============================ study connect ============================ */
export function firstOfNextMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}
export async function myBan(uid: string): Promise<BanDoc | null> {
  const b = await get<BanDoc>("studyBans", uid);
  return b && b.until > Date.now() ? b : null;
}
export async function monthViolations(uid: string): Promise<number> {
  const rows = (await list<ViolationDoc>("studyViolations", ["uid", uid]).catch(() => [])) ?? [];
  const mk = monthKey();
  return rows.filter((r) => { const d = new Date(r.at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === mk; }).length;
}
const mIdx = (m: string): number => { const [y, mo] = m.split("-").map(Number); return y * 12 + (mo - 1); };
function threeConsecutive(months: string[]): boolean {
  const s = new Set(months.map(mIdx));
  for (const i of s) if (s.has(i - 1) && s.has(i - 2)) return true;
  return false;
}
async function maybeBan(uid: string): Promise<void> {
  const cnt = await monthViolations(uid);
  if (cnt < 3) return;
  const ex = await get<BanDoc>("studyBans", uid);
  const months = ex?.monthsBanned ?? [];
  const mk = monthKey();
  if (months.includes(mk)) return;
  const next = [...months, mk];
  const year = threeConsecutive(next);
  const until = year ? Date.now() + 365 * 86400000 : firstOfNextMonth();
  await set("studyBans", uid, { uid, until, reason: year ? "3 consecutive monthly restrictions" : "3 strikes in one month", monthsBanned: next });
  await notify(uid, "Study Connect restricted", year ? "Restricted for 1 year." : "Restricted for 1 month.");
}
export async function logViolation(uid: string, roomId: string, reason: string): Promise<void> {
  try {
    await add("studyViolations", { uid, roomId, reason, at: Date.now() });
    await maybeBan(uid);
  } catch (e) { console.debug("[study] violation", e); }
}
export async function createRoom(me: User, subject: string, topic: string): Promise<string> {
  return await add("studyRooms", { subject, topic: topic.trim(), hostUid: me.uid, hostName: me.name, active: true, createdAt: Date.now() });
}
export async function closeRoom(roomId: string): Promise<void> {
  await update("studyRooms", roomId, { active: false });
}
export async function startSession(uid: string, roomId: string, subject: string): Promise<string> {
  return await add("studySessions", { uid, roomId, subject, startedAt: Date.now(), violations: 0, focus: 100 });
}
export async function endSession(id: string, violations: number, focus: number): Promise<void> {
  await update("studySessions", id, { endedAt: Date.now(), violations, focus });
}
