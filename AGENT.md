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
| Ultrasonic, soil moisture, accelerometer | TBD (record when each is tested) |

## Rules
- Test one sensor at a time, serial at 9600 baud, print clear status lines.
- Each test sketch is standalone and documents its wiring in a header comment.
- Add each new test to `test/GUIDE.md` with expected output and a failure table.
- Avoid D0/D1 (serial/USB) for sensors.
- Order: 01 buzzer, 02 ultrasonic, 03 soil moisture, 04 accelerometer.
