import { dbWatch } from "../store";
import { esc, timeAgo } from "../helpers";
import type { BoardImage } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `<h3>🖼 Board snapshots (all classrooms)</h3><div id="bd-grid" class="grid2"><p class="muted">Loading…</p></div>`;
  const grid = root.querySelector("#bd-grid") as HTMLElement;
  dbWatch<BoardImage>("boardImages", { limit: 24 }, (rows) => {
    const list = rows.sort((a, b) => b.capturedAt - a.capturedAt);
    grid.innerHTML = list.length
      ? list.map((b) => `<div class="card"><img src="${esc(b.image)}" style="width:100%;border-radius:8px" alt="board"><p class="muted small">${esc(b.room)} · ${esc(b.cameraId)} · ${timeAgo(b.capturedAt)}</p></div>`).join("")
      : `<p class="muted">No snapshots yet — hardware will push them here.</p>`;
  });
}
