// TEST 04: Accelerometer - I2C scan + raw reading (MPU6050 / ADXL345 / MPU9250)
// Wiring (I2C): VCC -> 5V or 3.3V, GND -> GND, SDA -> A4, SCL -> A5
// Step 1 scans the I2C bus and names the chip. Step 2 prints raw X/Y/Z. Tilt the board to see changes.
#include <Wire.h>

byte addr = 0;

void setup() {
  Serial.begin(9600);
  Wire.begin();
  Serial.println("=== Accelerometer test (I2C: SDA=A4, SCL=A5) ===");
  for (byte a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x"); Serial.print(a, HEX);
      if (a == 0x68 || a == 0x69) Serial.println("  (MPU6050/MPU9250)");
      else if (a == 0x53 || a == 0x1D) Serial.println("  (ADXL345)");
      else Serial.println();
      if (!addr && (a == 0x68 || a == 0x69 || a == 0x53 || a == 0x1D)) addr = a;
    }
  }
  if (!addr) { Serial.println("NO I2C accelerometer found - check SDA/SCL/power (or it is an analog one)"); return; }
  if (addr == 0x68 || addr == 0x69) {            // wake MPU6050
    Wire.beginTransmission(addr); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();
  } else {                                       // ADXL345 measure mode
    Wire.beginTransmission(addr); Wire.write(0x2D); Wire.write(0x08); Wire.endTransmission();
  }
}

void loop() {
  if (!addr) return;
  int16_t x, y, z;
  bool mpu = (addr == 0x68 || addr == 0x69);
  Wire.beginTransmission(addr); Wire.write(mpu ? 0x3B : 0x32); Wire.endTransmission(false);
  Wire.requestFrom(addr, (byte)6);
  if (Wire.available() < 6) { Serial.println("read failed"); delay(500); return; }
  if (mpu) { x = Wire.read() << 8 | Wire.read(); y = Wire.read() << 8 | Wire.read(); z = Wire.read() << 8 | Wire.read(); }
  else     { x = Wire.read() | Wire.read() << 8; y = Wire.read() | Wire.read() << 8; z = Wire.read() | Wire.read() << 8; }
  Serial.print("X: "); Serial.print(x); Serial.print("  Y: "); Serial.print(y); Serial.print("  Z: "); Serial.println(z);
  delay(300);
}
