import * as Crypto from "expo-crypto";

export const PERIOD_SEC = 45;

export const currentSlot = (periodSec = PERIOD_SEC) =>
  Math.floor(Date.now() / 1000 / periodSec);

export async function makeToken(
  secret: string,
  eventId: string,
  userId: string,
  slot: number
): Promise<string> {
  const msg = `v1|${eventId}|${userId}|${slot}|${secret}`;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    msg
  );
  // shorten for QR density
  return `v1|${eventId}|${userId}|${slot}|${hash.slice(0, 16)}`;
}

export async function verifyToken(
  secret: string,
  token: string
): Promise<null | { eventId: string; userId: string; slot: number }> {
  const parts = token.split("|");
  if (parts.length !== 5) return null;
  const [v, eventId, userId, slotStr, h] = parts;
  if (v !== "v1") return null;
  const slot = Number(slotStr);
  if (!Number.isFinite(slot)) return null;
  const expected = await makeToken(secret, eventId, userId, slot);
  if (expected.split("|")[4] !== h) return null;
  return { eventId, userId, slot };
}
