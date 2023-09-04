#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

const char* ssid = "your_wifi_ssid";
const char* password = "your_wifi_password";

AsyncWebServer server(80);

void setup() {
  Serial.begin(115200);

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to WiFi");

  // Route to retrieve sensor data
  server.on("/data", HTTP_GET, [](AsyncWebServerRequest *request){
    // Simulate sensor data for this example
    float temperature = 25.0;
    float humidity = 50.0;

    // Create a JSON response
    StaticJsonDocument<200> doc;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;

    String response;
    serializeJson(doc, response);

    request->send(200, "application/json", response);
  });

  // Start server
  server.begin();
}

void loop() {
  // Your main loop code here
}
