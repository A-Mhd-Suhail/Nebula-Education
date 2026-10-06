import { state } from "../state";
import { dbAdd, dbUpdate, dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import type { Project } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  root.innerHTML = `
    ${me.role === "student" ? `<div class="card"><h3>🛠 Share a project</h3>
      <input id="pj-title" placeholder="Project title" />
      <textarea id="pj-desc" rows="2" placeholder="What did you build?" style="margin-top:8px"></textarea>
      <input id="pj-link" placeholder="Link (optional — GitHub, video…)" style="margin-top:8px" />
      <button id="pj-post" class="btn btn-primary" style="margin-top:8px" type="button">Publish</button></div>` : ""}
    <h3>🌟 Student projects</h3><div id="pj-list" class="stack"><p class="muted">Loading…</p></div>`;

  if (me.role === "student") {
    (root.querySelector("#pj-post") as HTMLButtonElement).onclick = () => {
      const title = (root.querySelector("#pj-title") as HTMLInputElement).value.trim();
      const description = (root.querySelector("#pj-desc") as HTMLTextAreaElement).value.trim();
      const link = (root.querySelector("#pj-link") as HTMLInputElement).value.trim();
      if (title.length < 3) { showToast("Give your project a title", "error"); return; }
      void dbAdd("projects", { studentUid: me.uid, studentName: me.name, title, description, link, likedBy: [], createdAt: Date.now() });
      (root.querySelector("#pj-title") as HTMLInputElement).value = "";
      (root.querySelector("#pj-desc") as HTMLTextAreaElement).value = "";
      (root.querySelector("#pj-link") as HTMLInputElement).value = "";
      showToast("Project published 🚀");
    };
  }

  const list = root.querySelector("#pj-list") as HTMLElement;
  let latest: Project[] = [];
  dbWatch<Project>("projects", { limit: 50 }, (rows) => {
    latest = rows.sort((a, b) => b.createdAt - a.createdAt);
    list.innerHTML = latest.length
      ? latest.map((p) => `<div class="card">
          <div><b>${esc(p.title)}</b> <span class="muted small">by ${esc(p.studentName)} · ${timeAgo(p.createdAt)}</span></div>
          ${p.description ? `<p>${esc(p.description)}</p>` : ""}
          ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link)}</a>` : ""}
          <div class="feed-actions"><button class="btn" data-like="${p.id}" type="button">👍 ${(p.likedBy ?? []).length}</button></div>
        </div>`).join("")
      : `<p class="muted">No projects yet.</p>`;
  });

  list.onclick = (e) => {
    const btn = (e.target as HTMLElement).closest("button[data-like]") as HTMLElement | null;
    if (!btn) return;
    const p = latest.find((x) => x.id === btn.dataset.like);
    if (!p) return;
    const likedBy = (p.likedBy ?? []).includes(me.uid)
      ? (p.likedBy ?? []).filter((u) => u !== me.uid)
      : [...(p.likedBy ?? []), me.uid];
    void dbUpdate("projects", p.id, { likedBy });
  };
}
