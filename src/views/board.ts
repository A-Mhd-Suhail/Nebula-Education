import { cmdCaptureBoard } from "../hardware";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbWatch } from "../store";
import { $, esc, showToast } from "../helpers";
import type { BoardImage } from "../types";

let lastId = "";
let first = true;

export function renderBoard(): void {
  const me = state.profile!;
  const room = me.className ?? "";
  const root = $("#board-root");
  root.innerHTML = `
    <div class="card">
      <h3>📷 Board Notes — ${esc(room || "no class set")}</h3>
      <p class="muted">Camera 3 watches the board; when writing stabilizes, a clean snapshot is captured and pushed here automatically. Previous snapshots stay in history.</p>
      ${me.role === "teacher" ? `<button class="btn btn-primary" id="board-capture" type="button">📷 Capture board now</button>` : ""}
    </div>
    <div class="card"><h4 style="margin-top:0">Latest board</h4><div id="board-latest"><div class="loading">Waiting for the first capture…</div></div></div>
    <div class="card"><h4 style="margin-top:0">Board history</h4><div id="board-hist" class="board-hist"><p class="muted">No history yet.</p></div></div>`;

  if (me.role === "teacher") {
    $("#board-capture").addEventListener("click", () => { cmdCaptureBoard(room); showToast("📷 CAPTURE_BOARD sent to hardware"); });
  }

  if (!room) { $("#board-latest")!.innerHTML = `<p class="muted">Set your class name to receive board notes.</p>`; return; }

  const unsub = dbWatch<BoardImage>("boardImages", { where: [["room", "==", room]], limit: 30 }, (rows) => {
    rows.sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0));
    const latest = $("#board-latest");
    const hist = $("#board-hist");
    if (!latest || !hist) return;
    if (rows.length) {
      const b = rows[0]!;
      latest.innerHTML = `
        <img class="board-img" src="${esc(b.image)}" alt="Board snapshot">
        <div class="post-head" style="margin-top:8px">
          <span class="muted">${new Date(b.capturedAt).toLocaleString()} · ${esc(b.cameraId ?? "")}</span>
          <a class="btn" href="${esc(b.image)}" download="board-${b.capturedAt}.svg">⬇️ Download</a>
        </div>`;
      hist.innerHTML = rows.map((x) => `
        <div class="board-thumb"><img src="${esc(x.image)}" alt="board"><span class="muted">${new Date(x.capturedAt).toLocaleTimeString()}</span></div>`).join("");
      if (!first && b.id !== lastId) showToast("📸 New board notes received!");
    } else {
      latest.innerHTML = `<p class="muted">Waiting for the first capture…</p>`;
      hist.innerHTML = `<p class="muted">No history yet.</p>`;
    }
    lastId = rows[0]?.id ?? "";
    first = false;
  });
  addViewListener(unsub);
}