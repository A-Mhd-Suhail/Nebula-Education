(function () {
  /* ---------- SETTINGS you can change ---------- */
  const TITLE = "THE PENTAGON";
  const PLAY_ONCE_PER_SESSION = false;   // true = only plays on the first visit of a browser session
  const PARTICLES_DESKTOP = 1600;
  const PARTICLES_MOBILE  = 900;
  const T_CONVERGE = 0.3;   // seconds: when dots start flying together
  const T_SHIFT    = 3.0;   // brain moves up & shrinks
  const T_TEXT     = 3.5;   // title letters start
  const LETTER_GAP = 0.11;  // seconds between letters
  const T_EXIT     = 6.8;   // intro fades away
  /* --------------------------------------------- */

  const root = document.getElementById('pentagon-intro');
  if (!root) return;

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = false;
  try { seen = PLAY_ONCE_PER_SESSION && sessionStorage.getItem('pentagonIntroSeen'); } catch (e) {}
  if (reduce || seen) { root.remove(); return; }

  const canvas = document.getElementById('pi-canvas');
  const ctx = canvas.getContext('2d');
  const titleEl = document.getElementById('pi-title');
  const poweredEl = document.getElementById('pi-powered');
  document.documentElement.style.overflow = 'hidden';

  // ---- build title letters ----
  const letters = [];
  TITLE.split('').forEach(ch => {
    const s = document.createElement('span');
    if (ch === ' ') { s.className = 'sp'; s.innerHTML = '&nbsp;'; } else { s.textContent = ch; letters.push(s); }
    titleEl.appendChild(s);
  });

  // ---- glow sprites (cheap glow instead of shadowBlur) ----
  function sprite(r, g, b) {
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, `rgba(255,255,255,1)`);
    gr.addColorStop(.2, `rgba(${r},${g},${b},.95)`);
    gr.addColorStop(.5, `rgba(${r},${g},${b},.25)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 48, 48);
    return c;
  }
  const SPR = [sprite(80, 200, 255), sprite(150, 110, 255), sprite(90, 255, 220)];

  // ---- make the brain shape (front view: two hemispheres + stem) ----
  function bump(a) { return 1 + 0.05 * Math.sin(9 * a) + 0.03 * Math.sin(17 * a + 1); }
  function hemiPath(g, sign, k, ox, oy) {
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.03) {
      const rb = bump(a);
      const ry = Math.sin(a) > 0 ? 0.50 : 0.62;     // flatter bottom
      const u = -0.49 + 0.46 * rb * Math.cos(a);
      const v = ry * rb * Math.sin(a);
      const px = ox + sign * u * k, py = oy + v * k;
      a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath();
  }
  function buildBrainPoints(count) {
    const W = 460, H = 360, k = 200, ox = W / 2, oy = 150;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.lineJoin = 'round'; g.lineCap = 'round';
    [-1, 1].forEach(sign => {
      hemiPath(g, sign, k, ox, oy);
      g.fillStyle = 'rgb(90,0,0)'; g.fill();
      g.strokeStyle = 'rgb(255,0,0)'; g.lineWidth = 6; g.stroke();
      // folds (clipped inside the hemisphere)
      g.save(); hemiPath(g, sign, k, ox, oy); g.clip();
      g.lineWidth = 5;
      for (let i = 0; i < 5; i++) {
        const y0 = -0.42 + i * 0.21;
        g.beginPath();
        for (let x = -0.98; x <= -0.02; x += 0.02) {
          const y = y0 + 0.07 * Math.sin(x * 14 + i * 1.7) + 0.03 * Math.sin(x * 31 + i);
          const px = ox + sign * x * k, py = oy + y * k;
          x <= -0.97 ? g.moveTo(px, py) : g.lineTo(px, py);
        }
        g.stroke();
      }
      g.restore();
    });
    // brain stem
    g.beginPath(); g.ellipse(ox, oy + 0.66 * k, 0.09 * k, 0.17 * k, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgb(90,0,0)'; g.fill(); g.strokeStyle = 'rgb(255,0,0)'; g.lineWidth = 5; g.stroke();

    const data = g.getImageData(0, 0, W, H).data;
    const edge = [], fill = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const r = data[(y * W + x) * 4];
      if (r > 200) edge.push([x, y]); else if (r > 60) fill.push([x, y]);
    }
    const pts = [];
    for (let i = 0; i < count; i++) {
      const src = (Math.random() < 0.62 && edge.length) ? edge : fill;
      const [x, y] = src[(Math.random() * src.length) | 0];
      pts.push({ u: (x - ox) / k + (Math.random() - .5) * 0.006, v: (y - oy) / k + (Math.random() - .5) * 0.006 });
    }
    return pts;
  }

  // ---- state ----
  let w = 0, h = 0, dpr = 1, S = 100;
  const N = window.innerWidth < 600 ? PARTICLES_MOBILE : PARTICLES_DESKTOP;
  const brain = buildBrainPoints(N);
  const P = brain.map(b => ({
    u: b.u, v: b.v, tx: 0, ty: 0,
    sx: 0, sy: 0, nx: 0, ny: 0,
    delay: Math.random() * 1.0, dur: 1.4 + Math.random() * 0.5,
    curve: (Math.random() - .5) * 260,
    size: 5 + Math.random() * 7, spr: Math.random() < .68 ? 0 : (Math.random() < .5 ? 1 : 2),
    ph: Math.random() * 6.283, pr: 0, gx: 0, gy: 0
  }));
  let pairs = [];

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    S = Math.min(w * 0.78, h * 0.9) / 1.95;
    P.forEach(p => {
      p.tx = w / 2 + p.u * S; p.ty = h / 2 - h * 0.02 + p.v * S;
      const dx = p.tx - p.sx, dy = p.ty - p.sy, len = Math.hypot(dx, dy) || 1;
      p.nx = -dy / len; p.ny = dx / len;
    });
  }
  P.forEach(p => { p.sx = Math.random() * window.innerWidth; p.sy = Math.random() * window.innerHeight; });
  layout();
  window.addEventListener('resize', layout);

  // neighbour lines (neural-network look) – computed once in brain space
  (function buildPairs() {
    const cell = 0.07, grid = new Map();
    P.forEach((p, i) => {
      const key = Math.floor(p.u / cell) + ',' + Math.floor(p.v / cell);
      (grid.get(key) || grid.set(key, []).get(key)).push(i);
    });
    P.forEach((p, i) => {
      const cx = Math.floor(p.u / cell), cy = Math.floor(p.v / cell), cand = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        (grid.get((cx + a) + ',' + (cy + b)) || []).forEach(j => {
          if (j > i) { const d = Math.hypot(P[j].u - p.u, P[j].v - p.v); if (d < 0.08 && d > 0.008) cand.push([d, j]); }
        });
      }
      cand.sort((m, n) => m[0] - n[0]).slice(0, 2).forEach(c => pairs.push([i, c[1]]));
    });
  })();

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  let t0 = performance.now(), titleStarted = false, poweredShown = false, finished = false;

  function frame(now) {
    if (finished) return;
    const t = (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const sh = ease(clamp((t - T_SHIFT) / 0.8));
    const gs = 1 - 0.30 * sh, dyShift = -h * 0.14 * sh;
    const cx = w / 2, cy = h / 2;
    const assembled = clamp((t - 2.4) / 1.2);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);

    // aura behind brain
    if (assembled > 0) {
      const ay = cy - h * 0.02 + dyShift, ar = S * 1.25 * gs;
      const gr = ctx.createRadialGradient(cx, ay, 0, cx, ay, ar);
      const a = assembled * (0.16 + 0.07 * pulse);
      gr.addColorStop(0, `rgba(90,170,255,${a})`);
      gr.addColorStop(.6, `rgba(120,90,255,${a * .5})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    }

    // update particles
    for (const p of P) {
      const pr = ease(clamp((t - T_CONVERGE - p.delay) / p.dur));
      p.pr = pr;
      let x, y;
      if (pr < 1) {
        const sw = Math.sin(pr * Math.PI) * p.curve;
        const wob = (1 - pr);
        x = lerp(p.sx, p.tx, pr) + p.nx * sw + Math.sin(t * .9 + p.ph) * 9 * wob;
        y = lerp(p.sy, p.ty, pr) + p.ny * sw + Math.cos(t * .8 + p.ph) * 9 * wob;
      } else {
        x = p.tx + Math.sin(t * 1.6 + p.ph) * 1.3;
        y = p.ty + Math.cos(t * 1.4 + p.ph) * 1.3;
      }
      p.gx = cx + (x - cx) * gs;
      p.gy = cy + (y - cy) * gs + dyShift;
    }

    // neural lines
    const lineA = clamp((t - 2.2) / 1.0) * (0.30 + 0.12 * pulse);
    if (lineA > 0.01) {
      ctx.globalAlpha = lineA; ctx.strokeStyle = '#6fd0ff'; ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const [i, j] of pairs) {
        const a = P[i], b = P[j];
        if (a.pr > .98 && b.pr > .98) { ctx.moveTo(a.gx, a.gy); ctx.lineTo(b.gx, b.gy); }
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    // dots
    ctx.globalCompositeOperation = 'lighter';
    for (const p of P) {
      const tw = 0.65 + 0.35 * Math.sin(t * 3 + p.ph);
      const s = p.size * (0.55 + 0.2 * assembled * pulse) * gs * (0.8 + 0.4 * tw) * (1 + 0.3 * assembled);
      ctx.globalAlpha = 0.45 + 0.55 * tw * (0.5 + 0.5 * assembled);
      ctx.drawImage(SPR[p.spr], p.gx - s, p.gy - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // title letters one by one
    if (!titleStarted && t > T_TEXT) {
      titleStarted = true;
      letters.forEach((el, i) => setTimeout(() => el.classList.add('on'), i * LETTER_GAP * 1000));
      setTimeout(() => { poweredEl.classList.add('on'); }, (letters.length * LETTER_GAP + 0.35) * 1000);
    }

    if (t > T_EXIT) return finish();
    requestAnimationFrame(frame);
  }

  function finish() {
    if (finished) return; finished = true;
    try { sessionStorage.setItem('pentagonIntroSeen', '1'); } catch (e) {}
    root.classList.add('pi-hide');
    document.documentElement.style.overflow = '';
    setTimeout(() => {
      root.remove();
      window.dispatchEvent(new Event('pentagon-intro-done'));   // you can listen to this in your site
    }, 950);
  }
  document.getElementById('pi-skip').addEventListener('click', finish);

  requestAnimationFrame(frame);
})();
