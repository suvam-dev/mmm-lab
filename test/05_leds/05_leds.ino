// TEST 05: Red LED (D9) and Green LED (D10)
// Wiring: each LED's long leg (+) -> resistor (220-330 ohm) -> pin; short leg (-) -> GND
// Sequence: red on, green on, both on, both off, then alternate blink. Serial prints each step.

const int RED_PIN = 9;
const int GREEN_PIN = 10;

void setup() {
  Serial.begin(9600);
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  Serial.println("=== LED test (RED=D9, GREEN=D10) ===");

  Serial.println("RED only");   digitalWrite(RED_PIN, HIGH); delay(1500); digitalWrite(RED_PIN, LOW);
  Serial.println("GREEN only"); digitalWrite(GREEN_PIN, HIGH); delay(1500); digitalWrite(GREEN_PIN, LOW);
  Serial.println("BOTH");       digitalWrite(RED_PIN, HIGH); digitalWrite(GREEN_PIN, HIGH); delay(1500);
  Serial.println("OFF");        digitalWrite(RED_PIN, LOW); digitalWrite(GREEN_PIN, LOW); delay(1000);
  Serial.println("Alternating blink...");
}

void loop() {
  digitalWrite(RED_PIN, HIGH); digitalWrite(GREEN_PIN, LOW);  delay(400);
  digitalWrite(RED_PIN, LOW);  digitalWrite(GREEN_PIN, HIGH); delay(400);
}
