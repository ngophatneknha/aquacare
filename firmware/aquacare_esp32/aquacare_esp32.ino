// AQUA CARE - firmware ESP32 (Arduino IDE)
// Thư viện cần cài: OneWire, DallasTemperature, ArduinoJson (v7)
// Cảm biến: pH analog (vd DFRobot SEN0161), DS18B20, TDS analog (Gravity), độ đục analog (SEN0189), lưu lượng YF-S201.
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ---- Cấu hình ----
const char* WIFI_SSID = "TEN_WIFI";
const char* WIFI_PASS = "MAT_KHAU_WIFI";
const char* SERVER_URL = "http://192.168.1.10:8000/api/readings";
const char* DEVICE_ID = "KCN-01";
const char* DEVICE_KEY = "khoa-thiet-bi";   // lấy khi đăng ký thiết bị qua /api/devices
const uint32_t SEND_EVERY_MS = 30000;

// Chân (ADC1 để dùng chung được với WiFi)
const int PIN_PH = 34, PIN_TDS = 35, PIN_TURB = 32, PIN_TEMP = 4, PIN_FLOW = 27;

// Hiệu chuẩn: BẮT BUỘC đo lại với dung dịch chuẩn pH 4.0 / 7.0 và dung dịch TDS chuẩn cho từng cảm biến.
float PH_SLOPE = -5.70, PH_OFFSET = 21.34;   // pH = slope * V + offset
float TDS_K = 1.0;                             // hệ số K của đầu dò TDS
const float FLOW_PULSE_PER_L = 450.0;          // YF-S201: ~450 xung/lít

OneWire oneWire(PIN_TEMP);
DallasTemperature tempSensor(&oneWire);
volatile uint32_t flowPulses = 0;
void IRAM_ATTR onFlowPulse() { flowPulses++; }

float readVolt(int pin) {
  // lấy trung bình 30 mẫu để giảm nhiễu
  uint32_t sum = 0;
  for (int i = 0; i < 30; i++) { sum += analogReadMilliVolts(pin); delay(5); }
  return sum / 30.0 / 1000.0;
}

float tdsFromVolt(float v, float tempC) {
  float comp = v / (1.0 + 0.02 * (tempC - 25.0));  // bù nhiệt độ về 25°C
  return (133.42 * comp * comp * comp - 255.86 * comp * comp + 857.39 * comp) * 0.5 * TDS_K;
}

float turbidityFromVolt(float v) {
  // đường cong SEN0189 (cấp nguồn 5V qua chia áp về 3.3V thì phải quy đổi lại v)
  float ntu = -1120.4 * v * v + 5742.3 * v - 4352.9;
  return ntu < 0 ? 0 : ntu;
}

void setup() {
  Serial.begin(115200);
  analogSetAttenuation(ADC_11db);
  tempSensor.begin();
  pinMode(PIN_FLOW, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW), onFlowPulse, FALLING);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void loop() {
  static uint32_t lastSend = 0;
  if (millis() - lastSend < SEND_EVERY_MS) return;
  uint32_t elapsed = millis() - lastSend;
  lastSend = millis();

  tempSensor.requestTemperatures();
  float temp = tempSensor.getTempCByIndex(0);
  noInterrupts(); uint32_t pulses = flowPulses; flowPulses = 0; interrupts();

  JsonDocument doc;
  doc["device"] = DEVICE_ID;
  doc["ph"] = PH_SLOPE * readVolt(PIN_PH) + PH_OFFSET;
  if (temp != DEVICE_DISCONNECTED_C) doc["temp"] = temp;   // cảm biến rời thì không gửi số rác
  doc["tds"] = tdsFromVolt(readVolt(PIN_TDS), temp == DEVICE_DISCONNECTED_C ? 25.0 : temp);
  doc["turbidity"] = turbidityFromVolt(readVolt(PIN_TURB));
  doc["flow"] = pulses / FLOW_PULSE_PER_L / (elapsed / 60000.0);  // lít/phút
  String body; serializeJson(doc, body);
  Serial.println(body);

  if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); return; }
  // shortcut: mất mạng thì bỏ mẫu này; muốn không mất dữ liệu cần thêm bộ đệm SPIFFS/SD.
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.POST(body);
  Serial.printf("HTTP %d %s\n", code, http.getString().c_str());
  http.end();
}
