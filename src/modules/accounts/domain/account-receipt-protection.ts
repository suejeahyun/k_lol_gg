import { createHmac } from "node:crypto";

function protect(
  pepper: Uint8Array,
  domain: "principal" | "request",
  scope: string,
  value: string,
): Buffer {
  return createHmac("sha256", pepper)
    .update(`klol-v2:account-receipt:${domain}:v1\0`, "utf8")
    .update(scope, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest();
}

export function protectAccountReceiptMaterial(
  pepper: Uint8Array,
  scope: string,
  principalKey: string,
  requestFingerprintValue: string,
): Readonly<{ principalKeyMaterial: Buffer; requestFingerprint: string }> {
  return {
    principalKeyMaterial: protect(pepper, "principal", scope, principalKey),
    requestFingerprint: protect(pepper, "request", scope, requestFingerprintValue).toString(
      "base64url",
    ),
  };
}
