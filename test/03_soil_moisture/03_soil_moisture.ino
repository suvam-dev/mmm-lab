// TEST 03: Capacitive soil moisture sensor
// Wiring: VCC -> 5V (or 3.3V), GND -> GND, AOUT -> A1
// Prints raw ADC (0-1023) twice a second. Capacitive sensors read HIGH when DRY, LOWER when WET.
// Test: hold in air (dry), then dip the sensing part (not the electronics) in water.

const int SOIL_PIN = A1;

void setup() {
  Serial.begin(9600);
  Serial.println("=== Soil moisture test (A1) ===");
}

void loop() {
  analogRead(SOIL_PIN);            // throwaway read to settle the ADC
  int raw = analogRead(SOIL_PIN);
  Serial.print("Raw: ");
  Serial.print(raw);
  Serial.print("  ");
  for (int i = 0; i < raw / 25; i++) Serial.print('#');
  Serial.println();
  delay(500);
}
