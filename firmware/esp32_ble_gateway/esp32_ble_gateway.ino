#include <WiFi.h>
#include <HTTPClient.h>
#include <BLEDevice.h>
#include <BLEScan.h>

const char* WIFI_SSID = "your-wifi";
const char* WIFI_PASS = "your-pass";
const char* GATEWAY   = "http://192.168.1.10:8000";   // your PC/server IP
const char* TOKEN     = "paste-device-token";          // from /api/devices
const char* ROOM      = "room-101";
const char* CODE      = "BLE-GW-001";

BLEScan* scan;

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  BLEDevice::init(CODE);
  scan = BLEDevice::getScan();
  scan->setActiveScan(true);
}

void postPing(const String& tag, int rssi) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(GATEWAY) + "/api/events");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", TOKEN);
  String body = String("{\"type\":\"ble_ping\",\"room_id\":\"") + ROOM +
                "\",\"device_id\":\"" + CODE +
                "\",\"event_id\":\"" + tag + "-" + millis() +
                "\",\"payload\":{\"tag_id\":\"" + tag + "\",\"rssi\":" + rssi + "}}";
  http.POST(body);
  http.end();
}

void loop() {
  BLEScanResults res = scan->start(2, false);
  for (int i = 0; i < res.getCount(); i++) {
    BLEAdvertisedDevice d = res.getDevice(i);
    postPing(String(d.getAddress().toString().c_str()), d.getRSSI());
  }
  scan->clearResults();
  delay(4000);
}
