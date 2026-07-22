import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v1";
const MIN_KEY_LENGTH = 32;

function getEncryptionKey() {
  const source = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (!source || source.length < MIN_KEY_LENGTH) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters`,
    );
  }

  return crypto
    .createHash("sha256")
    .update("k-lol-gg:totp-secret:v1\0", "utf8")
    .update(source, "utf8")
    .digest();
}

export function isEncryptedTotpSecret(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

export function encryptTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptTotpSecret(stored: string) {
  if (!isEncryptedTotpSecret(stored)) {
    // 기존 평문 레코드는 정상 로그인 후 암호화 값으로 자동 교체한다.
    return stored;
  }

  const parts = stored.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Invalid encrypted TOTP secret format");
  }

  const iv = Buffer.from(parts[2], "base64url");
  const authTag = Buffer.from(parts[3], "base64url");
  const ciphertext = Buffer.from(parts[4], "base64url");
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Invalid encrypted TOTP secret payload");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
