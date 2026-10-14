/* =========================================================
   Teacher Profile  |  THE PENTAGON
   File: js/teacher.js
   ========================================================= */

(function () {
  "use strict";

  /* ---------- tiny helpers ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(message) {
    let el = $(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ---------- 1. main tabs ---------- */
  const tabs = $$(".tab");
  const panels = $$(".tab-panel");

  function showTab(name) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    panels.forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
    try { history.replaceState(null, "", "#" + name); } catch (e) {}
  }

  tabs.forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  const fromHash = location.hash.replace("#", "");
  if (tabs.some((t) => t.dataset.tab === fromHash)) showTab(fromHash);

  /* ---------- 2. filter chips (posts, portfolio, resources) ---------- */
  function wireFilters(groupSelector, itemSelector) {
    const group = $(groupSelector);
    if (!group) return;
    group.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      $$(".chip", group).forEach((c) => c.classList.toggle("active", c === chip));
      const filter = chip.dataset.filter;
      $$(itemSelector).forEach((item) => {
        const show = filter === "all" || item.dataset.type === filter;
        item.classList.toggle("hidden", !show);
      });
    });
  }
  wireFilters("#postFilters", "#tab-posts .post");
  wireFilters("#portfolioFilters", "#tab-portfolio .pcard[data-type]");
  wireFilters("#resourceFilters", "#tab-resources .res");

  /* ---------- 3. copy profile id ---------- */
  const copyBtn = $("#copyIdBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = $("#profileIdText").textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        toast("Profile ID copied");
      } catch (err) {
        toast("Could not copy");
      }
    });
  }

  /* ---------- 4. like buttons ---------- */
  $$(".like-btn").forEach((btn) => {
    btn.addEventListener("click", () => btn.classList.toggle("liked"));
  });

  /* ---------- 5. profile views bar chart (last 30 days) ---------- */
  const barsEl = $("#viewsBars");
  if (barsEl) {
    // replace with real daily numbers from your API
    const data = [28, 42, 34, 58, 40, 62, 66, 70, 56, 78, 72, 84];
    const max = Math.max(...data);
    data.forEach((v, i) => {
      const bar = document.createElement("i");
      if (i >= 6) bar.classList.add("hi");
      barsEl.appendChild(bar);
      requestAnimationFrame(() => {
        setTimeout(() => (bar.style.height = (v / max) * 100 + "%"), 40 * i);
      });
    });
  }

  /* ---------- 6. AIR score ring ---------- */
  const ring = $("#airRing");
  if (ring) {
    const score = parseInt($("#airValue").textContent, 10) || 0;
    const maxScore = 1000;
    const circumference = 201; // 2 * PI * r (r = 32)
    setTimeout(() => {
      ring.style.strokeDashoffset = circumference * (1 - score / maxScore);
    }, 150);
  }

  /* ---------- 7. placeholder button actions ----------
     Replace these toasts with your own routes / modals. */
  const actions = {
    editCoverBtn: "Edit cover clicked",
    editProfileBtn: "Edit profile clicked",
    createPostBtn: "Create post clicked",
    startPostBtn: "Start a post clicked",
  };
  Object.keys(actions).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => toast(actions[id]));
  });
})();

  /* ---------- 8. logout (same behaviour as the student page) ---------- */
  var logoutBtn = document.getElementById("logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      try { localStorage.removeItem("hx_session"); } catch (err) {}
      try { if (typeof firebase !== "undefined") firebase.auth().signOut(); } catch (err) {}
      window.location.href = "../login.html";
    });
  }