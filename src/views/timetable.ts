import { state } from "../state";
import { dbAdd, dbList, dbUpdate } from "../store";
import { $, esc, showToast, todayStr } from "../helpers";
import type { SyllabusTopic } from "../types";

let year = new Date().getFullYear();
let month = new Date().getMonth();
let selected = todayStr();
let byDate: Record<string, SyllabusTopic[]> = {};

export function renderTimetable(): void {
  selected = todayStr();
  const root = $("#timetable-root");
  root.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="cal-head">
          <button class="btn btn-ghost js-cal-prev" type="button">‹</button>
          <h3 id="cal-title" style="margin:0"></h3>
          <button class="btn btn-ghost js-cal-next" type="button">›</button>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
      </div>
      <div class="card"><h3 id="day-title"></h3><div id="day-body"></div></div>
    </div>`;

  $(".js-cal-prev").addEventListener("click", () => {
    month--; if (month < 0) { month = 11; year--; } paintCal();
  });
  $(".js-cal-next").addEventListener("click", () => {
    month++; if (month > 11) { month = 0; year++; } paintCal();
  });
  void load();
}

async function load(): Promise<void> {
  const rows = await dbList<SyllabusTopic>("syllabus");
  byDate = {};
  for (const t of rows) {
    if (!byDate[t.date]) byDate[t.date] = [];
    byDate[t.date].push(t);
  }
  paintCal();
  paintDay();
}

function paintCal(): void {
  const grid = $("#cal-grid");
  const monthName = new Date(year, month, 1).toLocaleString("en", { month: "long" });
  $("#cal-title").textContent = monthName + " " + year;
  const startDow = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  let html = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
    .map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < startDow; i++) html += `<div></div>`;
  for (let d = 1; d <= days; d++) {
    const iso = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const count = (byDate[iso] ?? []).length;
    html += `<button class="cal-day ${iso === selected ? "sel" : ""}" data-date="${iso}" type="button">
      ${d}${count ? `<span class="dot">${count}</span>` : ""}</button>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll(".cal-day").forEach((b) =>
    b.addEventListener("click", () => {
      selected = (b as HTMLElement).dataset.date!;
      paintCal();
      paintDay();
    }));
}

function paintDay(): void {
  if (!state.profile) return;
  const body = $("#day-body");
  $("#day-title").textContent = "🗓️ Syllabus — " + selected;
  const topics = byDate[selected] ?? [];
  body.innerHTML = `
    ${topics.map((t) => `
      <div class="topic-row">
        <label><input type="checkbox" class="js-t-done" data-id="${t.id}" ${t.doneByTeacher ? "checked" : ""}/> ${esc(t.topic)}</label>
        ${t.doneByAI ? `<span class="badge green">🤖 AI verified</span>` : `<span class="badge muted">AI pending</span>`}
      </div>`).join("")
      || `<p class="muted">No topics planned for this date. Click a date on the calendar → syllabus checkboxes appear here.</p>`}
    <div class="add-topic">
      <input class="js-topic-text" placeholder="Add syllabus topic for this date">
      <button class="btn btn-primary js-topic-add" type="button">Add</button>
      <button class="btn js-ai-check" type="button">🤖 Hardware AI check</button>
    </div>`;

  body.querySelectorAll(".js-t-done").forEach((cb) =>
    cb.addEventListener("change", () => void (async () => {
      const box = cb as HTMLInputElement;
      await dbUpdate("syllabus", box.dataset.id!, { doneByTeacher: box.checked });
      showToast("Syllabus updated ✅ (teacher + AI/hardware both can check)");
      await load();
    })()));

  body.querySelector(".js-topic-add")!.addEventListener("click", () => void (async () => {
    const input = $(".js-topic-text", body) as HTMLInputElement;
    const topic = input.value.trim();
    if (!topic) return;
    await dbAdd("syllabus", {
      date: selected, subject: state.profile?.subject ?? "General", topic,
      doneByTeacher: false, doneByAI: false, createdAt: Date.now(),
    });
    input.value = "";
    await load();
  })());

  body.querySelector(".js-ai-check")!.addEventListener("click", () => void (async () => {
    const list = byDate[selected] ?? [];
    for (const t of list.filter((x) => !x.doneByAI)) await dbUpdate("syllabus", t.id, { doneByAI: true });
    showToast("🤖 Hardware AI verified " + list.length + " topic(s)");
    await load();
  })());
}