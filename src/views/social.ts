--------------------------------------------------------------------------------
import { state } from "../state";
import { dbAdd, dbDelete, dbUpdate, dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import type { FeedPost } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  let latest: FeedPost[] = [];

  root.innerHTML = `
    <div class="card">
      <h3>🌌 Social Feed <span class="muted small">— live for students & teachers</span></h3>
      <textarea id="feed-text" rows="3" maxlength="500" placeholder="Share something with your school…"></textarea>
      <button id="feed-post" class="btn btn-primary" type="button" style="margin-top:8px">Post</button>
    </div>
    <div id="feed-list" class="stack"></div>`;
  const list = root.querySelector("#feed-list") as HTMLElement;

  (root.querySelector("#feed-post") as HTMLButtonElement).onclick = () => {
    const box = root.querySelector("#feed-text") as HTMLTextAreaElement;
    const text = box.value.trim();
    if (text.length < 2) { showToast("Write something first", "error"); return; }
    void dbAdd("feed", { authorUid: me.uid, authorName: me.name, role: me.role, content: text, likes: [], createdAt: Date.now() });
    box.value = "";
    showToast("Posted ✅");
  };

  dbWatch<FeedPost>("feed", { limit: 60 }, (rows) => {
    latest = rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    list.innerHTML = latest.length
      ? latest.map((p) => `
        <div class="card">
          <div><b>${esc(p.authorName)}</b> <span class="badge">${esc(p.role)}</span>
            <span class="muted small">· ${timeAgo(p.createdAt)}</span></div>
          <p>${esc(p.content)}</p>
          <div class="feed-actions">
            <button class="btn" data-like="${p.id}" type="button">❤️ ${(p.likes ?? []).length}</button>
            ${p.authorUid === me.uid || ["hm", "meo", "deo", "admin"].includes(me.role)
              ? `<button class="btn btn-ghost" data-del="${p.id}" type="button">Delete</button>` : ""}
          </div>
        </div>`).join("")
      : `<p class="muted">No posts yet — be the first! 👋</p>`;
  });

  list.onclick = (e) => {
    const t = e.target as HTMLElement;
    const like = t.closest("button[data-like]") as HTMLElement | null;
    if (like) {
      const p = latest.find((x) => x.id === like.dataset.like);
      if (!p) return;
      const likes = (p.likes ?? []).includes(me.uid)
        ? (p.likes ?? []).filter((u) => u !== me.uid)
        : [...(p.likes ?? []), me.uid];
      void dbUpdate("feed", p.id, { likes });
      return;
    }
    const del = t.closest("button[data-del]") as HTMLElement | null;
    if (del) void dbDelete("feed", del.dataset.del!);
  };
}

