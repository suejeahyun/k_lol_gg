import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordVerifier } from "../application/ports/password-verifier";

const KEY_LENGTH = 64;
const FORMAT_PREFIX = "scrypt-v1";

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `${FORMAT_PREFIX}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [prefix, encodedSalt, encodedKey] = passwordHash.split("$");
  if (prefix !== FORMAT_PREFIX || !encodedSalt || !encodedKey) return false;

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedKey = Buffer.from(encodedKey, "base64url");
    if (salt.byteLength !== 16 || expectedKey.byteLength !== KEY_LENGTH) return false;
    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | undefined;

export class NodePasswordVerifier implements PasswordVerifier {
  async verify(password: string, passwordHash: string | null): Promise<boolean> {
    dummyHashPromise ??= hashPassword("synthetic-dummy-password-not-an-account");
    const dummyHash = await dummyHashPromise;
    return verifyPassword(password, passwordHash ?? dummyHash);
  }
}
