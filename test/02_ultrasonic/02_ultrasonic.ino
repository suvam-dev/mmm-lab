// TEST 02: Ultrasonic sensor (HC-SR04 style)
// Wiring: VCC -> 5V, GND -> GND, TRIG -> D4, ECHO -> D5
// Prints distance in cm 5 times per second. Move your hand in front of it.

const int TRIG_PIN = 4;
const int ECHO_PIN = 5;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  Serial.println("=== Ultrasonic test (TRIG=D4, ECHO=D5) ===");
}

void loop() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long us = pulseIn(ECHO_PIN, HIGH, 30000UL);  // 30 ms timeout (~5 m)
  if (us == 0) {
    Serial.println("NO ECHO (timeout) - check wiring/power, or nothing in range");
  } else {
    Serial.print("Distance: ");
    Serial.print(us * 0.0343 / 2.0, 1);
    Serial.println(" cm");
  }
  delay(200);
}
