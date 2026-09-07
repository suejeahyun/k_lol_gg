import { createHash } from "node:crypto";

export type DisciplineCommandAction = "SUBMIT_EVIDENCE" | "REVIEW_EVIDENCE";

export type DisciplineAuthorizationIntent =
  | Readonly<{
      kind: "ACCOUNT_SESSION";
      sessionId: string;
      role: "USER" | "ADMIN" | "SUPER_ADMIN";
      authVersion: number;
      transactionRecheck: true;
    }>
  | Readonly<{
      kind: "ADMIN_TOTP";
      sessionId: string;
      minimumRole: "ADMIN" | "SUPER_ADMIN";
      authVersion: number;
      requireTotp: true;
      transactionRecheck: true;
    }>;

export type DisciplineCommandMetadata = Readonly<{
  principalId: string;
  requestId: string;
  expectedRevision: number;
  issuedAt: string;
  authorizationIntent: DisciplineAuthorizationIntent;
  idempotency: Readonly<{
    scope: string;
    keyHash: Uint8Array;
    requestHash: Uint8Array;
    bodyDigestHex: string;
  }>;
}>;

export type DisciplineCommand =
  | Readonly<{
      type: "SUBMIT_EVIDENCE";
      taskId: string;
      metadata: DisciplineCommandMetadata;
      payload: Readonly<{ privateAssetId: string }>;
    }>
  | Readonly<{
      type: "REVIEW_EVIDENCE";
      taskId: string;
      metadata: DisciplineCommandMetadata;
      payload: Readonly<{ decision: "APPROVE" | "REJECT" | "CANCEL"; reviewNote: string }>;
    }>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function disciplineCommandRequestHash(command: DisciplineCommand): Uint8Array {
  return createHash("sha256")
    .update("klol-v2:discipline-command:v1\0")
    .update(command.metadata.idempotency.scope)
    .update("\0")
    .update(command.metadata.idempotency.bodyDigestHex)
    .update("\0")
    .update(canonicalJson({
      type: command.type,
      taskId: command.taskId,
      expectedRevision: command.metadata.expectedRevision,
      payload: command.payload,
    }))
    .digest();
}

export function hashDisciplineRequestKey(requestKey: string): Uint8Array {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(requestKey)) {
    throw new Error("INVALID_DISCIPLINE_REQUEST_KEY");
  }
  return createHash("sha256")
    .update("klol-v2:discipline-request-key:v1\0")
    .update(requestKey)
    .digest();
}
