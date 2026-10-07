// src/student/StudyConnect.tsx — live group study: same-subject rooms, video mesh, chat, AI focus guard
import { useEffect, useRef, useState } from "react";
import { add } from "../firebase";
import type { User } from "../firebase";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { Notify } from "../views";
import { Empty } from "../social/kit";
import ChatBox from "../social/ChatBox";
import {
  useCol, SUBJECTS, todayISO, getUserDoc, myBan, monthViolations, logViolation,
  createRoom, closeRoom, startSession, endSession,
  type StudyRoomDoc, type BanDoc,
} from "../social/data";
import "../social/social.css";

interface PeerDoc { uid: string; name: string; joinedAt: number; }
interface SigDoc { id: string; to: string; from: string; kind: "offer" | "answer" | "ice"; data: unknown; at: number; }
interface RoomChat { id: string; uid: string; name: string; text: string; at: number; }

export default function StudyConnect({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<StudyRoomDoc | null>(null);
  const [tick, setTick] = useState(0);
  const [ban, setBan] = useState<BanDoc | null>(null);
  const [strikes, setStrikes] = useState(0);
  const rooms = useCol<StudyRoomDoc>("studyRooms", ["active", true]).slice().sort((a, b) => b.createdAt - a.createdAt);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [topic, setTopic] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let dead = false;
    void (async () => {
      const b = await myBan(me.uid);
      if (!dead) { setBan(b); setStrikes(await monthViolations(me.uid)); }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, roomId]);

  const join = (r: StudyRoomDoc): void => { if (ban) { notify(`Study Connect restricted until ${new Date(ban.until).toLocaleDateString()}`, "error"); return; } setRoom(r); setRoomId(r.id); };

  if (roomId && room) {
    return <Room key={roomId} me={me} notify={notify} room={room} onLeave={(msg) => {
      setRoomId(null); setRoom(null); setTick((t) => t + 1);
      if (msg) notify(msg, "error");
    }} />;
  }

  const shown = filter === "all" ? rooms : rooms.filter((r) => r.subject === filter);
  return (
    <>
      {ban && (
        <div className="card">
          <h3>⛔ Study Connect restricted</h3>
          <p className="sc-danger">Reason: {ban.reason}. Until <b>{new Date(ban.until).toLocaleDateString()}</b>.</p>
          <p className="sc-mini">The AI focus guard issues a 1-month restriction after 3 violations in a month; 3 consecutive monthly restrictions become 1 year.</p>
        </div>
      )}
      <div className="card">
        <h3>⚡ Create a study room</h3>
        <div className="sc-send">
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (e.g., Quadratic equations)" />
          <button className="btn primary" type="button" onClick={async () => {
            if (ban) { notify("You are restricted from Study Connect", "error"); return; }
            const id = await createRoom(me, subject, topic);
            join({ id, subject, topic, hostUid: me.uid, hostName: me.name, active: true, createdAt: Date.now() });
          }}>Create & join</button>
        </div>
        <p className="sc-mini">⚠️ AI focus guard is ON inside rooms: leaving the tab, no study activity on camera, or missing study check-ins ends the video and counts a strike.</p>
      </div>
      <div className="card">
        <h3>🔴 Live rooms {strikes > 0 && <span className="sc-badge role">{strikes} strike{strikes > 1 ? "s" : ""} this month</span>}</h3>
        <div className="sc-actions">
          <button className={`sc-chip${filter === "all" ? " on" : ""}`} type="button" onClick={() => setFilter("all")}>All subjects</button>
          {[...new Set(rooms.map((r) => r.subject))].map((s) => (
            <button key={s} className={`sc-chip${filter === s ? " on" : ""}`} type="button" onClick={() => setFilter(s)}>{s}</button>
          ))}
        </div>
        {shown.length === 0 && <Empty>No live rooms — create one!</Empty>}
        {shown.map((r) => (
          <div className="sc-kv" key={r.id}>
            <span><b>{r.subject}</b> · {r.topic || "General"} <span className="sc-mini">· host {r.hostName}</span></span>
            <button className="btn primary" type="button" onClick={() => join(r)}>Join</button>
          </div>
        ))}
      </div>
    </>
  );
}

function Room({ me, notify, room, onLeave }: {
  me: User; notify: Notify; room: StudyRoomDoc; onLeave: (msg?: string) => void;
}): JSX.Element {
  const peers = useCol<PeerDoc>(`rooms/${room.id}/peers`);
  const signals = useCol<SigDoc>(`rooms/${room.id}/signals`, ["to", me.uid]);
  const chat = useCol<RoomChat>(`rooms/${room.id}/chat`).slice().sort((a, b) => a.at - b.at);

  const [videoOn, setVideoOn] = useState(false);
  const [videoErr, setVideoErr] = useState("");
  const [activeRemote, setActiveRemote] = useState<string | null>(null);
  const [vTick, setVTick] = useState(0);
  const [chatText, setChatText] = useState("");
  const [dmUid, setDmUid] = useState<string | null>(null);
  const [dmUser, setDmUser] = useState<User | null>(null);
  const [check, setCheck] = useState<{ deadline: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [ended, setEnded] = useState<string | null>(null);

  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const streams = useRef<Map<string, MediaStream>>(new Map());
  const offered = useRef<Set<string>>(new Set());
  const localRef = useRef<MediaStream | null>(null);
  const myJoined = useRef<number>(Date.now());
  const sessionRef = useRef<string>("");
  const lastMotion = useRef<number>(Date.now());
  const prevFrame = useRef<Uint8ClampedArray | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const hideViolated = useRef(false);
  const violatedSince = useRef(0);
  const focusTotal = useRef(0); const focusClean = useRef(0);
  const violations = useRef(0);
  const warnedIdle = useRef(false);
  const checkRef = useRef<{ deadline: number } | null>(null);
  const endedRef = useRef(false);
  const unsubs = useRef<Array<() => void>>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const localVid = useRef<HTMLVideoElement | null>(null);
  const remoteVid = useRef<HTMLVideoElement | null>(null);
  const peersRef = useRef<PeerDoc[]>([]);
  peersRef.current = peers;

  checkRef.current = check;

  const sendSig = (to: string, kind: SigDoc["kind"], data: unknown): void => {
    void add(`rooms/${room.id}/signals`, { to, from: me.uid, kind, data, at: Date.now() }).catch(() => undefined);
  };

  const ensurePc = (uid: string): RTCPeerConnection => {
    const ex = pcs.current.get(uid);
    if (ex) return ex;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.onicecandidate = (ev) => { if (ev.candidate) sendSig(uid, "ice", ev.candidate.toJSON()); };
    pc.ontrack = (ev) => {
      streams.current.set(uid, ev.streams[0]);
      setActiveRemote((p) => p ?? uid);
      setVTick((t) => t + 1);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") { try { pc.close(); } catch { /* ignore */ } pcs.current.delete(uid); }
    };
    if (localRef.current) localRef.current.getTracks().forEach((t) => pc.addTrack(t, localRef.current as MediaStream));
    pcs.current.set(uid, pc);
    return pc;
  };

  /* signaling intake */
  useEffect(() => {
    if (endedRef.current) return;
    for (const s of signals) {
      void (async () => {
        try {
          if (s.kind === "offer") {
            const pc = ensurePc(s.from);
            await pc.setRemoteDescription(new RTCSessionDescription(s.data as RTCSessionDescriptionInit));
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            sendSig(s.from, "answer", ans);
          } else if (s.kind === "answer") {
            const pc = pcs.current.get(s.from);
            if (pc && pc.signalingState !== "stable") {
              await pc.setRemoteDescription(new RTCSessionDescription(s.data as RTCSessionDescriptionInit));
            }
          } else if (s.kind === "ice") {
            const pc = pcs.current.get(s.from);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(s.data as RTCIceCandidateInit)).catch(() => undefined);
          }
        } catch (e) { console.debug("[study] signal", e); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.length]);

  /* peer connections: older peer initiates offer to newer */
  useEffect(() => {
    if (endedRef.current) return;
    for (const p of peers) {
      if (p.uid === me.uid) continue;
      if (!pcs.current.has(p.uid)) {
        ensurePc(p.uid);
        if (p.joinedAt >= myJoined.current && !offered.current.has(p.uid)) {
          offered.current.add(p.uid);
          void (async () => {
            try {
              const pc = ensurePc(p.uid);
              const off = await pc.createOffer();
              await pc.setLocalDescription(off);
              sendSig(p.uid, "offer", off);
            } catch (e) { console.debug("[study] offer", e); }
          })();
        }
      }
    }
    for (const uid of [...pcs.current.keys()]) {
      if (!peers.some((p) => p.uid === uid)) {
        try { pcs.current.get(uid)?.close(); } catch { /* ignore */ }
        pcs.current.delete(uid); streams.current.delete(uid);
        setActiveRemote((cur) => (cur === uid ? (streams.current.keys().next().value ?? null) : cur));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers.length]);

  /* mount: peer doc, media, session, watches cleanup */
  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        await import("../firebase").then((fb) => fb.set(`rooms/${room.id}/peers`, me.uid, { uid: me.uid, name: me.name, joinedAt: myJoined.current }));
      } catch (e) { console.debug("[study] peer", e); }
      sessionRef.current = await startSession(me.uid, room.id, room.subject).catch(() => "");
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480 } }, audio: false });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        localRef.current = s;
        setVideoOn(true);
        if (localVid.current) localVid.current.srcObject = s;
      } catch (e) {
        setVideoErr("Camera unavailable — chat + check-ins still guard the session.");
        console.debug("[study] cam", e);
      }
    })();
    const onVis = (): void => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); hideViolated.current = false; }
      else hiddenAt.current = null;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { dead = true; document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  /* focus monitor: motion + visibility + check-ins + focus score */
  useEffect(() => {
    const motion = window.setInterval(() => {
      const v = localVid.current;
      if (!v || !videoOn || v.readyState < 2) return;
      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      const c = canvasRef.current; c.width = 64; c.height = 48;
      const g = c.getContext("2d");
      if (!g) return;
      try {
        g.drawImage(v, 0, 0, 64, 48);
        const d = g.getImageData(0, 0, 64, 48).data;
        if (prevFrame.current) {
          let diff = 0;
          for (let i = 0; i < d.length; i += 4) diff += Math.abs(d[i] - prevFrame.current[i]);
          if (diff / (d.length / 4) > 4) lastMotion.current = Date.now();
        }
        prevFrame.current = new Uint8ClampedArray(d);
      } catch { /* ignore */ }
    }, 2000);

    const guard = window.setInterval(() => {
      if (endedRef.current) return;
      const t = Date.now();
      focusTotal.current += 1;
      if (t - violatedSince.current > 35000) focusClean.current += 1;
      if (document.hidden && hiddenAt.current && t - hiddenAt.current > 15000 && !hideViolated.current) {
        hideViolated.current = true;
        doViolation("Left the study screen");
      }
      if (checkRef.current && t > checkRef.current.deadline) {
        setCheck(null); checkRef.current = null;
        doViolation("Missed study check-in");
      }
      if (videoOn && t - lastMotion.current > 150000 && !warnedIdle.current) {
        warnedIdle.current = true; notify("AI guard: no study activity detected on camera…", "error");
      }
      if (videoOn && t - lastMotion.current > 240000) {
        warnedIdle.current = false; lastMotion.current = Date.now();
        doViolation("No study activity detected");
      }
    }, 5000);

    const checks = window.setInterval(() => {
      if (!endedRef.current) { const c = { deadline: Date.now() + 30000 }; setCheck(c); checkRef.current = c; }
    }, 300000);
    const sec = window.setInterval(() => setNow(Date.now()), 1000);

    return () => { clearInterval(motion); clearInterval(guard); clearInterval(checks); clearInterval(sec); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoOn]);

  const doViolation = (reason: string): void => {
    if (endedRef.current) return;
    endedRef.current = true;
    violations.current += 1;
    violatedSince.current = Date.now();
    void logViolation(me.uid, room.id, reason);
    const focus = focusTotal.current ? Math.round((focusClean.current / focusTotal.current) * 100) : 100;
    if (sessionRef.current) void endSession(sessionRef.current, violations.current, focus);
    teardown();
    setEnded(reason);
    onLeave(`🤖 AI guard: ${reason} — session ended. Strike recorded.`);
  };

  const teardown = (): void => {
    unsubs.current.forEach((u) => { try { u(); } catch { /* ignore */ } });
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pcs.current.forEach((pc) => { try { pc.close(); } catch { /* ignore */ } });
    pcs.current.clear(); streams.current.clear();
    void deleteDoc(doc(db, `rooms/${room.id}/peers`, me.uid)).catch(() => undefined);
    void import("../firebase").then(async (fb) => {
      const rest = peersRef.current.filter((p) => p.uid !== me.uid);
      if (room.hostUid === me.uid && rest.length === 0) await fb.update("studyRooms", room.id, { active: false }).catch(() => undefined);
    });
  };

  const leave = (): void => {
    if (!endedRef.current) {
      endedRef.current = true;
      const focus = focusTotal.current ? Math.round((focusClean.current / focusTotal.current) * 100) : 100;
      if (sessionRef.current) void endSession(sessionRef.current, violations.current, focus);
      teardown();
    }
    onLeave();
  };

  useEffect(() => () => { if (!endedRef.current) { endedRef.current = true; teardown(); } // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (remoteVid.current && activeRemote) {
      remoteVid.current.srcObject = streams.current.get(activeRemote) ?? null;
    }
  }, [activeRemote, vTick]);

  if (dmUid && dmUser) {
    return <ChatBox me={me} other={dmUser} notify={notify} onBack={() => { setDmUid(null); setDmUser(null); }} />;
  }

  const others = peers.filter((p) => p.uid !== me.uid);
  const checkLeft = check ? Math.max(0, Math.ceil((check.deadline - now) / 1000)) : 0;

  return (
    <>
      <div className="card">
        <div className="phead">
          <b>🔴 {room.subject} · {room.topic || "General"}</b>
          <span className="sc-badge priv">🤖 AI guard ON</span>
          <span className="sc-mini">{others.length + 1} in room</span>
          <button className="btn danger" type="button" onClick={leave}>Leave room</button>
        </div>
        {videoErr && <p className="sc-mini sc-danger">{videoErr}</p>}
        <div className="sc-video">
          <video ref={remoteVid} autoPlay playsInline muted={false} />
          {!activeRemote && <p className="sc-empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>Waiting for peers to connect video… (chat works now)</p>}
          {activeRemote && <span className="tag">{peers.find((p) => p.uid === activeRemote)?.name ?? "Peer"}</span>}
        </div>
        {videoOn && <video ref={localVid} autoPlay playsInline muted className="sc-local" />}
        <div className="sc-actions">
          {others.map((p) => (
            <button key={p.uid} className="sc-chip" type="button" onClick={() => setActiveRemote(p.uid)}>🎥 {p.name}</button>
          ))}
          {others.map((p) => (
            <button key={`dm-${p.uid}`} className="sc-chip" type="button" onClick={async () => {
              const u = await getUserDoc(p.uid);
              if (u) { setDmUser(u); setDmUid(p.uid); }
            }}>💬 DM {p.name}</button>
          ))}
        </div>
        {check && !endedRef.current && (
          <div className="sc-check">
            <b>🤖 Quick check — are you studying?</b> <span className="sc-mini">auto-violation in {checkLeft}s</span>
            <button className="btn primary" type="button" onClick={() => { setCheck(null); checkRef.current = null; focusClean.current += 1; notify("Great — keep going! ⚡"); }}>
              ✋ I'm studying
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <h3>💬 Room chat</h3>
        <div className="sc-chat">
          {chat.length === 0 && <p className="sc-empty">Say hi and start studying together!</p>}
          {chat.map((m) => (
            <div key={m.id} className={`sc-msg${m.uid === me.uid ? " mine" : ""}`}>
              <span>{m.text}</span><small>{m.name}</small>
            </div>
          ))}
        </div>
        <div className="sc-send">
          <input value={chatText} onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && chatText.trim()) { void add(`rooms/${room.id}/chat`, { uid: me.uid, name: me.name, text: chatText.trim(), at: Date.now() }); setChatText(""); } }}
            placeholder="Discuss the topic…" />
          <button className="btn primary" type="button" onClick={() => {
            if (chatText.trim()) { void add(`rooms/${room.id}/chat`, { uid: me.uid, name: me.name, text: chatText.trim(), at: Date.now() }); setChatText(""); }
          }}>Send</button>
        </div>
      </div>
    </>
  );
}
