// src/teacher/NoiseGuard.tsx — live classroom mic monitor with alarm above your dB limit
import { useEffect, useRef, useState } from "react";
import { add } from "../firebase";
import type { User } from "../firebase";
import type { Notify } from "../views";

interface Breach { db: number; at: number; }

export default function NoiseGuard({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const [running, setRunning] = useState(false);
  const [db, setDb] = useState(0);
  const [alarm, setAlarm] = useState(false);
  const [th, setTh] = useState<number>(() => {
    const v = Number(localStorage.getItem("sc-noise-th"));
    return v > 20 && v < 120 ? v : 50;
  });
  const [breaches, setBreaches] = useState<Breach[]>([]);
  const [err, setErr] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const breachSinceRef = useRef<number | null>(null);
  const beepRef = useRef<number | null>(null);
  const thRef = useRef(th);
  const runRef = useRef(false);
  thRef.current = th;
  runRef.current = running;

  const stopEverything = (): void => {
    cancelAnimationFrame(rafRef.current);
    if (beepRef.current !== null) { clearInterval(beepRef.current); beepRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setAlarm(false); setDb(0); setRunning(false);
  };

  useEffect(() => () => stopEverything(), []);

  const beep = (ctx: AudioContext): void => {
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880; o.type = "square";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.22);
    } catch { /* ignore */ }
  };

  const start = async (): Promise<void> => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      setRunning(true);
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        try { void Notification.requestPermission(); } catch { /* ignore */ }
      }
      const loop = (): void => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        const val = Math.max(20, Math.min(120, Math.round(20 * Math.log10(Math.max(rms, 1e-6)) + 94)));
        frameRef.current += 1;
        if (frameRef.current % 8 === 0) setDb(val);
        const t = thRef.current;
        if (val > t) {
          if (breachSinceRef.current === null) breachSinceRef.current = Date.now();
          else if (Date.now() - breachSinceRef.current > 3000 && !alarm) {
            setAlarm(true);
            setBreaches((b) => [{ db: val, at: Date.now() }, ...b].slice(0, 20));
            if (beepRef.current === null) {
              beep(ctx);
              beepRef.current = window.setInterval(() => beep(ctx), 800);
            }
            try {
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification("🔊 Noise alarm", { body: `${val} dB in class — limit ${t} dB` });
              }
            } catch { /* ignore */ }
            void add("noiseAlarms", { teacherUid: me.uid, teacherName: me.name, className: me.className ?? null, peakDb: val, limit: t, at: Date.now() }).catch(() => undefined);
            notify(`🔊 Noise alarm — ${val} dB crossed your ${t} dB limit`, "error");
            const bridge = (window as unknown as Record<string, { sendCommand?: (c: string, cmd: string, a?: object) => void } | undefined>).__HW_BRIDGE__;
            bridge?.sendCommand?.("CLASSROOM-CTRL", "buzzer_on", { duration: 3 });
          }
        } else if (val < t - 3 && breachSinceRef.current !== null) {
          breachSinceRef.current = null;
          setAlarm(false);
          if (beepRef.current !== null) { clearInterval(beepRef.current); beepRef.current = null; }
        }
        if (runRef.current) rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      notify("Mic monitor running — you'll be alarmed above " + th + " dB");
    } catch (e) {
      setErr("Microphone permission denied or unavailable — allow mic access and try again.");
      console.debug("[NoiseGuard]", e);
    }
  };

  const level = db >= th ? "ALARM" : db >= th - 10 ? "Watch" : "Safe";

  return (
    <div className="card">
      <h3>🔊 Noise Guard — classroom alarm</h3>
      <p className="sc-mini">Live microphone monitor. If class noise stays above your limit for 3 seconds, an alarm sounds, a browser notification fires, the event is logged, and (if the hardware bridge is connected) the classroom buzzer command is sent.</p>
      <div className="sc-db-row">
        <span className="sc-db">{db}<small> dB</small></span>
        <span className={`sc-alarm${alarm ? " on" : ""}`}>{alarm ? "🔴 ALARM" : level === "Watch" ? "🟠 WATCH" : "🟢 SAFE"}</span>
      </div>
      <div className="sc-send">
        <label className="sc-mini">Limit (dB)</label>
        <input type="number" min={30} max={110} value={th}
          onChange={(e) => { const v = Number(e.target.value); if (v > 20 && v < 120) { setTh(v); localStorage.setItem("sc-noise-th", String(v)); } }} />
        {running
          ? <button className="btn danger" type="button" onClick={stopEverything}>⏹ Stop monitor</button>
          : <button className="btn primary" type="button" onClick={() => void start()}>🎙 Start monitor</button>}
      </div>
      {err && <p className="sc-mini sc-danger">{err}</p>}
      <h4>Recent breaches</h4>
      <ul className="plain">
        {breaches.map((b) => <li key={b.at}>{b.db} dB — {new Date(b.at).toLocaleTimeString()}</li>)}
        {breaches.length === 0 && <li className="muted">None yet — peaceful class! 🙂</li>}
      </ul>
    </div>
  );
}
