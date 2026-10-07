#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
The Pentagon Inc — Raspberry Pi 3 Classroom Agent
=================================================
Feeds the 8 classroom features from Pi hardware to the gateway:

  1/2/6  Student attendance · teacher timing · activity  → BLE pings (bleak / bluepy)
  3      Incident detection                              → camera sustained-motion heuristic
                                                           (pluggable hook — swap estimate with a
                                                            trained model later, payload unchanged)
  7      Noise detection                                 → arecord/pyaudio dB stream + local GPIO buzzer
  8      Board writing capture                           → board-change detection + JPEG + OCR

Transport: WebSocket → automatic HTTP fallback (post + command polling). Never crashes on a
missing camera/mic/BLE stack — that feature logs and the rest keeps running.

Run:        sudo python3 agent.py --config config.json
Self-test:  python3 agent.py --test camera|ble|mic|buzzer|send
Autostart:  pentagon-agent.service (systemd)
"""
from __future__ import annotations

import argparse
import array
import asyncio
import base64
import io
import json
import logging
import math
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
from collections import deque
from typing import Any, Callable, Dict, List, Optional, Tuple

log = logging.getLogger("pentagon")

# ----------------------------------------------------------------- config
DEFAULTS: Dict[str, Any] = {
    "gateway_ws": "", "gateway_http": "", "device_code": "PI3-001",
    "room_id": "Class 10-A", "http_fallback_after": 4, "heartbeat_sec": 20,
    "token": "",
    "ble": {"enabled": True, "scan_sec": 3.0, "gap_sec": 12, "min_rssi": -95, "whitelist": []},
    "camera": {
        "enabled": True, "provider": "auto", "usb_video": "/dev/video0",
        "probe": {"width": 320, "height": 240, "interval_sec": 2.5},
        "full": {"width": 1024, "height": 768, "quality": 85},
        "board": {"min_change": 0.02, "diff_threshold": 25, "stable_sec": 3.0,
                  "cooldown_sec": 20, "ocr": True},
        "incident": {"enabled": True, "motion_threshold": 0.16,
                     "sustain_sec": 2.0, "cooldown_sec": 45},
    },
    "noise": {"enabled": True, "interval_sec": 4.0, "gain_db": 100.0, "warn_db": 60,
              "high_db": 75, "buzzer_min_sec": 5, "buzzer_sec": 3,
              "device": "default", "rate": 8000},
    "buzzer": {"enabled": True, "pin": 17, "active_high": True},
}

def _merge(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(base)
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out

def load_config(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        user = json.load(f)
    cfg = _merge(DEFAULTS, user)
    # token may also be embedded in gateway_ws (?token=...) — nothing to do here
    return cfg

# ----------------------------------------------------------------- image helpers
def prep_gray(jpeg: bytes, size: Tuple[int, int]):
    from PIL import Image, ImageFilter
    img = Image.open(io.BytesIO(jpeg)).convert("L")
    if img.size != size:
        img = img.resize(size)
    return img.filter(ImageFilter.GaussianBlur(2))

def motion_ratio(cur, base, thr: int) -> float:
    if cur is None or base is None or cur.size != base.size:
        return 0.0
    from PIL import ImageChops
    hist = ImageChops.difference(cur, base).histogram()
    total = sum(hist) or 1
    return sum(hist[thr + 1:]) / total

def shrink_jpeg(jpeg: bytes, quality: int, max_b64: int = 1_100_000) -> bytes:
    if len(base64.b64encode(jpeg)) <= max_b64:
        return jpeg
    from PIL import Image
    img = Image.open(io.BytesIO(jpeg))
    img.thumbnail((800, 800))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=max(60, quality - 20))
    return buf.getvalue()

def run_ocr(jpeg: bytes) -> str:
    import pytesseract
    from PIL import Image, ImageOps
    img = ImageOps.autocontrast(Image.open(io.BytesIO(jpeg)).convert("L"))
    return pytesseract.image_to_string(img, config="--psm 6")

# ----------------------------------------------------------------- camera providers
class CameraBase:
    name = "camera"
    def capture(self, width: int, height: int) -> Optional[bytes]:
        raise NotImplementedError
    def stop(self) -> None:
        pass

class Picam2Camera(CameraBase):
    """CSI camera via the official picamera2 stack (Bullseye/Bookworm, apt-installed)."""
    name = "picamera2"
    def __init__(self, width: int, height: int):
        from picamera2 import Picamera2
        import threading
        self.lock = threading.Lock()
        self.cam = Picamera2()
        self.size = (width, height)
        self.cam.configure(self.cam.create_still_configuration(main={"size": self.size}))
        self.cam.start()
        time.sleep(0.4)

    def capture(self, width: int, height: int) -> Optional[bytes]:
        with self.lock:
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            path = tmp.name
            tmp.close()
            try:
                if (width, height) != self.size:
                    self.cam.stop()
                    self.cam.configure(self.cam.create_still_configuration(
                        main={"size": (width, height)}))
                    self.cam.start()
                    self.size = (width, height)
                self.cam.capture_file(path)
                with open(path, "rb") as f:
                    return f.read()
            finally:
                try:
                    os.unlink(path)
                except OSError:
                    pass

    def stop(self) -> None:
        try:
            self.cam.stop()
        except Exception:
            pass

class StillCmdCamera(CameraBase):
    """Zero-dependency fallback: shells out to the official capture tools."""
    name = "still-command"
    def __init__(self, usb_video: str):
        self.dev = usb_video
        self.tool: Optional[str] = None
        for t in ("rpicam-still", "libcamera-still", "raspistill", "fswebcam"):
            if shutil.which(t):
                self.tool = t
                break
        if not self.tool:
            raise RuntimeError("no still-capture tool found")

    def capture(self, width: int, height: int) -> Optional[bytes]:
        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        path = tmp.name
        tmp.close()
        try:
            t = self.tool
            if t == "fswebcam":
                cmd = ["fswebcam", "-q", "--no-banner", "-d", self.dev,
                       "-r", f"{width}x{height}", path]
            elif t == "raspistill":
                cmd = ["raspistill", "-n", "-t", "300", "-q", "85",
                       "-w", str(width), "-h", str(height), "-o", path]
            else:  # rpicam-still / libcamera-still share flags
                cmd = [t, "-n", "--timeout", "300",
                       "--width", str(width), "--height", str(height), "-o", path]
            subprocess.run(cmd, timeout=10, capture_output=True)
            if not os.path.exists(path) or os.path.getsize(path) < 512:
                return None
            with open(path, "rb") as f:
                return f.read()
        except Exception:
            return None
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

class OpenCVCamera(CameraBase):
    """USB webcam via OpenCV."""
    name = "opencv-usb"
    def __init__(self, index: int = 0, width: int = 1024, height: int = 768):
        import threading
        import cv2  # type: ignore
        self.cv2 = cv2
        self.lock = threading.Lock()
        self.cap = cv2.VideoCapture(index)
        if not self.cap.isOpened():
            raise RuntimeError("VideoCapture(0) failed")
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.cap.read()  # warm-up

    def capture(self, width: int, height: int) -> Optional[bytes]:
        with self.lock:
            ok, frame = self.cap.read()
            if not ok:
                return None
            ok, enc = self.cv2.imencode(".jpg", frame,
                                        [self.cv2.IMWRITE_JPEG_QUALITY, 85])
            return enc.tobytes() if ok else None

    def stop(self) -> None:
        try:
            self.cap.release()
        except Exception:
            pass

def build_camera(cfg: Dict[str, Any]) -> Optional[CameraBase]:
    cc = cfg["camera"]
    if not cc["enabled"]:
        return None
    fw, fh = cc["full"]["width"], cc["full"]["height"]
    order = {
        "auto":     ["picamera2", "still", "opencv"],
        "picamera2": ["picamera2"],
        "still":    ["still"],
        "opencv":   ["opencv"],
    }.get(str(cc["provider"]).lower(), ["picamera2", "still", "opencv"])
    for p in order:
        try:
            if p == "picamera2":
                return Picam2Camera(fw, fh)
            if p == "still":
                return StillCmdCamera(cc["usb_video"])
            if p == "opencv":
                return OpenCVCamera(0, fw, fh)
        except Exception as e:
            log.info("camera provider %s unavailable: %s", p, e)
    return None

# ----------------------------------------------------------------- BLE providers
class BleProviderBase:
    name = "ble"
    async def scan_once(self, seconds: float) -> Dict[str, int]:
        raise NotImplementedError

class BleakProvider(BleProviderBase):
    name = "bleak"
    def __init__(self):
        from bleak import BleakScanner  # noqa: F401
        self._cls = BleakScanner

    async def scan_once(self, seconds: float) -> Dict[str, int]:
        found: Dict[str, int] = {}

        def cb(device, adv) -> None:
            mac = (getattr(device, "address", "") or "").upper()
            if mac:
                try:
                    found[mac] = int(getattr(adv, "rssi", -127))
                except Exception:
                    found[mac] = -127

        try:
            scanner = self._cls(detection_callback=cb)
        except TypeError:                     # very old bleak kwarg
            scanner = self._cls(callback=cb)
        await scanner.start()
        await asyncio.sleep(seconds)
        try:
            await scanner.stop()
        except Exception:
            pass
        return found

class BluepyProvider(BleProviderBase):
    name = "bluepy"
    def __init__(self):
        import bluepy.btle  # noqa: F401

    async def scan_once(self, seconds: float) -> Dict[str, int]:
        def sync() -> Dict[str, int]:
            from bluepy.btle import Scanner
            out: Dict[str, int] = {}
            try:
                for d in Scanner().scan(float(seconds)):
                    out[d.addr.upper()] = int(d.rssi)
            except Exception:
                pass
            return out
        return await asyncio.to_thread(sync)

def build_ble(cfg: Dict[str, Any]) -> Optional[BleProviderBase]:
    if not cfg["ble"]["enabled"]:
        return None
    try:
        return BleakProvider()
    except Exception as e:
        log.info("bleak unavailable (%s) — trying bluepy", e)
    try:
        return BluepyProvider()
    except Exception as e:
        log.warning("BLE disabled: no provider (%s). Install: pip install bleak", e)
    return None

# ----------------------------------------------------------------- microphone
class MicBase:
    name = "mic"
    def read_rms(self, seconds: float) -> Optional[float]:
        raise NotImplementedError
    def stop(self) -> None:
        pass

class ArecordMic(MicBase):
    name = "arecord"
    def __init__(self, device: str, rate: int):
        self.device = device
        self.rate = rate
        self.proc: Optional[subprocess.Popen] = None

    def _ensure(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            return
        self.proc = subprocess.Popen(
            ["arecord", "-D", self.device, "-f", "S16_LE", "-r", str(self.rate),
             "-c", "1", "-t", "raw", "-q"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def read_rms(self, seconds: float) -> Optional[float]:
        try:
            self._ensure()
            assert self.proc is not None and self.proc.stdout is not None
            need = max(3200, int(self.rate * seconds)) * 2
            buf = b""
            while len(buf) < need:
                chunk = self.proc.stdout.read(need - len(buf))
                if not chunk:
                    self._kill()
                    return None
                buf += chunk
            s = array.array("h")
            s.frombytes(buf[:(len(buf) // 2) * 2])
            if not len(s):
                return None
            acc = 0
            for v in s:
                acc += v * v
            return math.sqrt(acc / len(s)) / 32768.0
        except Exception:
            self._kill()
            return None

    def _kill(self) -> None:
        if self.proc is not None:
            try:
                self.proc.kill()
            except Exception:
                pass
            self.proc = None

    def stop(self) -> None:
        self._kill()

class PyAudioMic(MicBase):
    name = "pyaudio"
    def __init__(self, rate: int):
        import pyaudio  # type: ignore
        self.rate = rate
        self.pa = pyaudio.PyAudio()
        self.stream = self.pa.open(format=pyaudio.paInt16, channels=1, rate=rate,
                                   input=True, frames_per_buffer=rate // 2)

    def read_rms(self, seconds: float) -> Optional[float]:
        try:
            n = int(self.rate * seconds)
            buf = b""
            while len(buf) < n * 2:
                buf += self.stream.read(self.rate // 2, exception_on_overflow=False)
            s = array.array("h")
            s.frombytes(buf[:(len(buf) // 2) * 2])
            if not len(s):
                return None
            acc = sum(v * v for v in s)
            return math.sqrt(acc / len(s)) / 32768.0
        except Exception:
            return None

    def stop(self) -> None:
        try:
            self.stream.stop_stream()
            self.stream.close()
            self.pa.terminate()
        except Exception:
            pass

def build_mic(cfg: Dict[str, Any]) -> Optional[MicBase]:
    nz = cfg["noise"]
    if not nz["enabled"]:
        return None
    if shutil.which("arecord"):
        return ArecordMic(nz["device"], int(nz["rate"]))
    try:
        return PyAudioMic(int(nz["rate"]))
    except Exception as e:
        log.warning("microphone disabled: arecord missing and pyaudio failed (%s)", e)
    return None

# ----------------------------------------------------------------- buzzer (GPIO)
class BuzzerCtl:
    def __init__(self, pin: int, active_high: bool):
        self.pin = pin
        self.high = 1 if active_high else 0
        self.low = 1 - self.high
        self.impl = "gpiozero"
        try:
            from gpiozero import Buzzer  # type: ignore
            self.z = Buzzer(pin, active_high=active_high)
            return
        except Exception as e:
            log.info("gpiozero buzzer unavailable (%s) — trying RPi.GPIO", e)
        import RPi.GPIO as GPIO  # type: ignore
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(pin, GPIO.OUT, initial=self.low)
        self.impl = "RPi.GPIO"
        self._gpio = GPIO

    def on(self) -> None:
        if self.impl == "gpiozero":
            self.z.on()
        else:
            self._gpio.output(self.pin, self.high)

    def off(self) -> None:
        if self.impl == "gpiozero":
            self.z.off()
        else:
            self._gpio.output(self.pin, self.low)

def build_buzzer(cfg: Dict[str, Any]) -> Optional[BuzzerCtl]:
    b = cfg["buzzer"]
    if not b["enabled"] or int(b["pin"]) < 0:
        return None
    try:
        return BuzzerCtl(int(b["pin"]), bool(b["active_high"]))
    except Exception as e:
        log.warning("buzzer disabled (%s) — run as root and check pin %s", e, b["pin"])
        return None

# ----------------------------------------------------------------- transport helpers
def http_send_event(http_url: str, token: str, ev: Dict[str, Any]) -> None:
    req = urllib.request.Request(
        http_url.rstrip("/") + "/api/events",
        data=json.dumps(ev).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Device-Token": token},
        method="POST")
    with urllib.request.urlopen(req, timeout=6) as r:
        if r.status != 200:
            raise RuntimeError(f"gateway HTTP {r.status}")

def http_poll_commands(http_url: str, token: str, code: str) -> List[dict]:
    req = urllib.request.Request(
        f'{http_url.rstrip("/")}/api/device/{code}/poll',
        headers={"X-Device-Token": token})
    with urllib.request.urlopen(req, timeout=6) as r:
        data = json.loads((r.read() or b"{}").decode("utf-8"))
    return list(data.get("commands") or [])

# ----------------------------------------------------------------- the agent
try:
    from websockets.asyncio.client import connect as ws_connect   # websockets ≥ 13
except Exception:                                                  # pragma: no cover
    from websockets import connect as ws_connect                   # legacy

class Agent:
    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg
        self.out: asyncio.Queue = asyncio.Queue(maxsize=600)
        self.ws = None
        self.mode = "ws"
        self.ws_url: str = cfg["gateway_ws"]
        self.http_url: str = cfg["gateway_http"]
        self.force_board = asyncio.Event()
        self.buzz_lock = asyncio.Lock()
        self.buzzer: Optional[BuzzerCtl] = build_buzzer(cfg)
        self.mic: Optional[MicBase] = None
        self.camera: Optional[CameraBase] = None

    # ---------------- outbound events ----------------
    async def emit(self, etype: str, payload: Dict[str, Any], eid: Optional[str] = None) -> None:
        ev = {
            "type": etype,
            "room_id": self.cfg["room_id"],
            "device_id": self.cfg["device_code"],
            "payload": payload,
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "event_id": eid or f'{self.cfg["device_code"]}-{etype}-{uuid.uuid4().hex[:12]}',
        }
        try:
            self.out.put_nowait(ev)
        except asyncio.QueueFull:
            try:
                self.out.get_nowait()
                self.out.put_nowait(ev)
            except Exception:
                pass

    async def sender(self) -> None:
        while True:
            ev = await self.out.get()
            while True:
                try:
                    if self.mode == "ws" and self.ws is not None:
                        await asyncio.wait_for(self.ws.send(json.dumps(ev)), timeout=10)
                    else:
                        await asyncio.to_thread(http_send_event, self.http_url,
                                                self.cfg.get("token", ""), ev)
                    break
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    log.debug("send retry (%s)", e)
                    await asyncio.sleep(2)

    # ---------------- websocket supervisor (commands in) ----------------
    async def ws_supervisor(self) -> None:
        backoff = 1.0
        while True:
            if not self.ws_url:
                await asyncio.sleep(10)
                continue
            try:
                ws = await ws_connect(self.ws_url, ping_interval=20,
                                      ping_timeout=20, open_timeout=8)
            except asyncio.CancelledError:
                raise
            except Exception:
                self.ws = None
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
                self.mode = "http" if self.http_url else "ws"
                continue
            backoff = 1.0
            self.ws = ws
            self.mode = "ws"
            log.info("WebSocket connected → gateway")
            try:
                async for raw in ws:
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue
                    if data.get("type") == "command":
                        self.handle_command(str(data.get("command", "")),
                                            data.get("args") or {})
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.debug("ws closed: %s", e)
            finally:
                if self.ws is ws:
                    self.ws = None
                try:
                    await ws.close()
                except Exception:
                    pass
                self.mode = "http" if self.http_url else "ws"

    async def command_poller(self) -> None:
        """HTTP-mode fallback: fetch commands queued at the gateway."""
        if not self.http_url:
            return
        while True:
            try:
                if self.mode != "ws":
                    cmds = await asyncio.to_thread(http_poll_commands, self.http_url,
                                                   self.cfg.get("token", ""),
                                                   self.cfg["device_code"])
                    for c in cmds:
                        self.handle_command(str(c.get("command", "")),
                                            c.get("args") or {})
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.debug("poll: %s", e)
            await asyncio.sleep(3)

    # ---------------- commands (software → hardware) ----------------
    def handle_command(self, cmd: str, args: Dict[str, Any]) -> None:
        log.info("command: %s %s", cmd, args)
        loop = asyncio.get_running_loop()
        if cmd == "buzzer_on":
            loop.create_task(self.beep(float(args.get("duration", 3))))
        elif cmd == "buzzer_off":
            if self.buzzer is not None:
                loop.create_task(asyncio.to_thread(self.buzzer.off))
        elif cmd == "capture_board":
            self.force_board.set()
        elif cmd == "ping":
            pass
        else:
            log.debug("unknown command: %s", cmd)

    async def beep(self, seconds: float) -> None:
        if self.buzzer is None:
            return
        async with self.buzz_lock:
            try:
                await asyncio.to_thread(self.buzzer.on)
                await asyncio.sleep(max(0.2, seconds))
                await asyncio.to_thread(self.buzzer.off)
            except Exception as e:
                log.debug("buzzer: %s", e)

    # ---------------- feature 1/2/6 · BLE presence ----------------
    async def ble_loop(self) -> None:
        provider = build_ble(self.cfg)
        if provider is None:
            return
        bl = self.cfg["ble"]
        whitelist = {m.upper() for m in (bl.get("whitelist") or [])}
        last: Dict[str, float] = {}
        log.info("BLE: scanning %.1fs rounds via %s", bl["scan_sec"], provider.name)
        while True:
            try:
                found = await provider.scan_once(float(bl["scan_sec"]))
                now = time.time()
                for mac, rssi in found.items():
                    if rssi < int(bl["min_rssi"]):
                        continue
                    if whitelist and mac not in whitelist:
                        continue
                    if now - last.get(mac, 0.0) < float(bl["gap_sec"]):
                        continue
                    last[mac] = now
                    eid = (f'{self.cfg["device_code"]}-ble-'
                           f'{mac.replace(":", "")}-{int(now // max(1.0, bl["gap_sec"]))}')
                    await self.emit("ble_ping", {"tag_id": mac, "rssi": rssi}, eid=eid)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.warning("ble scan error: %s", e)
                await asyncio.sleep(5)

    # ---------------- features 3 & 8 · camera ----------------
    async def emit_board(self, jpeg: bytes, quality: int) -> None:
        ocr = ""
        if self.cfg["camera"]["board"]["ocr"]:
            try:
                ocr = (await asyncio.to_thread(run_ocr, jpeg)).strip()[:1500]
            except Exception as e:
                log.debug("ocr unavailable: %s", e)
        b64 = base64.b64encode(shrink_jpeg(jpeg, quality)).decode("ascii")
        await self.emit("board_change", {"image_b64": b64, "ocr_text": ocr})
        log.info("board capture sent (ocr %d chars, %d KB)", len(ocr), len(b64) // 1024)

    async def camera_loop(self) -> None:
        self.camera = build_camera(self.cfg)
        if self.camera is None:
            log.warning("camera: no provider — board capture & incident disabled")
            return
        log.info("camera: using %s", self.camera.name)
        cc = self.cfg["camera"]
        pb, fl, bd, inc = cc["probe"], cc["full"], cc["board"], cc["incident"]
        psize = (int(pb["width"]), int(pb["height"]))
        base = None
        changing = False
        last_active = 0.0
        last_board = 0.0
        motion_since: Optional[float] = None
        last_incident = 0.0
        while True:
            t0 = time.time()
            try:
                jpeg = await asyncio.to_thread(self.camera.capture,
                                               int(pb["width"]), int(pb["height"]))
                cur = prep_gray(jpeg, psize) if jpeg else None
            except Exception as e:
                log.debug("camera capture failed: %s", e)
                cur = None
            if cur is None:
                await asyncio.sleep(3)
                continue
            now = time.time()
            if base is None or base.size != cur.size:
                base = cur
            ratio = motion_ratio(cur, base, int(bd["diff_threshold"]))

            # ---- feature 8: board writing capture (change → stable → shoot) ----
            if ratio >= float(bd["min_change"]):
                changing = True
                last_active = now
            elif changing and (now - last_active) >= float(bd["stable_sec"]):
                changing = False
                if (now - last_board) >= float(bd["cooldown_sec"]):
                    last_board = now
                    full = await asyncio.to_thread(self.camera.capture,
                                                   int(fl["width"]), int(fl["height"]))
                    if full:
                        asyncio.create_task(self.emit_board(full, int(fl["quality"])))

            if self.force_board.is_set():
                self.force_board.clear()
                last_board = now
                full = await asyncio.to_thread(self.camera.capture,
                                               int(fl["width"]), int(fl["height"]))
                if full:
                    asyncio.create_task(self.emit_board(full, int(fl["quality"])))

            if not changing and (now - last_active) >= float(bd["stable_sec"]):
                base = cur  # re-baseline once the scene is still again

            # ---- feature 3: incident heuristic (suppress while teacher writes) ----
            if bool(inc["enabled"]) and not changing:
                if ratio >= float(inc["motion_threshold"]):
                    if motion_since is None:
                        motion_since = now
                    elif ((now - motion_since) >= float(inc["sustain_sec"])
                          and (now - last_incident) >= float(inc["cooldown_sec"])):
                        last_incident = now
                        motion_since = None
                        conf = round(min(0.95, 0.55 + ratio * 1.2), 2)
                        await self.emit("camera_event", {
                            "event_type": "sudden_motion",
                            "confidence": conf,
                            "duration_sec": int(inc["sustain_sec"]),
                        })
                        log.info("incident candidate: ratio=%.2f conf=%.2f", ratio, conf)
                else:
                    motion_since = None

            await asyncio.sleep(max(0.2, float(pb["interval_sec"]) - (time.time() - t0)))

    # ---------------- feature 7 · noise + local buzzer ----------------
    async def noise_loop(self) -> None:
        self.mic = build_mic(self.cfg)
        if self.mic is None:
            return
        nz = self.cfg["noise"]
        win: deque = deque()
        last_buzz = 0.0
        log.info("noise: streaming via %s (%.1fs cadence)", self.mic.name,
                 float(nz["interval_sec"]))
        while True:
            t0 = time.time()
            rms = await asyncio.to_thread(self.mic.read_rms, float(nz["interval_sec"]))
            if rms is None:
                await asyncio.sleep(2)
                continue
            db = round(min(120.0, max(25.0, float(nz["gain_db"])
                                     + 20.0 * math.log10(max(rms, 1e-6)))), 1)
            await self.emit("noise", {"db_level": db})
            now = time.time()
            win.append((now, db))
            while win and (now - win[0][0]) > 120:
                win.popleft()
            over = [t for t, v in win if v >= float(nz["warn_db"])]
            if (over and (now - over[0]) >= float(nz["buzzer_min_sec"])
                    and db >= float(nz["high_db"]) and (now - last_buzz) >= 20.0):
                last_buzz = now
                log.info("local buzzer: sustained %.0f dB", max(v for _, v in win))
                await self.beep(float(nz["buzzer_sec"]))
            await asyncio.sleep(max(0.2, float(nz["interval_sec"]) - (time.time() - t0)))

    # ---------------- heartbeat (device health) ----------------
    async def heartbeat_loop(self) -> None:
        start = time.time()
        while True:
            temp = None
            try:
                with open("/sys/class/thermal/thermal_zone0/temp") as f:
                    temp = round(int(f.read().strip()) / 1000, 1)
            except Exception:
                pass
            await self.emit("heartbeat", {"uptime_s": int(time.time() - start),
                                          "cpu_temp": temp})
            await asyncio.sleep(float(self.cfg["heartbeat_sec"]))

    # ---------------- lifecycle ----------------
    async def run(self) -> None:
        log.info("Pentagon agent starting · device=%s room=%s",
                 self.cfg["device_code"], self.cfg["room_id"])
        loop = asyncio.get_running_loop()
        stop = loop.create_future()
        for s in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(s, stop.set_result, None)
            except NotImplementedError:
                pass
        tasks = [asyncio.create_task(c()) for c in (
            self.sender, self.ws_supervisor, self.command_poller,
            self.heartbeat_loop, self.ble_loop, self.camera_loop, self.noise_loop)]
        await stop
        log.info("shutting down…")
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.shutdown()

    async def shutdown(self) -> None:
        if self.buzzer is not None:
            try:
                await asyncio.to_thread(self.buzzer.off)
            except Exception:
                pass
        if self.mic is not None:
            self.mic.stop()
        if self.camera is not None:
            self.camera.stop()
        if self.ws is not None:
            try:
                await self.ws.close()
            except Exception:
                pass
        log.info("bye 👋")

# ----------------------------------------------------------------- self-tests
def _test(cfg: Dict[str, Any], which: str) -> None:
    if which == "camera":
        cam = build_camera(cfg)
        if cam is None:
            print("❌ no camera provider"); return
        small = cam.capture(cfg["camera"]["probe"]["width"], cfg["camera"]["probe"]["height"])
        full = cam.capture(cfg["camera"]["full"]["width"], cfg["camera"]["full"]["height"])
        if full:
            with open("/tmp/pentagon-camera-test.jpg", "wb") as f:
                f.write(full)
            print(f"✅ {cam.name}: probe={len(small or b'')//1024}KB "
                  f"full={len(full)//1024}KB → /tmp/pentagon-camera-test.jpg")
        else:
            print("❌ capture failed")
    elif which == "ble":
        prov = build_ble(cfg)
        if prov is None:
            print("❌ no BLE provider"); return
        found = asyncio.run(prov.scan_once(4.0))
        print(f"✅ {prov.name}: {len(found)} devices")
        for mac, rssi in sorted(found.items(), key=lambda x: -x[1])[:10]:
            print(f"   {mac}  {rssi} dB")
    elif which == "mic":
        mic = build_mic(cfg)
        if mic is None:
            print("❌ no mic provider"); return
        for i in range(3):
            rms = mic.read_rms(float(cfg["noise"]["interval_sec"]))
            db = (cfg["noise"]["gain_db"] + 20 * math.log10(max(rms or 1e-6, 1e-6))) if rms else 0
            print(f"✅ {mic.name} #{i+1}: {db:.1f} dB")
            time.sleep(0.3)
    elif which == "buzzer":
        b = build_buzzer(cfg)
        if b is None:
            print("❌ buzzer unavailable (run with sudo?)"); return
        print(f"✅ beeping on GPIO {cfg['buzzer']['pin']} ({b.impl})…")
        b.on(); time.sleep(1.0); b.off()
    elif which == "send":
        ev = {"type": "heartbeat", "room_id": cfg["room_id"],
              "device_id": cfg["device_code"], "payload": {"test": True},
              "event_id": f'test-{uuid.uuid4().hex[:8]}'}
        try:
            http_send_event(cfg["gateway_http"], cfg.get("token", ""), ev)
            print("✅ gateway accepted test event (HTTP)")
        except Exception as e:
            print(f"❌ gateway send failed: {e}")

def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Pentagon Pi3 classroom agent")
    ap.add_argument("--config", default=os.path.join(here, "config.json"))
    ap.add_argument("--test", choices=["camera", "ble", "mic", "buzzer", "send"])
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(message)s")
    cfg = load_config(args.config)
    if args.test:
        _test(cfg, args.test)
        return
    agent = Agent(cfg)
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
