/* ==========================================================
   THE PENTAGON - home page scripts
   1. Nav bar, scroll animations, quotes, demo pop-up
   2. 3D digital brain (Three.js) that follows the cursor
   ========================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 1A. NAV BAR GETS A GLASS BACKGROUND WHEN SCROLLING ---------------- */
  var nav = document.getElementById('nav');
  function onScroll() {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------------- 1B. SCROLL-IN ANIMATIONS ---------------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------------- 1C. ROTATING EDUCATION QUOTES ----------------
     Add, remove or edit the sentences in this list.               */
  var QUOTES = [
    'Education turns curiosity into capability, and capability into a brighter tomorrow.',
    'Every classroom is a doorway, and every educated mind opens a hundred more.',
    'The finest investment a society can make is in the minds that will build its future.',
    'Knowledge shared is knowledge multiplied: that is how a community learns to rise.'
  ];
  var quoteEl = document.getElementById('quote');
  if (quoteEl && QUOTES.length > 1) {
    var qi = 0;
    setInterval(function () {
      quoteEl.classList.add('fade');
      setTimeout(function () {
        qi = (qi + 1) % QUOTES.length;
        quoteEl.textContent = QUOTES[qi];
        quoteEl.classList.remove('fade');
      }, 800);
    }, 7000);
  }

  /* ---------------- 1D. REQUEST DEMO POP-UP ---------------- */
  var modal = document.getElementById('demo-modal');
  var openBtn = document.getElementById('open-demo');
  var closeBtn = document.getElementById('demo-close');
  var doneBtn = document.getElementById('demo-done');
  var form = document.getElementById('demo-form');
  var formWrap = document.getElementById('demo-form-wrap');
  var success = document.getElementById('demo-success');

  function openModal() {
    if (!modal) return;
    formWrap.hidden = false;
    success.hidden = true;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }
  function closeModal() {
    if (!modal) return;
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  }
  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (doneBtn) doneBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();          // click on the dark area outside the box
    });
  }
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      /* TODO (later): send the form data to your backend here, for example:
         // This static deployment has no serverless /api route yet. Keep the
         // demo form usable without turning a missing endpoint into an error.
         fetch('/api/demo-request', { method: 'POST', body: new FormData(form) }).catch(function () {});
         Right now it only shows the thank-you message. */

      form.reset();
      formWrap.hidden = true;
      success.hidden = false;
    });
  }

  /* ==========================================================
     2. 3D DIGITAL BRAIN
     ========================================================== */
  initBrain();

  function initBrain() {
    var canvas = document.getElementById('brain-canvas');
    if (!canvas || typeof THREE === 'undefined') return;     // three.js did not load (offline?)

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    } catch (err) {
      canvas.style.display = 'none';                          // no WebGL on this device
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 0, 5.4);

    var rig = new THREE.Group();      // moves / scales the brain on screen
    var brain = new THREE.Group();    // rotates with the cursor
    rig.add(brain);
    scene.add(rig);

    /* ---------- build the brain shape out of points ---------- */
    var cyan = new THREE.Color(0x4fd1ff);
    var violet = new THREE.Color(0x8b5cf6);
    var teal = new THREE.Color(0x2ee6c5);
    var white = new THREE.Color(0xffffff);

    function dir() {                  // random direction on a sphere
      var x, y, z, l;
      do {
        x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1;
        l = x * x + y * y + z * z;
      } while (l > 1 || l < 0.0001);
      l = Math.sqrt(l);
      return [x / l, y / l, z / l];
    }
    function fold(x, y, z) {          // wrinkles of the brain surface
      return Math.sin(x * 7.3 + Math.sin(y * 5.1) * 1.8) * Math.sin(y * 8.7 + z * 3.3) +
             0.6 * Math.sin(z * 10.1 + x * 4.7) +
             0.4 * Math.sin((x + y + z) * 13.0);
    }
    function hemiSurface(sign) {
      var cx = sign * 0.32, ax = 0.5, ay = 0.68, az = 1.05;
      var d = dir();
      var x = d[0] * ax, y = d[1] * ay, z = d[2] * az;
      if (x * sign < 0) x *= 0.45;                              // flatten the inner side
      if (y < -0.18 * ay) y = -0.18 * ay + (y + 0.18 * ay) * 0.45; // flatten the bottom
      var k = 1 + 0.055 * fold(x + cx, y, z);
      return [x * k + cx, y * k + 0.08, z * k];
    }
    function hemiInside(sign) {
      var cx = sign * 0.32;
      var d = dir();
      var r = Math.cbrt(Math.random()) * 0.78;
      var x = d[0] * 0.5 * r, y = d[1] * 0.68 * r, z = d[2] * 1.05 * r;
      if (x * sign < 0) x *= 0.45;
      return [x + cx, y + 0.08, z];
    }
    function cerebellum() {
      var d = dir();
      var x = d[0] * 0.42, y = d[1] * 0.24, z = d[2] * 0.3;
      x += Math.sin(y * 45) * 0.012;
      return [x, y - 0.46, z - 0.78];
    }
    function stem() {
      var t = Math.random(), a = Math.random() * Math.PI * 2, r = 0.09 * (1 - 0.25 * t);
      return [Math.cos(a) * r, -0.48 - t * 0.5, -0.25 - t * 0.15 + Math.sin(a) * r];
    }

    var N_SURF = window.innerWidth < 700 ? 1700 : 2900;
    var N_IN = window.innerWidth < 700 ? 160 : 320;
    var N_CER = window.innerWidth < 700 ? 150 : 280;
    var N_STEM = 80;
    var N = N_SURF + N_CER + N_STEM + N_IN;
    var N_NET = N_SURF + N_CER;       // points that take part in the glowing network lines

    var pos = new Float32Array(N * 3);
    var col = new Float32Array(N * 3);
    var siz = new Float32Array(N);
    var pha = new Float32Array(N);
    var tmp = new THREE.Color();

    for (var i = 0; i < N; i++) {
      var p;
      if (i < N_SURF) p = hemiSurface(i % 2 ? 1 : -1);
      else if (i < N_NET) p = cerebellum();
      else if (i < N_NET + N_STEM) p = stem();
      else p = hemiInside(i % 2 ? 1 : -1);

      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];

      var m = Math.min(1, Math.max(0, (p[1] + 0.5) / 1.3));
      tmp.copy(cyan).lerp(violet, m);
      var rnd = Math.random();
      if (rnd < 0.10) tmp.copy(teal);
      else if (rnd < 0.16) tmp.copy(white);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;

      siz[i] = i >= N_NET + N_STEM ? 0.45 : 0.55 + Math.random() * 0.6;
      pha[i] = Math.random() * 6.283;
    }

    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    pGeo.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1));

    var pMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
      vertexShader: [
        'uniform float uTime; uniform float uPx;',
        'attribute vec3 aColor; attribute float aSize; attribute float aPhase;',
        'varying vec3 vColor; varying float vTw;',
        'void main(){',
        '  vColor = aColor;',
        '  vTw = 0.62 + 0.38 * sin(uTime * 2.0 + aPhase);',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = aSize * uPx * vTw * (30.0 / -mv.z);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor; varying float vTw;',
        'void main(){',
        '  float d = length(gl_PointCoord - 0.5);',
        '  if (d > 0.5) discard;',
        '  float a = pow(smoothstep(0.5, 0.0, d), 1.5);',
        '  gl_FragColor = vec4(vColor * (0.7 + a), a * (0.55 + 0.45 * vTw));',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var points = new THREE.Points(pGeo, pMat);
    brain.add(points);

    /* ---------- thin neural lines between close points ---------- */
    var cell = 0.14, grid = {};
    function gkey(x, y, z) { return Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell); }
    for (var a = 0; a < N_NET; a++) {
      var kk = gkey(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]);
      (grid[kk] || (grid[kk] = [])).push(a);
    }
    var segs = [];
    for (var s = 0; s < N_NET; s++) {
      var sx = pos[s * 3], sy = pos[s * 3 + 1], sz = pos[s * 3 + 2];
      var cx0 = Math.floor(sx / cell), cy0 = Math.floor(sy / cell), cz0 = Math.floor(sz / cell);
      var cand = [];
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
        var list = grid[(cx0 + dx) + ',' + (cy0 + dy) + ',' + (cz0 + dz)];
        if (!list) continue;
        for (var q = 0; q < list.length; q++) {
          var j = list[q];
          if (j <= s) continue;
          var ddx = pos[j * 3] - sx, ddy = pos[j * 3 + 1] - sy, ddz = pos[j * 3 + 2] - sz;
          var dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
          if (dist > 0.03 && dist < 0.17) cand.push([dist, j]);
        }
      }
      cand.sort(function (u, v) { return u[0] - v[0]; });
      for (var c = 0; c < cand.length && c < 2; c++) segs.push([s, cand[c][1]]);
    }

    var lPos = new Float32Array(segs.length * 6);
    var lCol = new Float32Array(segs.length * 6);
    for (var e = 0; e < segs.length; e++) {
      var A = segs[e][0], B = segs[e][1];
      lPos.set([pos[A * 3], pos[A * 3 + 1], pos[A * 3 + 2], pos[B * 3], pos[B * 3 + 1], pos[B * 3 + 2]], e * 6);
      lCol.set([col[A * 3] * 0.8, col[A * 3 + 1] * 0.8, col[A * 3 + 2] * 0.8,
                col[B * 3] * 0.8, col[B * 3 + 1] * 0.8, col[B * 3 + 2] * 0.8], e * 6);
    }
    var lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
    var lines = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.2,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    brain.add(lines);

    /* ---------- small light pulses travelling along the lines ---------- */
    var spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = spriteCanvas.height = 64;
    var sctx = spriteCanvas.getContext('2d');
    var sg = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    sg.addColorStop(0, 'rgba(255,255,255,1)');
    sg.addColorStop(0.25, 'rgba(160,235,255,0.9)');
    sg.addColorStop(1, 'rgba(79,209,255,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 64, 64);

    var N_PULSE = segs.length ? 70 : 0;
    var pulses = [];
    var pulsePos = new Float32Array(N_PULSE * 3);
    for (var pi = 0; pi < N_PULSE; pi++) {
      pulses.push({ seg: (Math.random() * segs.length) | 0, t: Math.random(), v: 0.25 + Math.random() * 0.5 });
    }
    var pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
    var pulseMesh = new THREE.Points(pulseGeo, new THREE.PointsMaterial({
      size: 0.13, map: new THREE.CanvasTexture(spriteCanvas), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    brain.add(pulseMesh);

    function updatePulses(dt) {
      for (var n = 0; n < N_PULSE; n++) {
        var pu = pulses[n];
        pu.t += pu.v * dt;
        if (pu.t >= 1) {
          // hop to a neighbouring line so the light seems to travel through the brain
          pu.t = 0;
          var cur = segs[pu.seg][1], nextList = [];
          for (var k = 0; k < 6; k++) {
            var cand = (Math.random() * segs.length) | 0;
            if (segs[cand][0] === cur) { nextList.push(cand); break; }
          }
          pu.seg = nextList.length ? nextList[0] : ((Math.random() * segs.length) | 0);
        }
        var AA = segs[pu.seg][0], BB = segs[pu.seg][1], tt = pu.t;
        pulsePos[n * 3]     = pos[AA * 3]     + (pos[BB * 3]     - pos[AA * 3])     * tt;
        pulsePos[n * 3 + 1] = pos[AA * 3 + 1] + (pos[BB * 3 + 1] - pos[AA * 3 + 1]) * tt;
        pulsePos[n * 3 + 2] = pos[AA * 3 + 2] + (pos[BB * 3 + 2] - pos[AA * 3 + 2]) * tt;
      }
      pulseGeo.attributes.position.needsUpdate = true;
    }

    /* ---------- placement on screen ---------- */
    var baseX = 0, baseY = 0;
    function resize() {
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      var visH = 2 * Math.tan((camera.fov / 2) * Math.PI / 180) * camera.position.z;
      var visW = visH * camera.aspect;
      if (w > 900) {            // computer: brain on the right side
        baseX = visW * 0.21; baseY = 0.05;
        rig.scale.setScalar(Math.min(1.5, visH / 2.8));
      } else {                  // phone / tablet: brain centred behind the text
        baseX = 0; baseY = visH * 0.05;
        rig.scale.setScalar(Math.min(1.1, visW / 2.8));
      }
      rig.position.set(baseX, baseY, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    /* ---------- cursor / finger tracking ---------- */
    var mouse = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    function setPointer(cx, cy) {
      mouse.x = (cx / window.innerWidth) * 2 - 1;
      mouse.y = (cy / window.innerHeight) * 2 - 1;
    }
    window.addEventListener('mousemove', function (ev) { setPointer(ev.clientX, ev.clientY); }, { passive: true });
    window.addEventListener('touchmove', function (ev) {
      if (ev.touches[0]) setPointer(ev.touches[0].clientX, ev.touches[0].clientY);
    }, { passive: true });

    /* ---------- only draw while the hero is on screen ---------- */
    var visible = true;
    var hero = document.getElementById('home');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { threshold: 0 }).observe(hero);
    }

    /* ---------- animation loop ---------- */
    var last = performance.now();
    var motion = reduceMotion ? 0.25 : 1;
    function tick(now) {
      requestAnimationFrame(tick);
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;

      var t = now / 1000;
      cur.x += (mouse.x - cur.x) * 0.05;
      cur.y += (mouse.y - cur.y) * 0.05;

      brain.rotation.y = 0.6 + cur.x * 0.85 + Math.sin(t * 0.25) * 0.16 * motion;
      brain.rotation.x = 0.1 + cur.y * 0.4 + Math.sin(t * 0.3) * 0.04 * motion;
      brain.position.y = Math.sin(t * 0.8) * 0.04 * motion;
      rig.position.x = baseX + cur.x * 0.18;          // slight parallax shift
      rig.position.y = baseY - cur.y * 0.12;

      pMat.uniforms.uTime.value = t * motion;
      updatePulses(dt * motion);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);
  }
})();
