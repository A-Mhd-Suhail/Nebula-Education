#!/usr/bin/env bash
# Pentagon Pi3 agent — one-shot setup (run on the Raspberry Pi 3)
set -e
echo "==> apt packages (camera stack, BLE, audio, OCR)"
sudo apt update
sudo apt install -y python3-venv python3-picamera2 bluetooth bluez pi-bluetooth \
                    alsa-utils tesseract-ocr libglib2.0-dev
sudo systemctl enable --now bluetooth || true

echo "==> venv (system-site-packages so apt picamera2/gpiozero stay visible)"
VENV="$HOME/pentagon-env"
[ -d "$VENV" ] || python3 -m venv --system-site-packages "$VENV"
source "$VENV/bin/activate"
pip install --upgrade pip
pip install websockets bleak Pillow pytesseract

echo "==> enabling CSI camera interface (idempotent)"
sudo raspi-config nonint do_camera 0 2>/dev/null || true

echo ""
echo "✅ Setup done. Next:"
echo "   1) python3 agent.py --test camera|ble|mic|buzzer|send"
echo "   2) edit config.json (gateway URLs, token, room_id)"
echo "   3) sudo systemctl enable --now pentagon-agent"
