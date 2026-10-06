#!/usr/bin/env python3
"""Nebula Education — Raspberry Pi publisher.
pip install -r requirements.txt && python3 publisher.py
"""
import json, math, os, ssl, sys, time, threading
from datetime import datetime, timedelta

import paho.mqtt.client as mqtt
import psutil

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json")))
TOPIC_IN  = f"nebula/school_{CFG['school_id']}/events"
TOPIC_CMD = f"nebula/school_{CFG['school_id']}/commands"

try:
    import asyncio, bleak; HAS_BLE = True
except ImportError:
    HAS_BLE = False
try:
    import numpy as np; HAS_NP = True
except ImportError:
    HAS_NP = False
try:
    import sounddevice as sd; HAS_MIC = bool(HAS_NP)
except ImportError:
    HAS_MIC = False
try:
    import cv2; HAS_CV = True
except ImportError:
    HAS_CV = False
try:
    import RPi.GPIO as GPIO; HAS_GPIO = True
except (ImportError, RuntimeError):
    HAS_GPIO = False

LOG = lambda m: print(f"[{datetime.now().strftime('%H:%M:%S')}] {m}", flush=True)
THR = {"distance_threshold_m": CFG["distance_threshold_m"],
       "noise_warning_db": CFG["noise_warning_db"],
       "noise_alarm_db": CFG["noise_alarm_db"],
       "noise_window_sec": CFG["noise_window_sec"]}
state = {"session": False}
buf_lock = threading.Lock()
offline_buf = []
ble_seen = {}
buckets = None

# ================= MQTT =================
client = mqtt.Client(client_id=f"nebula-{CFG['device_id']}", clean_session=True)
if CFG.get("broker_username"):
    client.username_pw_set(CFG["broker_username"], CFG["broker_password"])
client.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)

def on_connect(c, *_):
    LOG("MQTT connected")
    c.subscribe(TOPIC_CMD)
    with buf_lock:
        for evt in offline_buf:
            c.publish(TOPIC_IN, json.dumps(evt))
        offline_buf.clear()

def on_message(_c, _u, msg):
    try:
        cmd = json.loads(msg.payload.decode())
    except Exception:
        return
    room = cmd.get("room", CFG["room"])
    name = cmd.get("command")
    if room not in ("", CFG["room"]):
        return
    LOG(f"command: {name}")
    if name in ("TEST_BUZZER", "TRIGGER_BUZZER"):
        buzz(int(cmd.get("seconds", 2)))
    elif name == "CAPTURE_BOARD":
        capture_board()
    elif name == "RESTART_CAMERA":
        threading.Thread(target=init_cameras, daemon=True).start()
    elif name == "SESSION_START":
        state["session"] = True
    elif name == "SESSION_END":
        state["session"] = False
    elif name == "CHANGE_THRESHOLDS":
        m = {"distanceThreshold": "distance_threshold_m", "noiseWarningDb": "noise_warning_db",
             "noiseAlarmDb": "noise_alarm_db", "noiseDurationSec": "noise_window_sec"}
        for k, v in m.items():
            if k in cmd:
                THR[v] = cmd[k]
        LOG(f"thresholds updated: {THR}")

client.on_connect = on_connect
client.on_message = on_message

def publish(evt: dict):
    evt.setdefault("room", CFG["room"])
    evt.setdefault("ts", int(time.time() * 1000))
    if client.is_connected():
        client.publish(TOPIC_IN, json.dumps(evt))
    else:
        with buf_lock:
            offline_buf.append(evt)
            del offline_buf[:-500]

# ================= GPIO BUZZER =================
if HAS_GPIO:
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(CFG["buzzer_gpio"], GPIO.OUT, initial=GPIO.LOW)

def buzz(seconds=2):
    if not HAS_GPIO:
        LOG(f"[buzzer] would buzz {seconds}s"); return
    GPIO.output(CFG["buzzer_gpio"], True)
    threading.Timer(seconds, lambda: GPIO.output(CFG["buzzer_gpio"], False)).start()

# ================= HEARTBEAT =================
def heartbeat_loop():
    while True:
        temp = 0
        try:
            t = psutil.sensors_temperatures()
            if t: temp = int(next(iter(t.values()))[0].current)
        except Exception:
            pass
        publish({"event": "HEARTBEAT", "device_id": CFG["device_id"], "type": "pi",
                 "cpuTemp": temp, "cpuUsage": int(psutil.cpu_percent()),
                 "ram": int(psutil.virtual_memory().percent),
                 "fw": "v3.2.0", "network": "wifi"})
        time.sleep(CFG["heartbeat_sec"])

# ================= BLE ATTENDANCE =================
def rssi_to_m(rssi):
    return 10 ** ((CFG["rssi_ref"] - rssi) / (10 * CFG["rssi_n"]))

def _handle_tag(tag, rssi):
    now = time.time(); today = datetime.now().strftime("%Y-%m-%d")
    info = ble_seen.setdefault(tag, {"last": 0, "out_since": None, "marked_date": ""})
    was_away = info["last"] and (now - info["last"]) > CFG["left_after_sec"]
    info["last"] = now
    dist = round(rssi_to_m(rssi), 2)
    if was_away and info["out_since"]:
        info["out_since"] = None
        publish({"event": "STUDENT_RETURNED", "tag_id": tag})
    if info["marked_date"] != today and dist <= THR["distance_threshold_m"]:
        info["marked_date"] = today
        publish({"event": "ATTENDANCE", "tag_id": tag, "distance": dist})
        LOG(f"attendance: {tag} @ {dist}m")

def _check_absences(live_tags):
    now = time.time()
    for tag, info in ble_seen.items():
        if tag not in live_tags and info.get("marked_date") and info.get("out_since") is None:
            if now - info["last"] > CFG["left_after_sec"]:
                info["out_since"] = now
                publish({"event": "STUDENT_LEFT", "tag_id": tag})
                LOG(f"left: {tag}")

async def _ble_scan():
    while True:
        try:
            devs = await bleak.BleakScanner.discover(timeout=4.0)
            live = set()
            for d in devs:
                name = d.name or ""
                if name.startswith(CFG["tag_prefix"]):
                    tag = name[len(CFG["tag_prefix"]):]
                    live.add(tag)
                    _handle_tag(tag, d.rssi)
            _check_absences(live)
        except Exception as e:
            LOG(f"BLE error: {e}"); time.sleep(5)

def ble_loop():
    if not HAS_BLE:
        LOG("bleak not installed — BLE attendance disabled"); return
    asyncio.run(_ble_scan())

# ================= NOISE MONITOR =================
def noise_loop():
    if not HAS_MIC:
        LOG("sounddevice/numpy missing — noise monitor disabled"); return
    sr = 16000
    peaks = []
    last_alarm = 0
    def cb(indata, *_):
        rms = float(np.sqrt(np.mean(indata.astype(np.float64) ** 2)))
        peaks.append(20 * math.log10(max(rms, 1e-10) / 20e-6))
    with sd.InputStream(samplerate=sr, channels=1, dtype="float32",
                        blocksize=sr // 2, callback=cb):
        while True:
            time.sleep(1)
            win = int(THR["noise_window_sec"] * 2)
            del peaks[:-win]
            if not peaks:
                continue
            level = int(max(peaks))
            if level >= THR["noise_alarm_db"] and time.time() - last_alarm > 60:
                last_alarm = time.time()
                publish({"event": "NOISE_ALARM", "level": level, "threshold": THR["noise_alarm_db"]})
            elif level >= THR["noise_warning_db"]:
                publish({"event": "NOISE_ALARM", "level": level, "threshold": THR["noise_warning_db"]})

# ================= CAMERAS =================
caps = {}
def init_cameras():
    global caps
    for c in caps.values():
        try: c.release()
        except Exception: pass
    caps = {}
    if not HAS_CV:
        LOG("opencv missing — cameras disabled"); return
    for role, idx in CFG["cameras"].items():
        try:
            cap = cv2.VideoCapture(int(idx))
            if cap.isOpened(): caps[role] = cap
        except Exception:
            pass
    LOG(f"cameras online: {list(caps)}")

def upload_image(jpeg: bytes):
    """Upload to Firebase Storage and return a NEVER-EXPIRING public URL (BUG #13).
    Retention is handled by a Firestore TTL on boardImages (90 days)."""
    global buckets
    fb = CFG.get("firebase", {})
    if not fb.get("storage_bucket"):
        return None
    try:
        if buckets is None:
            import firebase_admin
            from firebase_admin import credentials, storage
            firebase_admin.initialize_app(credentials.Certificate(
                os.path.join(HERE, fb["service_account"])), {"storageBucket": fb["storage_bucket"]})
            buckets = storage.bucket()
        blob = buckets.blob(f"boardImages/{CFG['room']}/{int(time.time()*1000)}.jpg")
        blob.upload_from_string(jpeg, content_type="image/jpeg")
        try:
            blob.make_public()
            return blob.public_url
        except Exception:
            # fallback: v4 signed URL with the keyword arg (firebase-admin v6+ API)
            return blob.generate_signed_url(version="v4", expiration=timedelta(days=7))
    except Exception as e:
        LOG(f"upload failed: {e}"); return None

def capture_board():
    cap = caps.get("cam-board")
    if not cap:
        return
    ok, frame = cap.read()
    if not ok:
        return
    jpeg_ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not jpeg_ok:
        return
    url = upload_image(buf.tobytes())
    if url:
        publish({"event": "BOARD_CAPTURE", "camera_id": "cam-board", "url": url})
        LOG("board capture uploaded")
    else:
        LOG("board capture: no storage configured (base64 would break Firestore 1MB limit)")

def camera_loop():
    """BOARD_CAPTURE every N min + motion-energy FIGHT flag during sessions.
    PRODUCTION: replace motion heuristic with TFLite MobileNet/YOLO-nano."""
    if not HAS_CV:
        return
    prev_gray = None; motion_streak = 0; last_fight = 0; last_board = 0
    while True:
        time.sleep(1)
        cap = caps.get("cam-students")
        if cap and state["session"]:
            ok, frame = cap.read()
            if ok:
                gray = cv2.cvtColor(cv2.resize(frame, (320, 240)), cv2.COLOR_BGR2GRAY)
                if prev_gray is not None:
                    energy = float(np.mean(cv2.absdiff(gray, prev_gray)))
                    motion_streak = motion_streak + 1 if energy > CFG["fight_motion_thresh"] else 0
                    if motion_streak >= 3 and time.time() - last_fight > 120:
                        last_fight = time.time(); motion_streak = 0
                        near = [t for t, i in ble_seen.items() if time.time() - i.get("last", 0) < 10]
                        publish({"event": "FIGHT", "involved_tags": near,
                                 "confidence": round(min(0.99, energy / 100), 2),
                                 "camera_id": "cam-students"})
                        LOG(f"FIGHT flagged energy={energy:.0f}")
                prev_gray = gray
        if time.time() - last_board > CFG["board_capture_min"] * 60:
            last_board = time.time()
            capture_board()

# ================= SPEECH-TO-TEXT (offline Vosk) =================
def stt_loop():
    st = CFG.get("stt", {})
    if not st.get("enabled"):
        return
    try:
        from vosk import Model, KaldiRecognizer
        import sounddevice as sd
        model = Model(st["model_path"])
        rec = KaldiRecognizer(model, 16000)
        def cb(indata, *_):
            if rec.AcceptWaveform(bytes(indata)):
                text = json.loads(rec.Result()).get("text", "")
                if len(text) > 12:
                    publish({"event": "SPEECH", "text": text[:400]})
        with sd.InputStream(samplerate=16000, channels=1, dtype="int16",
                            blocksize=8000, callback=cb):
            LOG("STT running")
            while True:
                time.sleep(1)
    except Exception as e:
        LOG(f"STT disabled: {e}")

# ================= WATCHDOG MAIN =================
THREADS = []
def spawn(fn):
    t = threading.Thread(target=fn, daemon=True); t.start(); THREADS.append((fn.__name__, t))

def main():
    client.connect(CFG["broker_host"], int(CFG.get("broker_port", 8883)), keepalive=60)
    client.loop_start()
    init_cameras()
    for fn in (heartbeat_loop, ble_loop, noise_loop, camera_loop, stt_loop):
        spawn(fn)
    while True:
        time.sleep(30)
        for i, (name, t) in enumerate(THREADS):
            if not t.is_alive():
                LOG(f"watchdog restarting {name}")
                fn = globals()[name]
                THREADS[i] = (name, threading.Thread(target=fn, daemon=True))
                THREADS[i][1].start()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
