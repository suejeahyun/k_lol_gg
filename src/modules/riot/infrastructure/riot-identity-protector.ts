import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import type { RiotIdentityProtectorPort } from "../application/ports";
import type { RiotIdentity } from "../application/ports";

type Keyring = Readonly<{
  current: string;
  keys: ReadonlyMap<string, Buffer>;
}>;

const keyIdPattern = /^[A-Za-z0-9_-]{1,32}$/u;
const protectedPattern = /^r1\.([A-Za-z0-9_-]{1,32})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;

function decodeCanonicalBase64url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("INVALID_RIOT_ENCRYPTION_KEY");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value || decoded.byteLength !== 32) {
    throw new Error("INVALID_RIOT_ENCRYPTION_KEY");
  }
  return decoded;
}

export function parseRiotEncryptionKeyring(serialized: string): Keyring {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch { throw new Error("INVALID_RIOT_ENCRYPTION_KEYRING"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_RIOT_ENCRYPTION_KEYRING");
  }
  const record = parsed as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !["current", "keys"].includes(key)) ||
    typeof record.current !== "string" ||
    !keyIdPattern.test(record.current) ||
    !record.keys ||
    typeof record.keys !== "object" ||
    Array.isArray(record.keys)
  ) throw new Error("INVALID_RIOT_ENCRYPTION_KEYRING");
  const entries = Object.entries(record.keys as Record<string, unknown>);
  if (!entries.length || entries.length > 8) throw new Error("INVALID_RIOT_ENCRYPTION_KEYRING");
  const keys = new Map<string, Buffer>();
  for (const [keyId, encoded] of entries) {
    if (!keyIdPattern.test(keyId) || typeof encoded !== "string") {
      throw new Error("INVALID_RIOT_ENCRYPTION_KEYRING");
    }
    keys.set(keyId, decodeCanonicalBase64url(encoded));
  }
  if (!keys.has(record.current)) throw new Error("INVALID_RIOT_ENCRYPTION_KEYRING");
  return Object.freeze({ current: record.current, keys });
}

function validPuuid(value: string): boolean {
  return value.length >= 8 && value.length <= 128 && !/[\u0000-\u001f\u007f\s]/u.test(value);
}

function validIdentity(value: unknown): value is RiotIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const identity = value as Record<string, unknown>;
  return Object.keys(identity).length === 3 &&
    typeof identity.gameName === "string" && identity.gameName.length >= 1 && identity.gameName.length <= 16 &&
    typeof identity.tagLine === "string" && identity.tagLine.length >= 1 && identity.tagLine.length <= 5 &&
    typeof identity.puuid === "string" && validPuuid(identity.puuid);
}

export class RiotAesGcmIdentityProtector implements RiotIdentityProtectorPort {
  constructor(private readonly keyring: Keyring) {}

  currentKeyId(): string { return this.keyring.current; }

  async protect(puuid: string): Promise<string> {
    if (!validPuuid(puuid)) throw new Error("INVALID_RIOT_PUUID");
    return this.encrypt("puuid", puuid);
  }

  async reveal(protectedPuuid: string): Promise<string> {
    const puuid = this.decrypt("puuid", protectedPuuid);
    if (!validPuuid(puuid)) throw new Error("INVALID_RIOT_PUUID_CIPHERTEXT");
    return puuid;
  }

  protectRsoIdentity(input: Readonly<{
    stateId: string;
    codeDigestHex: string;
    identity: RiotIdentity;
  }>): Readonly<{ keyId: string; protectedIdentity: string }> {
    if (!/^[a-f0-9]{64}$/u.test(input.codeDigestHex) || !validIdentity(input.identity)) {
      throw new Error("INVALID_RIOT_RSO_IDENTITY");
    }
    return {
      keyId: this.keyring.current,
      protectedIdentity: this.encrypt(
        `rso:${input.stateId}:${input.codeDigestHex}`,
        JSON.stringify({
          gameName: input.identity.gameName,
          tagLine: input.identity.tagLine,
          puuid: input.identity.puuid,
        }),
      ),
    };
  }

  revealRsoIdentity(input: Readonly<{
    stateId: string;
    codeDigestHex: string;
    protectedIdentity: string;
  }>): RiotIdentity {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.decrypt(
        `rso:${input.stateId}:${input.codeDigestHex}`,
        input.protectedIdentity,
      ));
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_RIOT_RSO_IDENTITY") throw error;
      throw new Error("INVALID_RIOT_RSO_IDENTITY");
    }
    if (!validIdentity(parsed)) throw new Error("INVALID_RIOT_RSO_IDENTITY");
    return { gameName: parsed.gameName, tagLine: parsed.tagLine, puuid: parsed.puuid };
  }

  private encrypt(purpose: string, plaintext: string): string {
    const keyId = this.keyring.current;
    const key = this.keyring.keys.get(keyId);
    if (!key) throw new Error("INVALID_RIOT_ENCRYPTION_KEYRING");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(`klol-v2:riot:${purpose}:r1\0${keyId}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["r1", keyId, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
  }

  private decrypt(purpose: string, protectedValue: string): string {
    const match = protectedPattern.exec(protectedValue);
    if (!match) throw new Error("INVALID_RIOT_PUUID_CIPHERTEXT");
    const [, keyId, ivEncoded, ciphertextEncoded, tagEncoded] = match;
    const key = this.keyring.keys.get(keyId!);
    if (!key) throw new Error("INVALID_RIOT_PUUID_CIPHERTEXT");
    try {
      const iv = Buffer.from(ivEncoded!, "base64url");
      const ciphertext = Buffer.from(ciphertextEncoded!, "base64url");
      const tag = Buffer.from(tagEncoded!, "base64url");
      if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength < 1) {
        throw new Error("INVALID_RIOT_PUUID_CIPHERTEXT");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(`klol-v2:riot:${purpose}:r1\0${keyId}`, "utf8"));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new Error("INVALID_RIOT_PUUID_CIPHERTEXT");
    }
  }
}
