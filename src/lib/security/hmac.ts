import crypto from "crypto";
import { NextRequest } from "next/server";

const DEFAULT_TOLERANCE_SECONDS = 300;

export function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function safeEqualText(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createHmacSignature(params: {
  secret: string;
  timestamp: string | number;
  body: string;
}) {
  return crypto
    .createHmac("sha256", params.secret)
    .update(`${params.timestamp}.${params.body}`, "utf8")
    .digest("hex");
}

export function verifySignedRequest(params: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  toleranceSeconds?: number;
}) {
  const timestamp = String(params.timestamp ?? "").trim();
  const signature = String(params.signature ?? "").trim().toLowerCase();

  if (!timestamp || !signature) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

  const unixSeconds = Number(timestamp);
  if (!Number.isFinite(unixSeconds)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - unixSeconds) > tolerance) return false;

  const expected = createHmacSignature({
    secret: params.secret,
    timestamp,
    body: params.body,
  });

  return safeEqualHex(expected, signature);
}

export async function readRequestBodyForSignature(req: NextRequest) {
  const clone = req.clone();
  return await clone.text().catch(() => "");
}
