const crypto = require("crypto");

const eventId = process.env.EVENT;
const secret  = process.env.SECRET;
if (!eventId || !secret) {
  console.error("Missing ENV: EVENT or SECRET");
  process.exit(1);
}

// ?????(?: 2025-10-25 14:27  "XXXXX")
const slot = Math.floor(Date.now() / 60000).toString();

// ??: sha256("eventId|slot|secret")
const sig   = crypto.createHash("sha256").update(`${eventId}|${slot}|${secret}`).digest("hex");
const token = `v1|${eventId}|${slot}|${sig}`;

// URL ???????????(%7C)
const url   = `rta://checkin?token=${encodeURIComponent(token)}`;
console.log(url);
