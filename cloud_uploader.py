"""Upload Pi temperature heartbeats to the private cloud app; inventory stays in the cloud."""
from __future__ import annotations

import argparse
import getpass
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import bmo_fridge


def upload_reading(site_url: str, service_token: str, temperature_c: float | None, *, device_token: bool = False):
    parsed = urllib.parse.urlparse(site_url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Use the app's trusted https:// address.")
    endpoint = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "/api/readings", "", "", ""))
    request = urllib.request.Request(
        endpoint,
        data=json.dumps({"temperature_c": temperature_c}).encode(),
        headers={"Content-Type": "application/json",
                 ("Authorization" if device_token else "OAI-Sites-Authorization"): f"Bearer {service_token}"},
        method="POST",
    )
    # Refuse redirects so a service credential cannot be sent to another host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
        if response.status != 201:
            raise ValueError("The cloud app did not accept the reading.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("BMO_CLOUD_URL"))
    parser.add_argument("--once", action="store_true", help="Send one heartbeat and exit.")
    args = parser.parse_args()
    if not args.url:
        parser.error("Set BMO_CLOUD_URL or pass --url with the online app address.")
    device_token = os.environ.get("BMO_DEVICE_TOKEN")
    sites_token = os.environ.get("BMO_SITES_SERVICE_TOKEN")
    if device_token and sites_token:
        parser.error("Set only BMO_DEVICE_TOKEN (Vercel) or BMO_SITES_SERVICE_TOKEN (Sites).")
    token = device_token or sites_token or getpass.getpass("Private Sites service token (hidden): ")
    if not token.strip():
        parser.error("A private Sites service token is required.")
    while True:
        try:
            upload_reading(args.url, token.strip(), bmo_fridge.read_temperature_c(), device_token=bool(device_token))
            print("Cloud heartbeat sent.", flush=True)
        except (OSError, ValueError) as exc:
            # Do not log request headers, credentials, or response bodies.
            print(f"Cloud upload unavailable ({type(exc).__name__}); will retry.", flush=True)
            if args.once:
                raise SystemExit(1)
        if args.once:
            return
        time.sleep(60)


if __name__ == "__main__":
    main()
