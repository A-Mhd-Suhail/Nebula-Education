/* ==========================================================
   THE PENTAGON - thin "network" background for the whole site
   Needs:  <canvas id="net-canvas"></canvas>  in the page
   ========================================================== */
(function () {
  'use strict';
  var canvas = document.getElementById('net-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- SETTINGS you can change ---------- */
  var LINE_RGB   = canvas.getAttribute('data-rgb') || '111,160,255';   // colour of the thin lines and dots
  var LINK_DIST  = 150;             // how close two dots must be to get a line (px)
  var LINE_ALPHA = parseFloat(canvas.getAttribute('data-alpha')) || 0.26;            // line strength (0 - 1)
  var DOT_ALPHA  = 0.55;
  var SPEED      = 0.18;            // drifting speed
  var DENSITY    = 15000;           // bigger number = fewer dots
  /* --------------------------------------------- */

  var w = 0, h = 0, dpr = 1, nodes = [];
  var mouse = { x: -9999, y: -9999 };

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.max(28, Math.min(120, Math.round((w * h) / DENSITY)));
    if (w < 700) n = Math.round(n * 0.7);
    nodes = [];
    for (var i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * SPEED * 2,
        vy: (Math.random() - 0.5) * SPEED * 2,
        r: 0.9 + Math.random() * 1.2
      });
    }
  }

  function draw(move) {
    ctx.clearRect(0, 0, w, h);
    var i, j, a, b, dx, dy, d;

    if (move) {
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < -20) a.x = w + 20; else if (a.x > w + 20) a.x = -20;
        if (a.y < -20) a.y = h + 20; else if (a.y > h + 20) a.y = -20;
      }
    }

    ctx.lineWidth = 0.6;
    for (i = 0; i < nodes.length; i++) {
      a = nodes[i];
      for (j = i + 1; j < nodes.length; j++) {
        b = nodes[j];
        dx = a.x - b.x; dy = a.y - b.y;
        if (dx > LINK_DIST || dx < -LINK_DIST || dy > LINK_DIST || dy < -LINK_DIST) continue;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d < LINK_DIST) {
          ctx.strokeStyle = 'rgba(' + LINE_RGB + ',' + ((1 - d / LINK_DIST) * LINE_ALPHA).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      // lines that reach towards the cursor
      dx = a.x - mouse.x; dy = a.y - mouse.y;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d < 170) {
        ctx.strokeStyle = 'rgba(' + LINE_RGB + ',' + ((1 - d / 170) * 0.4).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(' + LINE_RGB + ',' + DOT_ALPHA + ')';
    for (i = 0; i < nodes.length; i++) {
      a = nodes[i];
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill();
    }
  }

  function loop() {
    if (!document.hidden) draw(true);
    requestAnimationFrame(loop);
  }

  window.addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  window.addEventListener('mouseout', function () { mouse.x = mouse.y = -9999; });
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { build(); if (reduce) draw(false); }, 150);
  });

  build();
  if (reduce) draw(false); else loop();
})();
