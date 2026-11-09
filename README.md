# BMO Fridge Buddy

BMO Fridge Buddy gives a mini fridge an animated BMO-inspired face, live
temperature monitoring, and a phone-friendly food inventory interface.
Built with a Raspberry Pi 5, a waterproof DS18B20 probe, a 128 x 64 I2C OLED,
Python, Flask, and SQLite.

## Hardware demo

**[Watch or download the recorded startup and hardware demo](docs/media/bmo-hardware-demo.mov)**

The recording captures the physical prototype. Depending on the browser,
the MOV file may download instead of playing inline.

### Temperature expressions on real hardware

| Normal: 35.3 F | Warm: 41.7 F | Cold: 27.5 F |
|:---:|:---:|:---:|
| <img src="docs/media/oled-normal.jpg" alt="OLED showing a smiling BMO face and 35.3 F Normal" width="240"> | <img src="docs/media/oled-warm.jpg" alt="OLED showing a worried BMO face and 41.7 F Warm" width="240"> | <img src="docs/media/oled-cold.jpg" alt="OLED showing a zigzag mouth and 27.5 F C-C-Cold" width="240"> |

### Hardware connections

| Raspberry Pi 5 | Temperature probe adapter |
|:---:|:---:|
| <img src="docs/media/hardware-pi.jpg" alt="Powered Raspberry Pi in an open case with cooling fan and connected GPIO jumper wires" width="300"> | <img src="docs/media/probe-adapter.jpg" alt="Plug-in temperature probe adapter with GND DAT and VCC labels and connected wires" width="300"> |

The Pi and adapter stay outside the fridge; only the waterproof metal probe
goes inside. These photos document the prototype, not a pin-by-pin wiring guide;
see [setup and wiring instructions](TODO.md#oled-wiring) for the connections.

**Verified on the Pi:** sensor detection and valid readings, response to
warming and cooling, OLED communication at I2C address `0x3C`, startup
animation, blinking, and temperature-dependent expressions. The photos above
show all three temperature bands on the physical OLED.

**Next validation:** exercise the phone inventory workflow on a real phone,
inspect the logged temperature graph, and complete an extended fridge run.
The probe has not yet been checked against a reference thermometer.

## What I built

I built this project to connect embedded hardware with a useful application:
read a physical sensor, animate a constrained display, persist inventory and
temperature data, and expose food tracking through a local web interface.

The software implements:

- Read the fridge temperature with a Gikfun EK1183 waterproof DS18B20 probe and
  adapter module.
- Show a BMO face, temperature, and fridge status on an OLED screen.
- Report whether the fridge is too cold, normal, or too warm.
- Accept barcodes typed manually, scanned with a phone, or scanned from an
  optional USB scanner.
- Look up product names using Open Food Facts.
- Store food quantities and expiration dates in a local SQLite database.
- Warn about food that is expiring soon.
- Save temperature history to a CSV file.
- Graph recent temperature history with a highlighted 32-40 F safe band.
- Give BMO sleepy, happy, cold, and worried expressions based on temperature.

## How it works

```mermaid
flowchart LR
    Probe[DS18B20 probe] -->|1-Wire / GPIO4| Monitor[Python hardware monitor]
    Monitor -->|I2C| OLED[Animated OLED face]
    Monitor --> CSV[Temperature CSV]
    Phone[Phone browser] <-->|Local Wi-Fi| Web[Flask web app]
    Web <--> DB[(SQLite inventory)]
    Web -->|Read history| CSV
    Web -->|Product lookup| OFF[Open Food Facts]
    Scanner[Optional USB barcode scanner] --> Monitor
    Monitor <--> DB
```

The OLED shows just the face, temperature, and a short status. Inventory and
longer messages belong in the phone interface and terminal because the screen
is only 128 x 64 pixels. Sensor conversion runs in a separate thread so the
display can animate while a temperature read waits for the probe.

| Reading | OLED behavior |
|---|---|
| Startup | Closed eyes, then open eyes; `BMO waking up...` |
| Below 32 F | Zigzag mouth and `C-C-Cold`; brief `Brrr!` reaction on entering cold |
| 32-40 F | Smiling face and `Normal` |
| Above 40 F | Worried face and `Warm` |
| Sensor unavailable | Sleepy face and `No sensor` |

These are configured temperature bands, not a determination of whether an
individual food is safe. Quantity and expiration tracking depend on user input.

The main application is [bmo_fridge.py](bmo_fridge.py). Current progress,
remaining setup, wiring, testing, and update instructions are in
[TODO.md](TODO.md).

## Phone inventory and barcode scanner

The phone-friendly web app can scan a product barcode, look up its name with
Open Food Facts, save quantity and expiration date, list the fridge inventory,
remove items, and graph temperature history. Different expiration dates are
kept as separate batches even when the barcode is the same. The phone and OLED
share the same BMO mood rules. The OLED expressions have been tested on the
physical screen; the complete phone workflow still needs device validation.

The OLED reserves its screen for a blinking BMO face and one compact footer
with temperature and Cold, Normal, Warm, or No sensor status. A short closed-eye
wake-up animation plays at startup. Inventory and scan messages stay in the
phone interface and terminal. Sensor reads run separately from animation;
the probe's conversion time and physical response still limit how quickly a
temperature change appears. Warm means above the project's 40 F fridge limit.

On the Raspberry Pi:

```bash
cd ~/bmo_fridge_buddy
source .venv/bin/activate
python -m pip install -r requirements-rpi.txt
python web_app.py
```

The terminal prints an address such as `http://192.168.1.25:5000`. Open that
address from a phone on the same private Wi-Fi. Manual barcode entry and the
**Take photo** option work from this local page. The ZXing barcode reader is
stored in this repository, so the scanner itself loads without internet
access. Product-name lookup still needs internet and falls back to an editable
`Unknown item` name when offline. Continuous **Live scan** camera access
requires a trusted HTTPS certificate because mobile browsers block live camera
streams on insecure pages.

For HTTPS, set paths to a trusted certificate and matching private key before
starting the server:

```bash
export BMO_TLS_CERT=/path/to/certificate.pem
export BMO_TLS_KEY=/path/to/private-key.pem
python web_app.py
```

Keep this development server on a trusted home network. Do not expose it
directly to the public internet; Version 2 does not yet include user accounts.

## Install as an always-on Pi service

After testing both applications manually, install the web app, hardware
monitor, and daily backup timer:

```bash
cd ~/bmo_fridge_buddy
git pull --ff-only
source .venv/bin/activate
python -m pip install -r requirements-rpi.txt
bash scripts/install_pi_services.sh
```

The installer starts both applications after every boot and immediately makes
a verified inventory backup. It then keeps 14 daily backups in
`~/bmo_fridge_backups`. Check them with:

```bash
sudo systemctl status bmo-fridge-web bmo-fridge-monitor bmo-fridge-backup.timer
ls -lh ~/bmo_fridge_backups
```

These copies protect against accidental database changes or corruption. They
remain on the same SD card, so occasionally copy the backup folder to another
computer if protection from complete SD-card failure matters.

## Private trusted HTTPS for live scanning

The recommended HTTPS option is Tailscale Serve. It keeps BMO private to your
Tailscale devices, provides a trusted certificate, and lets the web server
listen only on the Pi itself. Install Tailscale on the Pi and phone, sign both
into the same account, then run on the Pi:

```bash
sudo tailscale up
cd ~/bmo_fridge_buddy
bash scripts/enable_tailscale_https.sh
```

The command prints the private `https://...ts.net` address to open on the
phone. Do not enable Tailscale Funnel; this project is intended to remain
private rather than publicly accessible.
