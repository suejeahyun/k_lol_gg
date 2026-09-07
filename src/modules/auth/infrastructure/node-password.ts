import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
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

async function verifyScryptPassword(password: string, passwordHash: string): Promise<boolean> {
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

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export type PasswordHashFormat = "BCRYPT" | "SCRYPT" | "UNKNOWN";

export function identifyPasswordHash(passwordHash: string | null): PasswordHashFormat {
  if (!passwordHash) return "UNKNOWN";
  if (passwordHash.startsWith(`${FORMAT_PREFIX}$`)) return "SCRYPT";
  if (BCRYPT_HASH_PATTERN.test(passwordHash)) return "BCRYPT";
  return "UNKNOWN";
}

let dummyHashPromise: Promise<string> | undefined;

export async function verifyPasswordHashConstantWork(
  password: string,
  passwordHash: string | null,
): Promise<Readonly<{ format: PasswordHashFormat; matches: boolean }>> {
  const format = identifyPasswordHash(passwordHash);
  dummyHashPromise ??= hashPassword("synthetic-dummy-password-not-an-account");
  const candidateHash = format === "UNKNOWN" ? await dummyHashPromise : passwordHash;
  const verification = await verifyPasswordHash(password, candidateHash);
  return {
    format,
    matches: format !== "UNKNOWN" && verification.matches,
  };
}

export async function verifyPasswordHash(
  password: string,
  passwordHash: string | null,
): Promise<Readonly<{ format: PasswordHashFormat; matches: boolean }>> {
  const format = identifyPasswordHash(passwordHash);
  if (!passwordHash || format === "UNKNOWN") {
    return { format, matches: false };
  }
  if (format === "SCRYPT") {
    return { format, matches: await verifyScryptPassword(password, passwordHash) };
  }
  try {
    return { format, matches: await bcrypt.compare(password, passwordHash) };
  } catch {
    return { format, matches: false };
  }
}

export class NodePasswordVerifier implements PasswordVerifier {
  async verify(password: string, passwordHash: string | null): Promise<boolean> {
    const verification = await verifyPasswordHashConstantWork(password, passwordHash);
    return verification.matches;
  }
}
