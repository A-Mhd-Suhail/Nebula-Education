--------------------------------------------------------------------------------
import { deleteDoc, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { dbAdd, dbList, dbWatch } from "./store";
import { state } from "./state";
import type { AppNotification, UserProfile } from "./types";

export async function notifyUser(uid: string, title: string, body: string, type = "info"): Promise<void> {
  if (!uid) return;
  await dbAdd("notifications", { uid, title, body, type, read: false, createdAt: Date.now() });
}

export async function notifyUsers(uids: string[], title: string, body: string, type = "info"): Promise<void> {
  const list = [...new Set(uids)].filter(Boolean);
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    for (const uid of list.slice(i, i + 400))
      batch.set(doc(db, "notifications"), { uid, title, body, type, read: false, createdAt: Date.now() });
    await batch.commit();
  }
}

/** FAN-OUT: every user with these roles gets their OWN doc (fixes shared role-doc bug). */
export async function notifyRoles(roles: string[], title: string, body: string, type = "info"): Promise<void> {
  try {
    const users = await dbList<Pick<UserProfile, "uid">>("users", { where: [["role", "in", roles.slice(0, 10)]], limit: 300 });
    await notifyUsers(users.map((u) => u.uid), title, body, type);
  } catch (e) { console.error("notifyRoles:", e); }
}

/** LIVE: onSnapshot — new notifications appear instantly, no refresh. */
export function watchMyNotifications(cb: (list: AppNotification[]) => void): () => void {
  const uid = state.profile?.uid;
  if (!uid) { cb([]); return () => {}; }
  return dbWatch<AppNotification>(
    "notifications",
    { where: [["uid", "==", uid]], limit: 80 },
    (rows) => cb(rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))),
  );
}

export async function markAllRead(list: AppNotification[]): Promise<void> {
  const unread = list.filter((n) => !n.read);
  for (let i = 0; i < unread.length; i += 400) {
    const batch = writeBatch(db);
    for (const n of unread.slice(i, i + 400)) batch.update(doc(db, "notifications", n.id), { read: true });
    await batch.commit();
  }
}

export async function deleteNotification(id: string): Promise<void> {
  await deleteDoc(doc(db, "notifications", id));
}

export async function clearReadNotifications(list: AppNotification[]): Promise<void> {
  const read = list.filter((n) => n.read);
  for (let i = 0; i < read.length; i += 400) {
    const batch = writeBatch(db);
    for (const n of read.slice(i, i + 400)) batch.delete(doc(db, "notifications", n.id));
    await batch.commit();
  }
}

