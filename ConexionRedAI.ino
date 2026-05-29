#include <WiFi.h>
#include <WebSocketsClient.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <math.h>

const char* ssid = "INFINITUMB38A";
const char* password = "cM89eEj6XV";

const char* host = "192.168.1.121";
const uint16_t port = 3000;
const char* wsPath = "/esp32";

#define LED_ENTRADA 2
#define LED_COCINA 4
#define LED_BANO 5
#define LED_CUARTO 18

#define DHT_PIN 15
#define LM35_PIN 34
#define AGUA_PIN 35

#define TRIG_PIN 12
#define ECHO_PIN 14

#define SERVO_PIN 27
#define MOTOR_PIN 19
#define RELE_PIN 21

WebSocketsClient webSocket;
DHT dht(DHT_PIN, DHT11);
Servo puerta;

bool wsConnected = false;
unsigned long lastSend = 0;
int puertaAngulo = 0;

float safeFloat(float value, float fallback = -1.0) {
  if (isnan(value) || isinf(value)) return fallback;
  return value;
}

float leerLM35() {
  const int muestras = 10;
  long suma = 0;
  for (int i = 0; i < muestras; i++) {
    suma += analogRead(LM35_PIN);
    delay(5);
  }
  float valorProm = suma / (float)muestras;
  float voltaje = valorProm * (3.3 / 4095.0);
  return safeFloat(voltaje * 100.0, -1.0);
}

int medirDistancia() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duracion = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duracion <= 0) return 999;
  int distancia = duracion * 0.034 / 2;
  if (distancia <= 0) return 999;
  return distancia;
}

void aplicarComando(String msg) {
  msg.toLowerCase();
  if (msg == "entrada:on") digitalWrite(LED_ENTRADA, HIGH);
  else if (msg == "entrada:off") digitalWrite(LED_ENTRADA, LOW);
  else if (msg == "cocina:on") digitalWrite(LED_COCINA, HIGH);
  else if (msg == "cocina:off") digitalWrite(LED_COCINA, LOW);
  else if (msg == "bano:on") digitalWrite(LED_BANO, HIGH);
  else if (msg == "bano:off") digitalWrite(LED_BANO, LOW);
  else if (msg == "cuarto:on") digitalWrite(LED_CUARTO, HIGH);
  else if (msg == "cuarto:off") digitalWrite(LED_CUARTO, LOW);
  else if (msg == "ventilador:on") digitalWrite(MOTOR_PIN, HIGH);
  else if (msg == "ventilador:off") digitalWrite(MOTOR_PIN, LOW);
  else if (msg == "foco:on") digitalWrite(RELE_PIN, LOW);
  else if (msg == "foco:off") digitalWrite(RELE_PIN, HIGH);
  else if (msg == "puerta:abrir") { puertaAngulo = 90; puerta.write(puertaAngulo); }
  else if (msg == "puerta:cerrar") { puertaAngulo = 0; puerta.write(puertaAngulo); }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_CONNECTED:
      wsConnected = true;
      webSocket.sendTXT("hello");
      break;
    case WStype_DISCONNECTED:
      wsConnected = false;
      break;
    case WStype_TEXT: {
      String msg = String((char*)payload);
      aplicarComando(msg);
      break;
    }
    default:
      break;
  }
}

void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

String buildStateJSON() {
  float tempDHT = safeFloat(dht.readTemperature(), -1.0);
  float hum = safeFloat(dht.readHumidity(), -1.0);
  float tempLM35 = safeFloat(leerLM35(), -1.0);
  int agua = digitalRead(AGUA_PIN);
  int distancia = medirDistancia();

  String state = "{";
  state += "\"type\":\"state\",";
  state += "\"entrada\":" + String(digitalRead(LED_ENTRADA));
  state += ",\"cocina\":" + String(digitalRead(LED_COCINA));
  state += ",\"bano\":" + String(digitalRead(LED_BANO));
  state += ",\"cuarto\":" + String(digitalRead(LED_CUARTO));
  state += ",\"ventilador\":" + String(digitalRead(MOTOR_PIN));
  state += ",\"foco\":" + String(digitalRead(RELE_PIN) == LOW ? 1 : 0);
  state += ",\"puerta\":" + String(puertaAngulo);
  state += ",\"tempDHT\":" + String(tempDHT, 2);
  state += ",\"humedad\":" + String(hum, 2);
  state += ",\"tempLM35\":" + String(tempLM35, 2);
  state += ",\"agua\":" + String(agua);
  state += ",\"distancia\":" + String(distancia);
  state += "}";

  return state;
}

void setup() {
  Serial.begin(115200);

  pinMode(LED_ENTRADA, OUTPUT);
  pinMode(LED_COCINA, OUTPUT);
  pinMode(LED_BANO, OUTPUT);
  pinMode(LED_CUARTO, OUTPUT);

  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(RELE_PIN, OUTPUT);
  pinMode(AGUA_PIN, INPUT);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  analogReadResolution(12);

  puerta.attach(SERVO_PIN, 500, 2400);
  puertaAngulo = 0;
  puerta.write(puertaAngulo);

  digitalWrite(RELE_PIN, HIGH);
  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(LED_ENTRADA, LOW);
  digitalWrite(LED_COCINA, LOW);
  digitalWrite(LED_BANO, LOW);
  digitalWrite(LED_CUARTO, LOW);

  dht.begin();
  conectarWiFi();

  webSocket.begin(host, port, wsPath);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  webSocket.loop();

  if (WiFi.status() != WL_CONNECTED) {
    wsConnected = false;
    return;
  }

  if (!wsConnected) return;

  if (millis() - lastSend >= 5000) {
    lastSend = millis();

    String payload = buildStateJSON();
    webSocket.sendTXT(payload);

    Serial.println("----- ESTADO -----");
    Serial.println(payload);
  }
}
