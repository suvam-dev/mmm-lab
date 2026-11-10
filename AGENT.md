# AGENT.md

## Project
Arduino Uno sensor bring-up. Sensors: ultrasonic, capacitive soil moisture, buzzer, accelerometer.
Background: all worked, then an ESP32 WiFi attempt was added; afterwards only the accelerometer still responds. Goal: diagnose each sensor in isolation.

## Layout
- `test/`: one sketch folder per sensor (`NN_name/NN_name.ino`) plus `GUIDE.md` (user-facing commands and troubleshooting)
- `main/`: final application code (empty for now; only put verified, working code here)

## Pin map
| Device | Pin |
|---|---|
| Buzzer + | D7 |
| Buzzer - | GND |
| Ultrasonic TRIG / ECHO | D4 / D5 (verified working) |
| Red / Green LED | D9 / D10 (verified working) |
| Soil moisture AOUT | A1 (verified working) |
| MPU6050 SDA / SCL | A4 / A5, I2C 0x68 (verified working) |

## Rules
- Test one sensor at a time, serial at 9600 baud, print clear status lines.
- Each test sketch is standalone and documents its wiring in a header comment.
- Add each new test to `test/GUIDE.md` with expected output and a failure table.
- Avoid D0/D1 (serial/USB) for sensors.
- Order: all four verified.
