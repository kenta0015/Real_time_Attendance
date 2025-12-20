import * as Crypto from "expo-crypto";

export const PERIOD_SEC = 45;

export const currentSlot = (periodSec = PERIOD_SEC) =>
  Math.floor(Date.now() / 1000 / periodSec);

async function sha256Hex(s: string): Promise<string> {
  const h = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    s
  );
  return h.toLowerCase();
}

export async function makeToken(
  secret: string,
  eventId: string,
  userId: string,
  slot: number
): Promise<string> {
  const payload = `v1|${eventId}|${userId}|${slot}|${secret}`;
  const h = await sha256Hex(payload); // 64桁
  // 生成は64桁を埋める（互換検証は verify 側で対応）
  return `v1|${eventId}|${userId}|${slot}|${h}`;
}

export async function verifyToken(
  secret: string,
  token: string
): Promise<null | { eventId: string; userId: string; slot: number }> {
  const parts = token?.trim().split("|");
  if (!parts || parts.length !== 5) return null;
  const [v, eventId, userId, slotStr, hRaw] = parts;
  if (v !== "v1") return null;
  const slot = Number(slotStr);
  if (!Number.isFinite(slot)) return null;

  const payload = `v1|${eventId}|${userId}|${slot}|${secret}`;
  const full = await sha256Hex(payload); // 64桁
  const h = hRaw.trim().toLowerCase();

  const ok =
    h === full ||
    (h.length === 32 && (h === full.slice(0, 32) || h === full.slice(-32))) ||
    (h.length === 16 && (h === full.slice(0, 16) || h === full.slice(-16)));

  if (!ok) return null;
  return { eventId, userId, slot };
}




