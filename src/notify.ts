import { dbAdd, dbUpdate, dbWatch } from "./store";
import { state } from "./state";
import type { AppNotification } from "./types";

export async function notifyUser(uid: string, title: string, body: string, type = "info"): Promise<void> {
  await dbAdd("notifications", { uid, title, body, type, read: false, createdAt: Date.now() });
}

export async function notifyRoles(roles: string[], title: string, body: string, type = "info"): Promise<void> {
  for (const role of roles) {
    await dbAdd("notifications", { uid: "role:" + role, title, body, type, read: false, createdAt: Date.now() });
  }
}

function myScopes(): string[] {
  const profile = state.profile;
  return profile ? [profile.uid, "role:" + profile.role] : [];
}

export function watchMyNotifications(cb: (list: AppNotification[]) => void): () => void {
  const scopes = myScopes();
  if (!scopes.length) { cb([]); return () => undefined; }
  return dbWatch<AppNotification>("notifications", { where: [["uid", "in", scopes]], limit: 60 }, (rows) => {
    cb(rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
  });
}

export async function markAllRead(list: AppNotification[]): Promise<void> {
  await Promise.all(list.filter((notification) => !notification.read)
    .map((notification) => dbUpdate("notifications", notification.id, { read: true })));
}
