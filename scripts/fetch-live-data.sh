#!/usr/bin/env bash
# Fetches live wait-time data from themeparks.wiki ONCE per park and writes
# it to a static JSON file that the site's own visitors read from, instead
# of every visitor's browser hitting themeparks.wiki directly.
#
# Run this on a schedule (cron) — see the crontab line at the bottom of this
# file. themeparks.wiki's own guidance is to poll live data no more than
# once every 5 minutes; every 60 seconds here is already well inside that,
# and it stays flat no matter how much site traffic grows, since it's one
# fetch per park per run regardless of visitor count.
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

fetch_and_save "$ORLANDO_URL" "$DATA_DIR/live-orlando.json"
fetch_and_save "$HOLLYWOOD_URL" "$DATA_DIR/live-hollywood.json"

# ── Crontab (run: crontab -e, then paste the line below) ──────────────────
# * * * * * /home/acieffe/web/digitalelegance.com/public_html/hhn/scripts/fetch-live-data.sh >> /home/acieffe/logs/hhn-fetch.log 2>&1
