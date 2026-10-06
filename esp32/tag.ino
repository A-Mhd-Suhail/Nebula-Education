#include <BLEDevice.h>
#include <BLEServer.h>
#include <esp_sleep.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

#define TAG_ID   "A1B2C3"      // <<< UNIQUE per student — link it in HM → System Config
#define ADV_MS   4000
#define SLEEP_S  15
#define BATT_PIN 34
#define STATUS_EVERY_MIN 60

RTC_DATA_ATTR uint32_t boots = 0;
RTC_DATA_ATTR uint32_t lastStatusBoot = 0;

const char* WIFI_SSID = "your-wifi";
const char* WIFI_PASS = "your-pass";
const char* MQTT_HOST = "xxxxx.s1.eu.hivemq.cloud";
const int   MQTT_PORT = 8883;
const char* MQTT_USER = "tag-user";
const char* MQTT_PASS = "your-password";
const char* SCHOOL_ID = "school_demo";

float readBattery() {
  analogReadResolution(12);
  uint32_t v = 0;
  for (int i = 0; i < 8; i++) v += analogRead(BATT_PIN);
  v /= 8;
  float volts = (v * 3.3f / 4095.0f) * 2.0f;
  float pct = (volts - 3.3f) / (4.2f - 3.3f) * 100.0f;
  return constrain(pct, 0, 100);
}

void publishStatus() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) delay(300);
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure tls; tls.setInsecure();
  PubSubClient mqtt(tls);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  if (!mqtt.connect("tag-" TAG_ID, MQTT_USER, MQTT_PASS)) { WiFi.disconnect(true); return; }
  String topic = String("nebula/school_") + SCHOOL_ID + "/events";
  String payload = String("{\"event\":\"TAG_STATUS\",\"tag_id\":\"" TAG_ID "\",\"battery\":") + readBattery() + "}";
  mqtt.publish(topic.c_str(), payload.c_str());
  delay(100); mqtt.disconnect(); WiFi.disconnect(true);
}

void setup() {
  boots++;
  BLEDevice::init("NEB-" TAG_ID);
  BLEDevice::createServer();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->setMinPreferred(0x06);
  BLEDevice::startAdvertising();
  delay(ADV_MS);
  if (boots - lastStatusBoot >= (STATUS_EVERY_MIN * 60) / SLEEP_S) {
    publishStatus();
    lastStatusBoot = boots;
  }
  esp_deep_sleep((uint64_t)SLEEP_S * 1000000ULL);
}
void loop() {}
