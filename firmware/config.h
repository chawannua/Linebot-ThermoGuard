#ifndef CONFIG_H
#define CONFIG_H

// ==========================================
// ⚙️ SYSTEM CONFIGURATION
// ==========================================

// --- 1. ตั้งค่า WiFi ---
const char* ssid = "your_SSID";
const char* password = "your_PASSWORD";

// --- 2. ตั้งค่า MQTT Server ---
// ⚠️ WARNING: Replace these sample credentials with your private MQTT broker settings before production deployment.
const char* mqtt_server = "your_mqtt_broker_host"; 
const int mqtt_port = 18772;
const char* mqtt_username = "your_mqtt_username";
const char* mqtt_password = "your_mqtt_password";

// --- 3. ตั้งค่าอุปกรณ์ (แก้แค่บรรทัดนี้ก่อนอัปโหลดลงบอร์ดใหม่) ---
const char* esp32_name = "esp32_1"; // เครื่องต่อไปให้แก้เป็น "esp32_2", "esp32_3"
const char* mqtt_topic = "/ESP32/";

#endif