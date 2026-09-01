import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type { TotpCredentialRecord } from "../domain/auth-records";
import type { TotpEncryptionKeyring } from "./versioned-secret-keyring";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

type TotpEnvelopeFingerprintInput = Pick<
  TotpCredentialRecord,
  "userAccountId" | "secretCiphertext" | "secretIv" | "secretAuthTag" | "keyVersion"
>;

function lengthPrefix(value: Uint8Array): Buffer {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(value.byteLength);
  return prefix;
}

function aad(userAccountId: string, keyVersion: number): Buffer {
  return Buffer.from(`klol-v2:totp:${userAccountId}:${keyVersion}`, "utf8");
}

function keyForVersion(keyring: TotpEncryptionKeyring, keyVersion: number): Buffer {
  const key = keyring.keys.get(keyVersion);
  if (!key || key.byteLength !== 32) {
    throw new Error("TOTP encryption key is unavailable.");
  }
  return Buffer.from(key);
}

export function decryptTotpSecret(
  credential: TotpCredentialRecord,
  keyring: TotpEncryptionKeyring,
): string {
  if (credential.secretIv.byteLength !== IV_BYTES || credential.secretAuthTag.byteLength !== AUTH_TAG_BYTES) {
    throw new Error("TOTP credential envelope is invalid.");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      keyForVersion(keyring, credential.keyVersion),
      credential.secretIv,
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAAD(aad(credential.userAccountId, credential.keyVersion));
    decipher.setAuthTag(credential.secretAuthTag);
    const plaintext = Buffer.concat([
      decipher.update(credential.secretCiphertext),
      decipher.final(),
    ]).toString("utf8");

    if (!/^[A-Z2-7]{32,256}$/.test(plaintext)) {
      throw new Error("TOTP plaintext format is invalid.");
    }
    return plaintext;
  } catch {
    throw new Error("TOTP credential could not be decrypted.");
  }
}

export function encryptTotpSecret(
  userAccountId: string,
  secret: string,
  keyring: TotpEncryptionKeyring,
): Pick<TotpCredentialRecord, "secretCiphertext" | "secretIv" | "secretAuthTag" | "keyVersion"> {
  if (!/^[A-Z2-7]{32,256}$/.test(secret)) {
    throw new Error("TOTP secret format is invalid.");
  }

  const keyVersion = keyring.currentKeyVersion;
  const secretIv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyForVersion(keyring, keyVersion), secretIv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(aad(userAccountId, keyVersion));
  const secretCiphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const secretAuthTag = cipher.getAuthTag();

  return { secretCiphertext, secretIv, secretAuthTag, keyVersion };
}

export function fingerprintTotpCredential(
  credential: TotpEnvelopeFingerprintInput,
): Buffer {
  const accountId = Buffer.from(credential.userAccountId, "utf8");
  const keyVersion = Buffer.alloc(8);
  keyVersion.writeBigUInt64BE(BigInt(credential.keyVersion));
  const values = [
    accountId,
    Buffer.from(credential.secretCiphertext),
    Buffer.from(credential.secretIv),
    Buffer.from(credential.secretAuthTag),
    keyVersion,
  ];
  const hash = createHash("sha256").update("klol-v2:totp-envelope-fingerprint:v1\0", "utf8");
  for (const value of values) hash.update(lengthPrefix(value)).update(value);
  return hash.digest();
}
