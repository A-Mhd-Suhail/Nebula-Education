#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "your-wifi";
const char* WIFI_PASS = "your-pass";
const char* GATEWAY   = "http://192.168.1.10:8000";
const char* TOKEN     = "paste-device-token";
const char* ROOM      = "room-101";
const char* CODE      = "MIC-001";
const int   MIC_PIN   = 34;
const float DB_FLOOR  = 35.0;

float readDb() {
  const int N = 500; long acc = 0;
  for (int i = 0; i < N; i++) {
    int v = analogRead(MIC_PIN) - 2048;
    acc += (long)v * v;
    delayMicroseconds(100);
  }
  float rms = sqrtf((float)acc / N);
  return DB_FLOOR + 20.0f * log10f(max(rms, 1.0f));
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    float db = readDb();
    HTTPClient http;
    http.begin(String(GATEWAY) + "/api/events");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", TOKEN);
    String body = String("{\"type\":\"noise\",\"room_id\":\"") + ROOM +
                  "\",\"device_id\":\"" + CODE +
                  "\",\"payload\":{\"db_level\":" + String(db, 1) + "}}";
    http.POST(body);
    http.end();
  }
  delay(4000);
}
