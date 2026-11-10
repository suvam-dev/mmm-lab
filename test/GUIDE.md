# Sensor Test Guide (Arduino Uno)

Test one sensor at a time. Disconnect the ESP32 and every other sensor first,
so only the sensor under test is wired.

## Setup (once)
- Plug the Uno in by USB.
- Arduino IDE: Tools > Board > Arduino Uno, Tools > Port > `/dev/cu.usbmodem...`
- Open the sketch (File > Open), click Upload (->), then Tools > Serial Monitor at **9600 baud**.

## Optional: command line
```
brew install arduino-cli
arduino-cli core install arduino:avr
arduino-cli board list                       # find your port
arduino-cli compile --fqbn arduino:avr:uno test/01_buzzer
arduino-cli upload  -p /dev/cu.usbmodemXXXX --fqbn arduino:avr:uno test/01_buzzer
arduino-cli monitor -p /dev/cu.usbmodemXXXX -c baudrate=9600
```

## Test 01: Buzzer (`test/01_buzzer/01_buzzer.ino`)
Wiring: (+) -> D7, (-) -> GND.

Expected: 3 beeps, then a tone, then a short beep every second. Serial Monitor prints each step. Type `b` + Enter for an extra beep.

| What you see | Meaning |
|---|---|
| Beeps during the 3 ON/OFF steps | Active buzzer, working |
| Silent for ON/OFF but the 1000 Hz tone sounds | Passive buzzer, working (use `tone()`) |
| Total silence | Check polarity (long leg = +), D7 pin, jumper wire, or the buzzer is dead |
| Serial Monitor shows nothing | Wrong port or baud rate; board not uploading |
| Upload fails | Unplug anything on pins D0/D1 (the ESP32 may be using TX/RX!) |

Tip: since the ESP32 attempt broke things, check that nothing is still on D0/D1, 5V, or GND shorted, and that the ESP32 isn't feeding 3.3V/5V into the wrong pins.

## Test 02: Ultrasonic (`test/02_ultrasonic/02_ultrasonic.ino`)
Wiring: VCC -> 5V, GND -> GND, TRIG -> D4, ECHO -> D5.

Expected: `Distance: XX.X cm` five times a second. Move your hand closer and farther and the number should change.

| What you see | Meaning |
|---|---|
| Sensible, changing distance | Working |
| `NO ECHO (timeout)` always | Check 5V/GND; swap TRIG and ECHO wires (D4/D5); sensor may be dead |
| Constant 0 or random jumps | Loose wire, or nothing solid in front of it |

## Test 03: Soil moisture (`test/03_soil_moisture/03_soil_moisture.ino`)
Wiring: VCC -> 5V, GND -> GND, AOUT -> A1.

Expected: `Raw: NNN` plus a bar, twice a second. Capacitive sensors read HIGH when dry and LOWER when wet. Hold in air, then dip only the sensing part in water; the number should drop clearly.

| What you see | Meaning |
|---|---|
| Stable number that drops in water | Working |
| Always 0 | Signal wire not on A1, or GND/VCC missing |
| Always 1023 | Signal wire disconnected or no power |
| Wandering/noisy values with no change in water | Floating pin or bad connection |

## Test 04: Accelerometer MPU6050 (`test/04_accelerometer/04_accelerometer.ino`)
Wiring: VCC -> 5V, GND -> GND, SDA -> A4, SCL -> A5 (I2C pins on the Uno are fixed).

Expected: `Found device at 0x68`, then raw X/Y/Z every 0.3 s. One axis shows about +/-16000 (gravity) when still; values change when you tilt.

| What you see | Meaning |
|---|---|
| Found 0x68 + changing values | Working |
| `NO I2C accelerometer found` | Check SDA/SCL are on A4/A5 (not swapped), power, solder joints |
| Found device but all zeros | Chip asleep or bad connection; power-cycle |

All four sensors tested.
