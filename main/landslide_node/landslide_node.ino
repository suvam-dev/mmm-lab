// MAIN: Landslide node - streams all sensors to the web dashboard and obeys its alarm commands.
//
// Wiring: Buzzer D7(+) | Ultrasonic TRIG D4, ECHO D5 | Soil AOUT A1
//         MPU6050 SDA A4, SCL A5 | Red LED D9 | Green LED D10
//
// Output (every 500 ms, 9600 baud), one JSON line:
//   {"d":9.7,"s":461,"ax":-778,"ay":-486,"az":-8122,"a":0}
//   d = distance cm (-1 = no echo), s = soil raw ADC, ax/ay/az = raw accel, a = alarm state
// Commands from the dashboard (one char + newline):
//   A = alarm (red LED + buzzer)   N = normal (green LED)   M = mute buzzer   U = unmute
#include <Wire.h>

const int TRIG_PIN = 4, ECHO_PIN = 5, SOIL_PIN = A1;
const int BUZZER_PIN = 7, RED_PIN = 9, GREEN_PIN = 10;
const byte MPU_ADDR = 0x68;

bool alarmOn = false, muted = false, beepOn = false;
unsigned long lastSample = 0, lastBeep = 0;

void setState(bool alarm) {
  alarmOn = alarm;
  digitalWrite(RED_PIN, alarm ? HIGH : LOW);
  digitalWrite(GREEN_PIN, alarm ? LOW : HIGH);
  if (!alarm) { noTone(BUZZER_PIN); beepOn = false; }
}

float readDistance() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long us = pulseIn(ECHO_PIN, HIGH, 25000UL);
  return us == 0 ? -1 : us * 0.0343 / 2.0;
}

bool readAccel(int16_t &x, int16_t &y, int16_t &z) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom(MPU_ADDR, (byte)6);
  if (Wire.available() < 6) return false;
  x = Wire.read() << 8 | Wire.read();
  y = Wire.read() << 8 | Wire.read();
  z = Wire.read() << 8 | Wire.read();
  return true;
}

void setup() {
  Serial.begin(9600);
  pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT); pinMode(RED_PIN, OUTPUT); pinMode(GREEN_PIN, OUTPUT);
  Wire.begin();
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();
  setState(false);
  Serial.println("# landslide_node ready");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'A') setState(true);
    else if (c == 'N') setState(false);
    else if (c == 'M') { muted = true; noTone(BUZZER_PIN); }
    else if (c == 'U') muted = false;
  }

  if (alarmOn && !muted && millis() - lastBeep > 250) {   // pulsing alarm tone
    lastBeep = millis();
    beepOn = !beepOn;
    if (beepOn) tone(BUZZER_PIN, 2000); else noTone(BUZZER_PIN);
  }

  if (millis() - lastSample >= 500) {
    lastSample = millis();
    int16_t x = 0, y = 0, z = 0;
    readAccel(x, y, z);
    Serial.print("{\"d\":");  Serial.print(readDistance(), 1);
    Serial.print(",\"s\":");  Serial.print(analogRead(SOIL_PIN));
    Serial.print(",\"ax\":"); Serial.print(x);
    Serial.print(",\"ay\":"); Serial.print(y);
    Serial.print(",\"az\":"); Serial.print(z);
    Serial.print(",\"a\":");  Serial.print(alarmOn ? 1 : 0);
    Serial.println("}");
  }
}
