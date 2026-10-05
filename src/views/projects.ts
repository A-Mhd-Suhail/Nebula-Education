import { arrayRemove, arrayUnion } from "firebase/firestore";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbAdd, dbGet, dbUpdate, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { Project } from "../types";

export function renderProjects(): void {
  if (!state.profile) return;
  const me = state.profile;
  const root = $("#projects-root");
  root.innerHTML = `
    <div class="card">
      <h3>🛠️ Display Project</h3>
      <input class="js-p-title" placeholder="Project title">
      <textarea class="js-p-desc" rows="2" placeholder="Describe your project…"></textarea>
      <input class="js-p-link" placeholder="Link (optional — GitHub, video…)">
      <button class="btn btn-primary js-p-add" type="button">Publish Project</button>
    </div>
    <div id="project-list" class="grid-2"></div>`;

  root.querySelector(".js-p-add")!.addEventListener("click", () => void (async () => {
    const title = ($(".js-p-title") as HTMLInputElement).value.trim();
    const description = ($(".js-p-desc") as HTMLTextAreaElement).value.trim();
    const link = ($(".js-p-link") as HTMLInputElement).value.trim();
    if (!title) { showToast("Title is required", "error"); return; }
    await dbAdd("projects", {
      studentUid: me.uid, studentName: me.name, title, description, link,
      likedBy: [], createdAt: Date.now(),
    });
    ($(".js-p-title") as HTMLInputElement).value = "";
    ($(".js-p-desc") as HTMLTextAreaElement).value = "";
    ($(".js-p-link") as HTMLInputElement).value = "";
    showToast("Project published 🎉");
  })());

  const unsub = dbWatch<Project>("projects", { orderBy: ["createdAt", "desc"], limit: 50 }, (rows) => {
    const list = $("#project-list");
    list.innerHTML = rows.map((p) => {
      const likedBy = p.likedBy ?? [];
      const liked = likedBy.includes(me.uid);
      return `<div class="card">
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.description ?? "")}</p>
        ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">🔗 Open link</a>` : ""}
        <div class="post-head" style="margin-top:8px">
          <small class="muted">by <b>${esc(p.studentName)}</b> · ${timeAgo(p.createdAt)}</small>
          <button class="btn btn-ghost js-plike" data-id="${p.id}" type="button">${liked ? "❤️" : "🤍"} ${likedBy.length}</button>
        </div>
      </div>`;
    }).join("") || `<p class="muted">No projects yet.</p>`;

    list.querySelectorAll(".js-plike").forEach((b) =>
      b.addEventListener("click", () => void (async () => {
        const id = (b as HTMLElement).dataset.id!;
        const proj = await dbGet<Project>("projects", id);
        if (!proj) return;
        const likedBy = proj.likedBy ?? [];
        await dbUpdate("projects", id,
          { likedBy: likedBy.includes(me.uid) ? arrayRemove(me.uid) : arrayUnion(me.uid) });
      })()));
  });
  addViewListener(unsub);
}