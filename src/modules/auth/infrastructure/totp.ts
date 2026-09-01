import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TotpVerifier } from "../application/ports/totp-verifier";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

function encodeBase32(bytes: Uint8Array): string {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");

  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

function decodeBase32(rawSecret: string): Buffer {
  const secret = rawSecret.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";

  for (const character of secret) {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value < 0) throw new Error("Invalid base32 secret.");
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  if (bytes.length < 20) throw new Error("TOTP secret is too short.");
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

function safeCodeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer);
}

export class Rfc6238TotpVerifier implements TotpVerifier {
  constructor(
    private readonly now: () => number = Date.now,
    private readonly window = 1,
  ) {}

  verify(secret: string, code: string): { ok: true; step: number } | { ok: false } {
    if (!/^\d{6}$/.test(code)) return { ok: false };
    const currentStep = Math.floor(this.now() / 1000 / STEP_SECONDS);

    try {
      for (let offset = -this.window; offset <= this.window; offset += 1) {
        const step = currentStep + offset;
        if (step >= 0 && safeCodeEqual(generateTotpCode(secret, step), code)) {
          return { ok: true, step };
        }
      }
    } catch {
      return { ok: false };
    }

    return { ok: false };
  }
}
