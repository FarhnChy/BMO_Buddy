# BMO Fridge Buddy online app

This private Sites app stores inventory in Cloudflare D1. It stays available
when the Raspberry Pi is off. The original Flask app remains a separate local
option; its SQLite inventory is not automatically imported into D1.

Browser access uses the Site's owner-only sign-in policy. Inventory APIs also
require authenticated visitor identity. The Pi's service access permits
heartbeats at POST /api/readings, without giving the uploader inventory access.
Do not make this Site public: the sensor endpoint relies on private Sites access.

## Develop and validate

Requires Node 22.13 or later (tests use Node 24's built-in SQLite).

- Install: `npm install`
- Tests: `node --test tests/app.test.mjs`
- Preview: `npm run dev`
- Build: `npm run build`
- Schema changes: edit db/schema.ts and run `npm run db:generate`.

D1 migrations in drizzle/ are deployed with the Site. Never edit an applied
migration. Local preview storage and hosted storage are separate.

The UI retains the project's existing BMO design and bundled ZXing scanner.
Its assets are in public/static; app/fridge/html.ts supplies the page. Test
camera permissions and actual barcode/photo scanning on a real phone over HTTPS.
Food QR labels encode JSON with name, optional quantity, optional expires_on
(YYYY-MM-DD), and optional numeric barcode. Review the form before saving.

## Connect the Pi

The Pi runs ../cloud_uploader.py alongside the existing OLED monitor. It sends
a heartbeat every minute, including a null value when the sensor is missing.
After three minutes without a heartbeat the cloud app marks the Pi offline and
hides the current temperature. Historical readings remain for seven days.
Timestamps come from the cloud receipt time, so a wrong Pi clock cannot make an
old reading appear current. Failed uploads are retried; offline history is not
backfilled.

The private Site's service credential must be transferred securely to the Pi.
Keep it out of Git, browser code, screenshots, and shell history. On the Pi,
use an untracked .env.cloud file readable only by the Pi account containing:

```
BMO_CLOUD_URL=<deployed HTTPS origin>
BMO_SITES_SERVICE_TOKEN=<private Sites service credential>
```

For an interactive one-shot test, run `python cloud_uploader.py --url <origin>
--once` from the project root. It prompts for the credential with input hidden.
The uploader refuses HTTP and redirects. The service template at
../deploy/systemd/bmo-fridge-cloud.service.in uses .env.cloud; replace @USER@
and @PROJECT_DIR@ with the Pi account and absolute checkout path before
installing it as /etc/systemd/system/bmo-fridge-cloud.service. Then run
`sudo systemctl daemon-reload` and `sudo systemctl enable --now bmo-fridge-cloud`.

A deployed app does not establish a connection to the physical Pi. Confirm
successful uploads and real sensor readings before calling that integration done.
