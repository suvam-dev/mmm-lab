# mmm-lab — SlopeGuard landslide early-warning node

An Arduino Uno reads four sensors, a web dashboard (plain HTML/CSS/JS, no build step) lets you set safe
limits per sensor and per sensor pair, and the node switches from a **green LED** to a **red LED + buzzer**
when the ground looks unsafe.

```
Arduino Uno ──USB──> Chrome (Web Serial) ──> dashboard: limits, live charts, serial log, CSV/JSON export
     ▲                                              │
     └────────── A = alarm, N = normal ◄────────────┘
```

## Hardware

| Device | Device pin | Uno pin |
|---|---|---|
| Buzzer | + / – | D7 / GND |
| Ultrasonic (HC-SR04) | VCC, GND, TRIG, ECHO | 5V, GND, D4, D5 |
| Capacitive soil moisture | VCC, GND, AOUT | 5V, GND, A1 |
| MPU6050 accelerometer | VCC, GND, SDA, SCL | 5V, GND, A4, A5 |
| Red LED | + (via 220–330 Ω) / – | D9 / GND |
| Green LED | + (via 220–330 Ω) / – | D10 / GND |

Keep D0 and D1 free (USB serial). Each LED needs its own resistor; only the short legs share GND.

## Quick start (any computer)

You need: an Arduino Uno + USB cable, [Arduino CLI](https://arduino.github.io/arduino-cli/) (or the Arduino IDE), Python 3, and Chrome or Edge.

```bash
git clone https://github.com/suvam-dev/mmm-lab.git && cd mmm-lab
make setup        # installs the Arduino AVR core (pinned version)
make flash        # compiles and uploads main/landslide_node to the Uno
make web          # serves the dashboard at http://localhost:8080
```

Open http://localhost:8080 in **Chrome or Edge**, click **Connect Arduino**, pick the Uno's port, and follow the
five steps. No hardware? Click **Try the demo**.

Install Arduino CLI: macOS `brew install arduino-cli` · Linux/Windows see the [install guide](https://arduino.github.io/arduino-cli/latest/installation/).
No `make`? Run the equivalent commands from the `Makefile` directly, or open the sketch in the Arduino IDE
(Board: Arduino Uno).

> Only one program can hold the serial port. Close the Arduino Serial Monitor (and `make monitor`) before
> connecting the dashboard, and disconnect the dashboard before uploading.

## Repository layout

| Path | What it is |
|---|---|
| `main/landslide_node/` | Final firmware: streams JSON readings, obeys alarm commands |
| `frontend/` | Dashboard (`index.html`, `style.css`, `app.js`) |
| `test/` | One standalone sketch per device, plus [`GUIDE.md`](test/GUIDE.md) with expected output and troubleshooting |
| `AGENT.md` | Context and conventions for AI coding agents |
| `Makefile` | Setup / flash / monitor / serve helpers |

## Serial protocol (9600 baud)

Node → dashboard, every 500 ms:

```json
{"d":9.7,"s":461,"ax":-778,"ay":-486,"az":-8122,"a":0}
```

`d` distance in cm (`-1` = no echo) · `s` soil raw ADC · `ax,ay,az` raw accelerometer · `a` alarm state.

Dashboard → node: `A` alarm, `N` normal, `M` mute buzzer, `U` unmute.

## How alarms are decided

- **Individual limits:** soil moisture and distance alarm when they fall *below* the limit; tilt and vibration when they rise *above* it.
- **Pair rules:** both sensors must cross their own (usually gentler) limits at the same time.
- Tilt is the angle from a baseline you set; vibration is the change between readings, scaled so rest gravity is 1 g.
- The alarm needs 2 bad readings in a row and clears after 6 good ones. A sensor within 20% of its limit shows **Watch**.

## Testing individual sensors

Follow [`test/GUIDE.md`](test/GUIDE.md). Flash one at a time, e.g. `make flash SKETCH=test/02_ultrasonic`, then `make monitor`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Upload fails: port busy | Close any serial monitor or the dashboard connection |
| Dashboard can't open the port | Use Chrome/Edge, close other monitors, replug the Uno |
| `make flash` finds no board | `make ports`, then `make flash PORT=<your port>` |
| Soil value never changes | Check the signal wire is on A1 and the probe has power |
| Both LEDs glow | The LEDs share a row or a resistor; see `test/GUIDE.md` |

## Security

Never commit WiFi passwords or keys. Copy `.env.example` to `.env`, or use `secrets.h` — both are gitignored.

## License

MIT — see [LICENSE](LICENSE).
