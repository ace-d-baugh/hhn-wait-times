#!/usr/bin/env node
// Long-running Node process that receives Ko-fi's donation webhook and
// keeps a running total in data/donation-total.json, which the site's
// front end reads the same way it already reads data/live-orlando.json —
// a static file, not a live API call from every visitor's browser.
//
// Ko-fi has no "pull" API for your current total, only a webhook that fires
// once per transaction, so this process has to accumulate the total itself
// rather than ever asking Ko-fi "what do I have so far".
//
// Setup on the VPS:
//   1. In Ko-fi: Settings -> API -> copy the Verification Token, and set
//      the webhook URL to wherever Nginx will proxy this process's path
//      (e.g. https://digitalelegance.com/hhn/kofi-webhook).
//   2. Put this file on the server next to fetch-live-data.sh, e.g.
//      /home/acieffe/web/digitalelegance.com/public_html/hhn/scripts/kofi-webhook.js
//   3. Set the verification token as an env var rather than editing this
//      file (it's a secret — don't commit it):
//        export KOFI_VERIFICATION_TOKEN="paste-the-token-here"
//   4. Run it under pm2 so it survives crashes and reboots:
//        pm2 start scripts/kofi-webhook.js --name kofi-webhook
//        pm2 save
//        pm2 startup   (follow the printed instructions once)
//   5. Add an Nginx location block that proxies the webhook path to this
//      process's port, e.g.:
//        location = /hhn/kofi-webhook {
//          proxy_pass http://127.0.0.1:4001/kofi-webhook;
//        }

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const PORT = process.env.KOFI_WEBHOOK_PORT || 4001;
const WEBHOOK_PATH = process.env.KOFI_WEBHOOK_PATH || '/kofi-webhook';
const VERIFICATION_TOKEN = process.env.KOFI_VERIFICATION_TOKEN;

// Matches fetch-live-data.sh's SITE_DIR convention, but derived from this
// file's own location so there's nothing to keep in sync between the two.
const SITE_DIR = process.env.SITE_DIR || path.resolve(__dirname, '..');
const DATA_DIR = path.join(SITE_DIR, 'data');
const TOTAL_FILE = path.join(DATA_DIR, 'donation-total.json');

// Only these Ko-fi payload types count toward the goal — the button on the
// site is a one-time "Buy Me A Skull Pie" tip, not a subscription or shop.
const COUNTED_TYPES = new Set(['Donation']);

// Seed values used only the first time this runs, before donation-total.json
// exists. After that, the file on disk is the source of truth — edit it by
// hand (or delete it and restart) if you ever need to correct the total.
const SEED_RAISED = 45.14;
const SEED_GOAL = 450;

// Ko-fi retries a webhook delivery if your endpoint doesn't answer fast
// enough or errors out, so the same message_id can arrive more than once.
// Remembering the last few hundred ids we've already applied keeps a retry
// from getting double-counted.
const MAX_REMEMBERED_IDS = 500;

if (!VERIFICATION_TOKEN) {
  console.error('KOFI_VERIFICATION_TOKEN must be set — refusing to start without it.');
  process.exit(1);
}

function loadTotal() {
  try {
    const raw = fs.readFileSync(TOTAL_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.raised === 'number' && typeof parsed.goal === 'number') {
      if (!Array.isArray(parsed._processedIds)) parsed._processedIds = [];
      return parsed;
    }
  } catch (e) {
    // No file yet, or it's corrupt — fall through to a fresh seed.
  }
  return { raised: SEED_RAISED, goal: SEED_GOAL, currency: 'USD', updatedAt: null, _processedIds: [] };
}

function saveTotal(total) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o755 });
  const tmpFile = `${TOTAL_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(total, null, 2));
  fs.chmodSync(tmpFile, 0o644);
  fs.renameSync(tmpFile, TOTAL_FILE); // atomic — visitors never see a half-written file
}

function applyDonation(payload) {
  const total = loadTotal();

  if (payload.message_id && total._processedIds.includes(payload.message_id)) {
    console.log(`Skipping already-processed message_id ${payload.message_id}`);
    return total;
  }

  if (!COUNTED_TYPES.has(payload.type)) {
    console.log(`Ignoring webhook of type "${payload.type}" (not in COUNTED_TYPES)`);
    return total;
  }

  const amount = parseFloat(payload.amount);
  if (!Number.isFinite(amount)) {
    console.error(`Ignoring webhook with unparseable amount: ${payload.amount}`);
    return total;
  }

  total.raised = Math.round((total.raised + amount) * 100) / 100;
  total.currency = payload.currency || total.currency;
  total.updatedAt = new Date().toISOString();
  if (payload.message_id) {
    total._processedIds.push(payload.message_id);
    if (total._processedIds.length > MAX_REMEMBERED_IDS) {
      total._processedIds = total._processedIds.slice(-MAX_REMEMBERED_IDS);
    }
  }

  saveTotal(total);
  console.log(`Applied $${amount} donation — new total $${total.raised} of $${total.goal}`);
  return total;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== WEBHOOK_PATH) {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    // Ko-fi payloads are small; bail out if something is sending far more
    // than a legitimate webhook ever would.
    if (body.length > 1e6) req.destroy();
  });

  req.on('end', () => {
    try {
      const form = querystring.parse(body);
      const payload = JSON.parse(form.data);

      if (payload.verification_token !== VERIFICATION_TOKEN) {
        console.error('Rejected webhook with invalid verification_token');
        res.writeHead(401);
        res.end();
        return;
      }

      applyDonation(payload);
      res.writeHead(200);
      res.end('ok');
    } catch (e) {
      console.error('Failed to process webhook body:', e.message);
      res.writeHead(400);
      res.end();
    }
  });
});

server.listen(PORT, () => {
  console.log(`kofi-webhook listening on port ${PORT}, path ${WEBHOOK_PATH}, writing to ${TOTAL_FILE}`);
});
