import { arrayRemove, arrayUnion } from "firebase/firestore";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbAdd, dbGet, dbUpdate, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { FeedPost } from "../types";

export function renderSocial(): void {
  if (!state.profile) return;
  const me = state.profile;
  const root = $("#social-root");
  root.innerHTML = `
    <div class="card">
      <h3>💼 Nebula Network — Student &amp; Teacher LinkedIn</h3>
      <p class="hint">🌍 Shared network: <b>everyone sees every post instantly</b> — students see student posts, teachers see teacher posts, and both see each other.</p>
      <textarea class="js-post-text" rows="3" placeholder="Share something with your network…"></textarea>
      <button class="btn btn-primary js-post-btn" type="button">Post</button>
    </div>
    <div id="feed"><div class="loading">Loading feed…</div></div>`;

  root.querySelector(".js-post-btn")!.addEventListener("click", () => void (async () => {
    const ta = $(".js-post-text") as HTMLTextAreaElement;
    const content = ta.value.trim();
    if (!content) { showToast("Write something first", "error"); return; }
    await dbAdd("feed", {
      authorUid: me.uid, authorName: me.name, role: me.role,
      content, likes: [], createdAt: Date.now(),
    });
    ta.value = "";
    showToast("Posted! Everyone can see it now 🚀");
  })());

  const unsub = dbWatch<FeedPost>("feed", { orderBy: ["createdAt", "desc"], limit: 50 }, (posts) => {
    const feed = $("#feed");
    if (!feed) return;
    feed.innerHTML = posts.map((p) => {
      const likes = p.likes ?? [];
      const liked = likes.includes(me.uid);
      const roleLabel = p.role === "teacher" ? "👩‍🏫 Teacher" : "🎒 Student";
      return `<div class="card post">
        <div class="post-head"><b>${esc(p.authorName)}</b>
          <span class="badge ${p.role === "teacher" ? "role-teacher" : "role-student"}">${roleLabel}</span>
          <span class="muted">${timeAgo(p.createdAt)}</span></div>
        <p>${esc(p.content)}</p>
        <button class="btn btn-ghost js-like" data-id="${p.id}" type="button" style="margin-top:8px">${liked ? "❤️" : "🤍"} ${likes.length}</button>
      </div>`;
    }).join("") || `<p class="muted">No posts yet. Be the first!</p>`;

    feed.querySelectorAll(".js-like").forEach((b) =>
      b.addEventListener("click", () => void toggleLike((b as HTMLElement).dataset.id!)));
  });
  addViewListener(unsub);
}

async function toggleLike(id: string): Promise<void> {
  if (!state.profile) return;
  const post = await dbGet<FeedPost>("feed", id);
  if (!post) return;
  const liked = (post.likes ?? []).includes(state.profile.uid);
  await dbUpdate("feed", id, { likes: liked ? arrayRemove(state.profile.uid) : arrayUnion(state.profile.uid) });
}