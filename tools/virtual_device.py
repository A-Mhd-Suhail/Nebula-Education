#!/usr/bin/env python3
# pip install httpx   →   python tools/virtual_device.py
import asyncio, random
import httpx

GATEWAY = "http://127.0.0.1:8000"

async def main():
    async with httpx.AsyncClient(timeout=5) as c:
        while True:
            for etype, payload in [
                ("ble_ping", {"tag_id": "DEMO-TAG-1", "rssi": -60}),
                ("noise", {"db_level": round(random.uniform(40, 85), 1)}),
            ]:
                r = await c.post(f"{GATEWAY}/api/events", json={
                    "type": etype, "room_id": "room-101",
                    "device_id": "SIM-1", "payload": payload})
                print(etype, payload, "->", r.status_code)
            await asyncio.sleep(4)

asyncio.run(main())
