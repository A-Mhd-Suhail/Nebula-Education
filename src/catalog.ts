--------------------------------------------------------------------------------
export interface Opt { id: string; label: string; }

export const CLASS_LIST: Opt[] = (() => {
  const out: Opt[] = [];
  for (let g = 1; g <= 10; g++)
    for (const s of ["A", "B", "C", "D"])
      out.push({ id: `C${g}-${s}`, label: `Class ${g}-${s}` });
  return out;
})();

export const SUBJECTS: Opt[] = [
  "Mathematics", "Physical Sciences", "Natural Sciences", "Biology", "English",
  "Telugu", "Hindi", "Social Studies", "Computer Science", "Physical Education",
].map((s) => ({ id: s, label: s }));

export function classLabel(id?: string): string {
  if (!id) return "—";
  return CLASS_LIST.find((c) => c.id === id)?.label ?? id;
}

/**
 * Searchable dropdown = search bar + dropdown in ONE control.
 * Type to filter, ↑/↓ + Enter or click to choose. Selected value lives on
 * wrapper: <div id="wrap-<inputId>" data-value="<id>">
 */
export function createSearchableSelect(inputId: string, options: Opt[], placeholder: string): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "combo";
  wrap.id = "wrap-" + inputId;
  wrap.dataset.value = "";
  wrap.innerHTML = `
    <input id="${inputId}" type="text" autocomplete="off" placeholder="${placeholder}" />
    <ul class="combo-list hidden" role="listbox"></ul>`;
  const input = wrap.querySelector("input")!;
  const ul = wrap.querySelector("ul")!;
  let filtered = options;
  let active = -1;

  function paint(): void {
    ul.innerHTML = filtered.length
      ? filtered.map((o, i) => `<li data-id="${o.id}" class="${i === active ? "active" : ""}">${o.label}</li>`).join("")
      : `<li class="combo-none">No match found</li>`;
  }
  function choose(o: Opt): void {
    wrap.dataset.value = o.id;
    input.value = o.label;
    ul.classList.add("hidden");
  }
  input.onfocus = () => { filtered = options; active = -1; paint(); ul.classList.remove("hidden"); };
  input.oninput = () => {
    wrap.dataset.value = "";
    const q = input.value.trim().toLowerCase();
    filtered = options.filter((o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
    active = filtered.length ? 0 : -1;
    paint();
    ul.classList.remove("hidden");
  };
  input.onkeydown = (e) => {
    if (ul.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") { active = Math.min(filtered.length - 1, active + 1); paint(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); paint(); e.preventDefault(); }
    else if (e.key === "Enter") { if (filtered[active]) { choose(filtered[active]); e.preventDefault(); } }
    else if (e.key === "Escape") ul.classList.add("hidden");
  };
  ul.onclick = (e) => {
    const li = (e.target as HTMLElement).closest("li[data-id]") as HTMLElement | null;
    if (!li) return;
    const o = options.find((x) => x.id === li.dataset.id);
    if (o) choose(o);
  };
  document.addEventListener("mousedown", (e) => {
    if (!wrap.contains(e.target as Node)) ul.classList.add("hidden");
  });
  return wrap;
}

export function getSelectValue(inputId: string): string {
  const w = document.getElementById("wrap-" + inputId) as HTMLElement | null;
  return w?.dataset.value ?? "";
}

