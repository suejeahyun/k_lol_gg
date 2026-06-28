import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

function normalizeBase32(value: string) {
  return value.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
}

function decodeBase32(value: string): Buffer {
  const normalized = normalizeBase32(value);
  let bits = "";

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 secret");
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

function encodeBase32(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }

  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return output;
}

function hotp(secret: string, counter: number) {
  const key = decodeBase32(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const token = binary % 10 ** TOTP_DIGITS;
  return token.toString().padStart(TOTP_DIGITS, "0");
}

export function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

export function getTotpStep(now = Date.now()) {
  return Math.floor(now / 1000 / TOTP_STEP_SECONDS);
}

export function verifyTotpCode(secret: string | null | undefined, code: string | null | undefined, options?: { window?: number }) {
  if (!secret || !code) return { ok: false as const };

  const normalizedCode = String(code).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalizedCode)) return { ok: false as const };

  const window = options?.window ?? 1;
  const currentStep = getTotpStep();

  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;
    if (hotp(secret, step) === normalizedCode) {
      return { ok: true as const, step };
    }
  }

  return { ok: false as const };
}

export function buildTotpOtpAuthUrl(params: { secret: string; accountName: string; issuer?: string }) {
  const issuer = params.issuer || "K-LOL.GG";
  const label = `${issuer}:${params.accountName}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}
