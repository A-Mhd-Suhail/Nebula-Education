"""
The Pentagon Inc — Hardware Gateway (final)
Bridges Raspberry Pi agents ↔ web dashboards.
Run: pip install fastapi uvicorn  →  uvicorn main:app --host 0.0.0.0 --port 8000
"""
import json, os, sqlite3, time, uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB = os.getenv("HW_DB", "gateway.db")
ADMIN_TOKEN = os.getenv("HW_ADMIN_TOKEN", "change-me")
STRICT = os.getenv("HW_STRICT_AUTH", "0") == "1"

def q(sql: str, args: tuple = (), fetch: Optional[str] = None):
    conn = sqlite3.connect(DB); conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(sql, args)
        if fetch == "one": return cur.fetchone()
        if fetch == "all": return cur.fetchall()
        conn.commit(); return cur
    finally:
        conn.close()

def init_db():
    conn = sqlite3.connect(DB)
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS devices(device_code TEXT PRIMARY KEY, token TEXT,
      room_id TEXT, status TEXT DEFAULT 'offline', last_seen TEXT);
    CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY, type TEXT,
      room_id TEXT, device_id TEXT, ts TEXT, payload TEXT);
    CREATE TABLE IF NOT EXISTS commands(id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_code TEXT, command TEXT, args TEXT, delivered INTEGER DEFAULT 0,
      created_at TEXT);
    """)
    conn.commit()
init_db()

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

class Hub:
    def __init__(self) -> None:
        self.browsers: Set[WebSocket] = set()
        self.devices: Dict[str, WebSocket] = {}

    async def broadcast(self, msg: dict) -> None:
        data = json.dumps(msg)
        for ws in list(self.browsers):
            try:
                await ws.send_text(data)
            except Exception:
                self.browsers.discard(ws)

    async def to_device(self, code: str, msg: dict) -> bool:
        ws = self.devices.get(code)
        if not ws:
            return False
        try:
            await ws.send_text(json.dumps(msg))
            return True
        except Exception:
            self.devices.pop(code, None)
            return False

hub = Hub()

class DeviceReg(BaseModel):
    device_code: str
    device_type: str = "pi3"
    room_id: Optional[str] = None

class Ingest(BaseModel):
    event_id: Optional[str] = None
    type: str
    room_id: Optional[str] = None
    device_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)

class Command(BaseModel):
    device_code: str
    command: str
    args: Dict[str, Any] = Field(default_factory=dict)

def check_device_token(code: str, token: Optional[str]) -> bool:
    row = q("SELECT token FROM devices WHERE device_code=?", (code,), fetch="one")
    if row is None:
        return not STRICT          # unregistered allowed unless strict mode
    return bool(token) and row["token"] == token

async def route(evt: Ingest) -> dict:
    eid = evt.event_id or str(uuid.uuid4())
    ts = now()
    cur = q("INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?)",
            (eid, evt.type, evt.room_id, evt.device_id, ts, json.dumps(evt.payload)))
    if cur.rowcount == 0:                       # idempotent replay guard
        return {"ok": True, "duplicate": True}
    if evt.device_id:
        q("UPDATE devices SET status='online', last_seen=? WHERE device_code=?",
          (ts, evt.device_id))
    await hub.broadcast({"type": evt.type, "roomId": evt.room_id,
                         "deviceId": evt.device_id, "ts": ts, "payload": evt.payload})
    return {"ok": True, "event_id": eid}

app = FastAPI(title="Pentagon Hardware Gateway")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"ok": True, "browsers": len(hub.browsers), "devices": len(hub.devices),
            "time": now()}

@app.post("/api/devices")
def register(d: DeviceReg, x_admin_token: Optional[str] = Header(None)):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(401, "bad admin token")
    token = uuid.uuid4().hex
    q("""INSERT INTO devices(device_code,token,room_id) VALUES(?,?,?)
         ON CONFLICT(device_code) DO UPDATE SET token=excluded.token,
         room_id=excluded.room_id""", (d.device_code, token, d.room_id))
    return {"ok": True, "device_token": token}

@app.get("/api/devices")
def list_devices(x_admin_token: Optional[str] = Header(None)):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(401, "bad admin token")
    rows = q("SELECT device_code,room_id,status,last_seen FROM devices", fetch="all") or []
    return {"devices": [dict(r) for r in rows]}

@app.post("/api/events")
async def ingest(evt: Ingest, x_device_token: Optional[str] = Header(None)):
    if evt.device_id and not check_device_token(evt.device_id, x_device_token):
        raise HTTPException(401, "bad device token")
    return await route(evt)

@app.post("/api/command")
async def command(cmd: Command):
    q("INSERT INTO commands(device_code,command,args,created_at) VALUES(?,?,?,?)",
      (cmd.device_code, cmd.command, json.dumps(cmd.args), now()))
    sent = await hub.to_device(cmd.device_code,
                               {"type": "command", "command": cmd.command,
                                "args": cmd.args})
    return {"ok": True, "delivered_ws": sent}

@app.get("/api/device/{code}/poll")
async def poll(code: str, x_device_token: Optional[str] = Header(None)):
    if not check_device_token(code, x_device_token):
        raise HTTPException(401, "bad device token")
    rows = q("SELECT id,command,args FROM commands WHERE device_code=? AND delivered=0 "
             "ORDER BY id LIMIT 10", (code,), fetch="all") or []
    for r in rows:
        q("UPDATE commands SET delivered=1 WHERE id=?", (r["id"],))
    q("UPDATE devices SET status='online', last_seen=? WHERE device_code=?", (now(), code))
    return {"commands": [{"command": r["command"], "args": json.loads(r["args"])}
                         for r in rows]}

@app.websocket("/ws")
async def ws_browser(ws: WebSocket):
    await ws.accept()
    hub.browsers.add(ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get("kind") == "ping":
                await ws.send_text(json.dumps({"kind": "pong", "ts": time.time()}))
    except WebSocketDisconnect:
        pass
    finally:
        hub.browsers.discard(ws)

@app.websocket("/ws/device/{code}")
async def ws_device(ws: WebSocket, code: str, token: Optional[str] = None):
    if not check_device_token(code, token):
        await ws.close(code=4401)
        return
    hub.devices[code] = ws
    q("UPDATE devices SET status='online', last_seen=? WHERE device_code=?", (now(), code))
    await hub.broadcast({"type": "device_status", "roomId": None, "deviceId": code,
                         "ts": now(), "payload": {"status": "online"}})
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get("kind") == "ping":
                await ws.send_text(json.dumps({"kind": "pong"}))
                continue
            if data.get("type"):
                await route(Ingest(type=data["type"], room_id=data.get("room_id"),
                                   device_id=data.get("device_id", code),
                                   event_id=data.get("event_id"),
                                   payload=data.get("payload") or {}))
    except WebSocketDisconnect:
        pass
    finally:
        hub.devices.pop(code, None)
        q("UPDATE devices SET status='offline', last_seen=? WHERE device_code=?",
          (now(), code))
        await hub.broadcast({"type": "device_status", "roomId": None, "deviceId": code,
                             "ts": now(), "payload": {"status": "offline"}})
