import { createHash } from "node:crypto";

import type { RiotAuthorizationIntent, RiotReceiptIdentity } from "./ports";

export type RiotCommandContext = Readonly<{
  principalId: string;
  requestId: string;
  issuedAt: string;
  authorizationIntent: RiotAuthorizationIntent;
  idempotencyKeyMaterial: Uint8Array;
  bodyDigestHex: string;
}>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function riotReceiptIdentity(
  context: RiotCommandContext,
  scope: string,
  safeRequest: Readonly<Record<string, unknown>>,
): RiotReceiptIdentity {
  if (!/^[a-f0-9]{64}$/u.test(context.bodyDigestHex)) throw new Error("INVALID_RIOT_BODY_DIGEST");
  if (!(context.idempotencyKeyMaterial instanceof Uint8Array) || context.idempotencyKeyMaterial.byteLength < 16) {
    throw new Error("INVALID_RIOT_IDEMPOTENCY_KEY");
  }
  const keyHash = createHash("sha256")
    .update("klol-v2:riot-idempotency-key:v1\0")
    .update(context.idempotencyKeyMaterial)
    .digest();
  const requestHash = createHash("sha256")
    .update("klol-v2:riot-command:v1\0")
    .update(scope)
    .update("\0")
    .update(context.bodyDigestHex)
    .update("\0")
    .update(canonicalJson(safeRequest))
    .digest();
  return { principalId: context.principalId, scope, keyHash, requestHash, bodyDigestHex: context.bodyDigestHex };
}
