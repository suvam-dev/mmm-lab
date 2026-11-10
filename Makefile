# Reproducible build/flash helpers. Works on macOS, Linux and Windows (Git Bash/WSL).
# Usage:  make setup | make flash | make monitor | make web
#         make flash SKETCH=test/01_buzzer     (any other sketch)
#         make flash PORT=/dev/ttyUSB0         (override auto-detected port)
CLI    ?= arduino-cli
FQBN   ?= arduino:avr:uno
CORE   ?= arduino:avr@1.8.8
SKETCH ?= main/landslide_node
PORT   ?= $(shell $(CLI) board list 2>/dev/null | awk '/arduino:avr:uno/ {print $$1; exit}')

.PHONY: help setup compile upload flash monitor web ports
help:
	@echo "make setup    install the Arduino AVR core ($(CORE))"
	@echo "make compile  compile SKETCH=$(SKETCH)"
	@echo "make flash    compile + upload to the Uno"
	@echo "make monitor  open the serial monitor (Ctrl+C to quit)"
	@echo "make web      serve the dashboard at http://localhost:8080"
	@echo "make ports    list connected boards"

setup:
	$(CLI) core update-index
	$(CLI) core install $(CORE)

compile:
	$(CLI) compile --fqbn $(FQBN) $(SKETCH)

upload:
	@test -n "$(PORT)" || (echo "No Uno found. Plug it in or pass PORT=..."; exit 1)
	$(CLI) upload -p $(PORT) --fqbn $(FQBN) $(SKETCH)

flash: compile upload

monitor:
	@test -n "$(PORT)" || (echo "No Uno found. Plug it in or pass PORT=..."; exit 1)
	$(CLI) monitor -p $(PORT) -c baudrate=9600

web:
	cd frontend && python3 -m http.server 8080

ports:
	$(CLI) board list
