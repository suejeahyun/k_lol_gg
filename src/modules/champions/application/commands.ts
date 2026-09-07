import { createHash } from "node:crypto";

import type { ChampionStatus } from "../domain/champion";

export type ChampionCommandMetadata = Readonly<{
  actorPrincipalId: string;
  sessionId: string;
  requestId: string;
  expectedRevision: number;
  issuedAt: string;
  authorizationIntent: Readonly<{
    kind: "ADMIN_TOTP";
    sessionId: string;
    minimumRole: "ADMIN";
    requireTotp: true;
    transactionRecheck: true;
  }>;
  idempotency: Readonly<{
    scope: string;
    keyHash: Uint8Array;
    requestHash: Uint8Array;
    bodyDigestHex: string;
  }>;
}>;

export type ChampionCommand =
  | Readonly<{
      type: "CREATE_CHAMPION";
      championKey: string;
      metadata: ChampionCommandMetadata;
      payload: Readonly<{ displayName: string }>;
    }>
  | Readonly<{
      type: "UPDATE_CHAMPION";
      championKey: string;
      metadata: ChampionCommandMetadata;
      payload: Readonly<{ displayName?: string; status?: ChampionStatus }>;
    }>
  | Readonly<{
      type: "DEACTIVATE_CHAMPION";
      championKey: string;
      metadata: ChampionCommandMetadata;
      payload: Readonly<Record<string, never>>;
    }>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function championCommandRequestHash(command: ChampionCommand): Uint8Array {
  return createHash("sha256")
    .update("klol-v2:champion-command:v1\0")
    .update(command.metadata.idempotency.scope)
    .update("\0")
    .update(command.metadata.idempotency.bodyDigestHex)
    .update("\0")
    .update(canonicalJson({
      type: command.type,
      championKey: command.championKey,
      expectedRevision: command.metadata.expectedRevision,
      payload: command.payload,
    }))
    .digest();
}

export function hashChampionRequestKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(value)) throw new Error("INVALID_CHAMPION_REQUEST_KEY");
  return createHash("sha256").update("klol-v2:champion-request-key:v1\0").update(value).digest();
}
