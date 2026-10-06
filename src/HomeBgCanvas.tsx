import { useEffect, useRef } from "react";

const P: [number, number][] = [
  [222.0,471.3],[231.0,475.3],[233.3,469.7],[149.3,432.7],[155.3,526.0],[266.0,174.3],[117.0,437.3],[124.3,450.3],[332.7,366.0],[381.3,375.7],[337.0,362.3],[312.7,360.3],[148.3,219.0],[217.0,437.3],[386.3,373.0],[129.7,366.3],[358.0,193.0],[155.3,424.3],[51.7,348.7],[254.7,420.3],[221.7,421.0],[362.0,352.3],[143.0,374.3],[83.0,204.3],[145.7,396.0],[221.3,205.7],[381.7,260.3],[208.7,436.0],[0.0,260.7],[275.0,315.7],[153.7,215.0],[220.0,223.7],[172.0,558.0],[208.0,473.0],[214.0,244.7],[293.0,341.3],[49.7,402.3],[255.0,406.0],[180.0,155.7],[228.0,453.3],[377.0,340.0],[192.3,434.0],[158.3,461.3],[207.3,351.0],[178.3,164.3],[222.7,238.0],[147.7,364.7],[39.7,274.3],[36.7,308.7],[85.7,267.0],[138.7,438.0],[321.7,339.0],[189.0,487.3],[391.7,351.7],[257.7,137.3],[204.7,507.7],[70.7,365.0],[9.7,283.3],[36.3,297.0],[403.3,276.3],[165.7,520.0],[214.7,483.0],[148.0,423.3],[8.7,310.0],[82.3,212.0],[321.3,384.0],[236.0,172.0],[296.3,435.0],[144.0,498.7],[233.7,202.3],[212.0,197.3],[84.7,411.7],[170.0,543.3],[179.0,204.7],[5.3,320.3],[169.3,506.0],[185.7,449.3],[176.0,544.0],[191.7,536.7],[213.3,353.3],[1.0,343.3],[146.3,143.7],[12.3,320.0],[166.0,154.3],[210.0,204.0],[178.3,284.0],[303.3,344.7],[240.7,456.0],[243.0,152.3],[211.7,502.7],[338.7,236.3],[195.3,417.3],[189.7,507.3],[33.3,284.7],[145.0,469.7],[164.3,136.0],[173.3,454.0],[292.7,379.7],[224.7,182.0],[211.7,152.0],[319.3,408.7],[203.0,439.7],[212.7,397.7],[233.3,154.0],[222.0,413.3],[24.3,402.3],[163.0,372.3],[128.0,172.0],[180.7,439.0],[213.7,138.0],[184.0,462.3],[242.0,432.0],[322.3,187.0],[186.0,133.3],[335.7,172.0],[28.7,407.3],[400.3,366.7],[232.3,434.3],[47.7,419.3],[342.0,209.7],[174.3,184.0],[323.3,403.3],[162.7,217.0],[234.7,133.3],[190.3,442.7],[272.7,154.3],[374.3,224.0],[76.3,158.7],[98.7,406.3],[219.7,153.3],[310.0,414.3],[256.0,304.7],[106.3,139.0],[322.7,414.3],[26.3,217.7],[39.3,452.7],[109.3,156.7],[277.0,425.3],[69.3,160.7],[295.7,200.7],[84.3,186.3],[369.7,382.7],[47.3,480.0],[135.3,184.0],[45.0,474.3],[66.3,425.7],[318.7,347.3],[1.3,287.7],[156.7,137.3],[227.7,403.0],[256.0,168.3],[147.0,184.0],[304.0,428.3],[78.0,362.3],[166.3,431.7],[55.3,470.0],[110.3,174.3],[295.3,197.0],[79.7,190.3],[58.3,248.0],[255.0,221.3],[226.7,157.3],[104.3,512.0],[323.3,364.3],[155.3,432.3],[151.0,150.3],[79.0,197.3],[83.0,379.3],[52.7,193.3],[287.3,164.0],[164.0,500.7],[129.0,193.3],[150.7,510.7],[101.3,420.7],[130.7,427.0],[346.0,361.3],[216.7,500.3],[202.3,133.0],[158.3,185.0],[155.3,276.3],[164.0,183.3],[285.0,378.7],[157.3,151.0],[162.3,476.7],[267.3,425.0],[378.3,335.7],[199.3,415.3],[179.7,411.7],[299.3,338.0],[280.7,186.3],[170.3,167.3],[266.3,255.7],[109.7,371.3],[186.7,187.7],[11.7,293.3],[279.7,173.0],[50.3,457.0],[46.3,243.3],[364.0,342.7],[302.3,341.3],[29.0,262.7],[164.3,525.7],[74.3,432.7],[168.3,444.7],[63.3,192.0],[197.7,442.7],[124.7,506.7],[158.3,467.3],[101.3,470.7],[99.0,398.7],[41.7,241.0],[109.7,498.3],[354.3,327.0],[251.0,130.7],[215.3,251.3],[383.3,273.3],[209.0,344.3],[126.0,498.7],[191.3,231.3],[243.7,234.3],[70.3,447.0]
];

interface DustParticle {
  x: number;
  y: number;
  r: number;
  a: number;
  v: number;
  c: HTMLCanvasElement;
}

function sprite(rgb: string, n: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  if (!g) return c;
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.16, `rgba(${rgb},.95)`);
  r.addColorStop(0.5, `rgba(${rgb},.2)`);
  r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, n, n);
  return c;
}

export default function HomeBgCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const amber = sprite("255,150,40", 64);
    const blue = sprite("80,170,255", 64);

    const IMG = new Image();
    let W = window.innerWidth;
    let H = window.innerHeight;
    let dpr = 1;
    let s = 1;
    let ox = 0;
    let oy = 0;
    let layer: HTMLCanvasElement | null = null;
    let dust: DustParticle[] = [];
    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let ok = false;
    let animId = 0;

    const resize = (): void => {
      if (!ok) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      const wide = W >= 900;
      const dh = wide ? H * 1.32 : H * 1.04;
      s = dh / (IMG.height || 1);
      const dw = (IMG.width || 1) * s;
      ox = (wide ? W * 0.67 : W / 2) - dw / 2;
      oy = (H - dh) / 2 + (wide ? H * 0.03 : 0);

      layer = document.createElement("canvas");
      layer.width = W * dpr;
      layer.height = H * dpr;
      const g = layer.getContext("2d");
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(IMG, ox, oy, dw, dh);
        g.globalCompositeOperation = "destination-out";

        const fade = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number): void => {
          const f = g.createLinearGradient(x0, y0, x1, y1);
          f.addColorStop(0, "rgba(0,0,0,1)");
          f.addColorStop(0.55, "rgba(0,0,0,.35)");
          f.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = f;
          g.fillRect(rx, ry, rw, rh);
        };
        const fx = dw * 0.22;
        const fy = dh * 0.12;
        fade(ox, 0, ox + fx, 0, ox, oy, fx, dh);
        fade(ox + dw, 0, ox + dw - fx, 0, ox + dw - fx, oy, fx + 2, dh);
        fade(0, oy, 0, oy + fy, ox, oy, dw, fy);
        fade(0, oy + dh, 0, oy + dh - fy, ox, oy + dh - fy, dw, fy + 2);
      }

      dust = [];
      for (let i = 0; i < 70; i++) {
        dust.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 0.8 + Math.random() * 1.8,
          a: 0.15 + Math.random() * 0.5,
          v: -(0.08 + Math.random() * 0.25),
          c: Math.random() < 0.55 ? amber : blue,
        });
      }
    };

    const frame = (t: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      tx += (mx - tx) * 0.05;
      ty += (my - ty) * 0.05;
      const sc = Math.min(window.scrollY / H, 1);
      const fadeVal = 1 - sc * 0.62;
      const fx = tx * 14;
      const fy = ty * 9 - sc * 50;

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fadeVal;
      if (layer) {
        ctx.drawImage(layer, fx, fy, W, H);
      }

      P.forEach((p, i) => {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.0018 + i * 2.1);
        const z = s * 2.2 + 4;
        ctx.globalAlpha = (0.1 + 0.38 * tw) * fadeVal;
        ctx.drawImage(i < 110 ? amber : blue, ox + p[0] * s + fx - z, oy + p[1] * s + fy - z, z * 2, z * 2);
      });

      dust.forEach((d) => {
        if (!reduce) {
          d.y += d.v;
          if (d.y < -10) {
            d.y = H + 10;
            d.x = Math.random() * W;
          }
        }
        ctx.globalAlpha = d.a * fadeVal;
        const z = d.r * 5;
        ctx.drawImage(d.c, d.x + tx * d.r * 10 - z, d.y - z, z * 2, z * 2);
      });

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      if (!reduce) {
        animId = requestAnimationFrame(frame);
      }
    };

    IMG.onload = () => {
      ok = true;
      resize();
      animId = requestAnimationFrame(frame);
    };
    IMG.src = "/brain.jpg";

    const onResize = (): void => {
      resize();
      if (reduce) frame(0);
    };

    const onPointerMove = (e: PointerEvent): void => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return <canvas id="bg" ref={canvasRef} aria-hidden="true" />;
}
