# Birthday frame setup

This client polls the private manifest every approximately 30 seconds, downloads changed 480×800 PNGs and turns them into the auto-detected Inky 7.3-inch 800×480 landscape buffer. Only successful `panel.show()` calls are acknowledged. The inference/render container is never contacted by this client. Hardware refresh, colours, label legibility and the two-minute update target remain **unverified until the delivered panel is tested**.

## Prepare Raspberry Pi OS

Use Raspberry Pi Imager to install current Raspberry Pi OS Lite on the Pi 3 A+. In Imager configure a unique login, SSH key, correct country and the home Wi-Fi network. This Pi needs 2.4 GHz Wi-Fi. Never commit Wi-Fi passwords or display credentials. Confirm SSH works before attaching the panel; shut down and disconnect power before attaching GPIO hardware. Enable SPI and I2C with `sudo raspi-config`, then reboot.

For caravan setup, add the second Wi-Fi connection using `sudo nmtui` on the Pi (interactive password entry); keep the home profile. Test each network while physically present. Do not replace a working connection over SSH unless a local keyboard or recovery SD card is available.

## Install

Copy this `device/` directory to `/opt/avian-frame`, then run:

```sh
sudo apt update
sudo apt install python3-venv python3-dev libopenjp2-7 libgpiod2
sudo useradd --system --home /var/lib/avian-frame --groups spi,gpio,i2c avian-frame
sudo python3 -m venv --system-site-packages /opt/avian-frame/.venv
sudo /opt/avian-frame/.venv/bin/pip install -r /opt/avian-frame/requirements.txt
sudo install -d -m 750 -o root -g avian-frame /etc/avian-frame
sudo install -m 640 -o root -g avian-frame /opt/avian-frame/config.example.json /etc/avian-frame/config.json
sudo nano /etc/avian-frame/config.json
sudo install /opt/avian-frame/avian-frame.service /etc/systemd/system/
sudo install /opt/avian-frame/avian-frame.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now avian-frame.timer
```

Set `url` to the HTTPS app origin and `token` to its separately provisioned **display-only** bearer credential. The token may read `/device/manifest`, `/device/images/*` and acknowledge `/device/ack`; it must have no collection/media privileges. Do not use the web sign-in credential. Provisioning the matching server secret is part of hosted setup. The example contains no working credential.

Group names and GPIO dependencies above must be checked against the installed Pi OS and current Pimoroni driver. Use Pimoroni's official supported Inky installation instructions if package dependencies differ. The driver must detect the actual 7.3-inch panel; another resolution raises an explicit error instead of resizing silently. Change rotation to `270` if the physical portrait orientation is upside down.

## Test before the panel arrives

On Windows, macOS or Linux with Python and Pillow installed:

```sh
python -m unittest discover -s device -v
python device/client.py --config device/config.json --dry-run
python device/client.py --config device/config.json --preview portrait.png
```

Copy the example to local ignored `device/config.json` and configure the real device endpoint. `--preview` writes the exact decoded portrait PNG and never touches hardware, updates display state or acknowledges it. `--dry-run` downloads and validates only. These prove protocol/image handling, **not a hardware pass**. The Inky import is lazy, so local preview needs only Pillow. No persisted fixture or fake model is used in production.

## Physical acceptance and recovery

1. Run `sudo systemctl start avian-frame.service`; inspect `journalctl -u avian-frame.service -n 30`. Check portrait orientation, six-species labels, clipping and colour on the actual panel.
2. Confirm a real sighting, change names/mode and measure confirmation-to-visible-refresh time. Verify the app reports an acknowledgement only after the panel finishes.
3. Leave the phone closed for an hourly rotation. Confirm a different eligible selection appears.
4. Disconnect Wi-Fi: last picture and `/var/lib/avian-frame/last-good.png` must remain. Reconnect and check recovery. Stop/restart the service mid-refresh, reboot the Pi and verify the timer resumes. A refresh interrupted before success must retry.
5. `systemctl list-timers avian-frame.timer` verifies scheduling. Failed one-shot runs are retried by the next timer activation. A process lock prevents concurrent refreshes; unchanged revisions do not refresh again, but retry acknowledgement.

If troubleshooting, stop the timer before unplugging hardware: `sudo systemctl stop avian-frame.timer`. Keep the SD image and configuration securely backed up; rotating the device token requires changing both server and Pi. Logs omit tokens. Systemd configuration and real reboot recovery have not been exercised on physical hardware yet.
