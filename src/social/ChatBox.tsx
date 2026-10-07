// src/social/ChatBox.tsx — 1:1 chat used by profiles, social hub and Study Connect DMs
import { useState } from "react";
import type { User } from "../firebase";
import type { Notify } from "../views";
import { useCol, sendMessage, threadIdOf, type MsgDoc } from "./data";

export default function ChatBox({ me, other, notify, onBack }: {
  me: User; other: User; notify: Notify; onBack?: () => void;
}): JSX.Element {
  const tid = threadIdOf(me.uid, other.uid);
  const rows = useCol<MsgDoc>("messages", ["threadId", tid]).slice().sort((a, b) => a.at - b.at);
  const [text, setText] = useState("");
  const send = async (): Promise<void> => {
    if (!text.trim()) return;
    await sendMessage(me, other, text);
    setText("");
    notify("Message sent");
  };
  return (
    <div className="card">
      <div className="phead">
        {onBack && <button className="btn" type="button" onClick={onBack}>← Back</button>}
        <b>Chat with {other.name}</b>
      </div>
      <div className="sc-chat">
        {rows.length === 0 && <p className="sc-empty">No messages yet — say hello!</p>}
        {rows.map((m) => (
          <div key={m.id} className={`sc-msg${m.from === me.uid ? " mine" : ""}`}>
            <span>{m.text}</span>
            <small>{m.fromName}</small>
          </div>
        ))}
      </div>
      <div className="sc-send">
        <input value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…" onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
        <button className="btn primary" type="button" onClick={() => void send()}>Send</button>
      </div>
    </div>
  );
}
