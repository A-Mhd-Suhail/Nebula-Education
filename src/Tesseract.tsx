import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

export interface TessNode {
  key: string;
  label: string;
  sub: string;
  badge?: string;
  icon: ReactNode;
}

/* ---------- 4D geometry: 16 vertices (±1,±1,±1,±1), 32 edges ---------- */
const VERTS: number[][] = Array.from({ length: 16 }, (_, i) => [
  i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1,
]);
const EDGES: Array<[number, number, boolean]> = [];
for (let i = 0; i < 16; i++) {
  for (let j = i + 1; j < 16; j++) {
    const x = i ^ j;
    if (x === 1 || x === 2 || x === 4 || x === 8) EDGES.push([i, j, x === 8]);
  }
}

/* vertex of the tesseract each menu node is wired to */
const LINK = [1, 7, 10, 12, 6];

/* cards sit on an ellipse (percent of stage) — a pentagon for 5 items */
const RX = 38;
const RY = 40;
const nodePos = (i: number, n: number): { x: number; y: number } => {
  const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
  return { x: 50 + RX * Math.cos(a), y: 50 + RY * Math.sin(a) };
};

function sprite(rgb: string, n: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  if (!g) return c;
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.18, `rgba(${rgb},.95)`);
  r.addColorStop(0.5, `rgba(${rgb},.22)`);
  r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, n, n);
  return c;
}

const rot = (v: number[], i: number, j: number, th: number): void => {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const a = v[i];
  const b = v[j];
  v[i] = a * c - b * s;
  v[j] = a * s + b * c;
};

interface Props {
  nodes: TessNode[];
  onSelect: (key: string) => void;
}

export default function TesseractMenu({ nodes, onSelect }: Props): JSX.Element {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const hover = useRef(-1);
  const mouse = useRef({ x: 0, y: 0 });
  const count = nodes.length;

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const mqDesk = window.matchMedia("(min-width:900px)");
    const blue = sprite("80,170,255", 64);
    const amber = sprite("255,150,40", 64);

    let W = 0;
    let H = 0;
    let dpr = 1;
    let desk = true;
    let t = 1.2;
    let speed = reduce ? 0 : 1;
    let mx = 0;
    let my = 0;
    let last = performance.now();
    let raf = 0;

    const resize = (): void => {
      const r = cv.getBoundingClientRect();
      W = r.width;
      H = r.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      desk = mqDesk.matches;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    const draw = (time: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * (desk ? 0.085 : 0.1);
      const hv = hover.current;

      /* faint pentagon + orbit rings (desktop) */
      ctx.globalCompositeOperation = "source-over";
      if (desk) {
        ctx.strokeStyle = "rgba(80,170,255,.09)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
          const p = nodePos(i % count, count);
          const x = (p.x / 100) * W;
          const y = (p.y / 100) * H;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(80,170,255,.07)";
      for (const k of [2.6, 3.8]) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * k, 0, Math.PI * 2);
        ctx.stroke();
      }

      /* rotate in 4D, project 4D → 3D → 2D */
      const P = VERTS.map((src) => {
        const v = src.slice();
        rot(v, 0, 1, t * 0.23 + mx * 0.9);
        rot(v, 0, 2, t * 0.31 + my * 0.9);
        rot(v, 0, 3, t * 0.5);
        rot(v, 1, 3, t * 0.41);
        rot(v, 2, 3, t * 0.17);
        const k = 3.2 / (3.2 - v[3]);
        const x3 = v[0] * k;
        const y3 = v[1] * k;
        const z3 = v[2] * k;
        const s = 8 / (8 - z3);
        const d = Math.max(0, Math.min(1, (z3 + 4) / 8));
        return { x: cx + x3 * s * R, y: cy + y3 * s * R, d };
      });

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      /* edges */
      const linked = hv >= 0 ? LINK[hv % LINK.length] : -1;
      for (const [i, j, isW] of EDGES) {
        const A = P[i];
        const B = P[j];
        const d = (A.d + B.d) / 2;
        const col = isW ? "255,154,46" : "80,170,255";
        const hot = linked >= 0 && (i === linked || j === linked);
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = `rgba(${col},${hot ? 0.22 : 0.05 + 0.07 * d})`;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${col},${hot ? 1 : 0.32 + 0.5 * d})`;
        ctx.lineWidth = hot ? 2.2 : 1.3;
        ctx.stroke();
      }

      /* vertices */
      for (let i = 0; i < 16; i++) {
        const p = P[i];
        const size = (7 + 9 * p.d) * (desk ? 1 : 0.85);
        ctx.drawImage(VERTS[i][3] < 0 ? blue : amber, p.x - size, p.y - size, size * 2, size * 2);
      }

      /* wires from each menu card to its vertex */
      for (let n = 0; n < count; n++) {
        const v = P[LINK[n % LINK.length]];
        const hot = hv === n;
        const pulse = 0.5 + 0.5 * Math.sin(time * 3 + n);
        const sz = (hot ? 30 : 20) + pulse * 6;
        ctx.drawImage(amber, v.x - sz, v.y - sz, sz * 2, sz * 2);
        if (!desk) continue;
        const p = nodePos(n, count);
        const ax = (p.x / 100) * W;
        const ay = (p.y / 100) * H;
        const g = ctx.createLinearGradient(ax, ay, v.x, v.y);
        g.addColorStop(0, `rgba(255,154,46,${hot ? 0.95 : 0.4})`);
        g.addColorStop(1, `rgba(80,170,255,${hot ? 0.95 : 0.5})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = hot ? 2 : 1.1;
        ctx.setLineDash(hot ? [6, 6] : [3, 7]);
        ctx.lineDashOffset = reduce ? 0 : -time * (hot ? 40 : 14);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = reduce ? 0 : hover.current >= 0 ? 0.3 : 1;
      speed += (target - speed) * Math.min(1, dt * 4);
      t += dt * speed;
      mx += (mouse.current.x - mx) * Math.min(1, dt * 3);
      my += (mouse.current.y - my) * Math.min(1, dt * 3);
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [count]);

  return (
    <div
      className="sd-tess"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mouse.current = {
          x: ((e.clientX - r.left) / r.width - 0.5) * 2,
          y: ((e.clientY - r.top) / r.height - 0.5) * 2,
        };
      }}
      onPointerLeave={() => { mouse.current = { x: 0, y: 0 }; }}
    >
      <canvas ref={cvRef} className="sd-cv" aria-hidden="true" />
      {nodes.map((n, i) => {
        const p = nodePos(i, count);
        return (
          <button
            key={n.key}
            type="button"
            className="sd-node"
            style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--d": `${120 + i * 80}ms` } as CSSProperties}
            onClick={() => onSelect(n.key)}
            onPointerEnter={() => { hover.current = i; }}
            onPointerLeave={() => { hover.current = -1; }}
            onFocus={() => { hover.current = i; }}
            onBlur={() => { hover.current = -1; }}
          >
            <span className="sd-node-ic">{n.icon}</span>
            <span className="sd-node-tx"><b>{n.label}</b><small>{n.sub}</small></span>
            {n.badge && <em className="sd-node-bd">{n.badge}</em>}
          </button>
        );
      })}
      <p className="sd-cap">Hover a node to wire it into the tesseract · click to open</p>
    </div>
  );
}
