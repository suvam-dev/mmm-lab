// TEST 01: Buzzer
// Wiring: buzzer (+) -> D7, buzzer (-) -> GND
// Beeps 3 times at start, then 1 beep per second. Type 'b' in Serial Monitor for an extra beep.

const int BUZZER_PIN = 7;

void setup() {
  Serial.begin(9600);
  pinMode(BUZZER_PIN, OUTPUT);
  Serial.println("=== Buzzer test (D7) ===");

  // Step 1: plain ON/OFF (works for ACTIVE buzzers)
  for (int i = 1; i <= 3; i++) {
    Serial.print("ON  (digitalWrite HIGH) #"); Serial.println(i);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(300);
    digitalWrite(BUZZER_PIN, LOW);
    Serial.println("OFF");
    delay(300);
  }

  // Step 2: tone() (needed for PASSIVE buzzers)
  Serial.println("tone() 1000 Hz for 500 ms (passive buzzer test)");
  tone(BUZZER_PIN, 1000, 500);
  delay(1000);
  Serial.println("Setup done. Loop beeps every second.");
}

void loop() {
  if (Serial.available() && Serial.read() == 'b') {
    Serial.println("manual beep");
    tone(BUZZER_PIN, 2000, 200);
  }
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);
  delay(900);
}
