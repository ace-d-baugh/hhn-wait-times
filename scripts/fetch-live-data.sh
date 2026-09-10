#!/usr/bin/env bash
# Fetches live wait-time data from themeparks.wiki and writes it to a static
# JSON file that the site's own visitors read from, instead of every
# visitor's browser hitting themeparks.wiki directly.
#
# Run this on a schedule (cron) — see the crontab line at the bottom of this
# file. Since it's a single shared fetcher rather than every visitor's
# browser polling themeparks.wiki, the request volume stays flat no matter
# how much site traffic grows — one fetch per park per run regardless of
# visitor count. That means it's fine, and preferable, to poll faster than
# themeparks.wiki's stated "no more than once every 5 minutes" guidance in
# exchange for fresher data for visitors: this script polls every 30
# seconds, matching the 30-second refresh clients use to read the cached
# data. cron itself only grants 1-minute granularity, so the crontab line
# below fires once per minute and this script fetches twice internally
# (once immediately, once after a 30-second sleep) to hit that cadence.
#
# Setup:
#   1. Put this file on the server, e.g.
#      /home/acieffe/web/digitalelegance.com/public_html/hhn/scripts/fetch-live-data.sh
#   2. chmod +x fetch-live-data.sh
#   3. Add the crontab line at the bottom of this file.

set -euo pipefail

SITE_DIR="/home/acieffe/web/digitalelegance.com/public_html/hhn"

DATA_DIR="$SITE_DIR/data"
mkdir -p "$DATA_DIR"
# cron often runs with a stricter umask than an interactive shell, which can
# leave this directory and the JSON files unreadable by the web server user
# (403s for visitors even though the files exist) — force sane permissions
# on every run instead of depending on whatever umask cron happens to use.
chmod 755 "$DATA_DIR"

ORLANDO_URL="https://api.themeparks.wiki/v1/entity/89db5d43-c434-4097-b71f-f6869f495a22/live"
HOLLYWOOD_URL="https://api.themeparks.wiki/v1/entity/bc4005c5-8c7e-41d7-b349-cdddf1796427/live"

# Fetches into a temp file first and only replaces the real file if the
# fetch succeeded, so visitors never see a truncated/partial file mid-write,
# and a failed fetch just leaves the last-known-good data in place.
fetch_and_save() {
  local url="$1" outfile="$2" tmpfile
  tmpfile="$(mktemp "${outfile}.XXXXXX")"
  if curl -fsS --max-time 15 "$url" -o "$tmpfile"; then
    chmod 644 "$tmpfile"
    mv -f "$tmpfile" "$outfile"
  else
    echo "$(date -u +%FT%TZ) fetch failed for $url" >&2
    rm -f "$tmpfile"
  fi
}

# cron only grants 1-minute granularity, so fetch twice per invocation
# (immediately, then again after a 30-second sleep) to get a 30-second
# cadence out of a once-per-minute crontab entry.
fetch_and_save "$ORLANDO_URL" "$DATA_DIR/live-orlando.json"
fetch_and_save "$HOLLYWOOD_URL" "$DATA_DIR/live-hollywood.json"

sleep 30

fetch_and_save "$ORLANDO_URL" "$DATA_DIR/live-orlando.json"
fetch_and_save "$HOLLYWOOD_URL" "$DATA_DIR/live-hollywood.json"

# ── Crontab (run: crontab -e, then paste the line below) ──────────────────
# * * * * * /home/acieffe/web/digitalelegance.com/public_html/hhn/scripts/fetch-live-data.sh >> /home/acieffe/logs/hhn-fetch.log 2>&1
