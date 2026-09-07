import { createHash } from "node:crypto";

import type { RecruitMember, RecruitPartyType } from "../domain/recruiting";
import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";

export type RecruitingAdminAuthorizationIntent = Readonly<{
  kind: "ADMIN_TOTP";
  minimumRole: "ADMIN" | "SUPER_ADMIN";
  requireTotp: true;
  transactionRecheck: true;
}>;

export type RecruitingJobAuthorizationIntent = Readonly<{
  kind: "SIGNED_JOB";
  jobName: string;
  timestampSeconds: number;
  nonce: string;
  bodyDigestHex: string;
  transactionRecheck: true;
}>;

export type RecruitingCommandActor =
  | Readonly<{ kind: "BOT"; principalId: string; authorizationIntent: VerifiedKakaoWebhookIntent }>
  | Readonly<{ kind: "ADMIN"; principalId: string; sessionId: string; authorizationIntent: RecruitingAdminAuthorizationIntent }>
  | Readonly<{ kind: "JOB"; principalId: string; authorizationIntent: RecruitingJobAuthorizationIntent }>;

export type RecruitingCommandMetadata = Readonly<{
  actor: RecruitingCommandActor;
  requestId: string;
  expectedRevision: number;
  issuedAt: string;
  idempotency: Readonly<{
    scope: string;
    keyHash: Uint8Array;
    requestFingerprint: Uint8Array;
    bodyDigestHex: string;
  }>;
}>;

type Command<Type extends string, Payload> = Readonly<{
  type: Type;
  aggregateId: string;
  metadata: RecruitingCommandMetadata;
  payload: Payload;
}>;

export type PartyCommand =
  | Command<"CREATE_PARTY", Readonly<{ recruitDate: string; resetSequence: number; recruitNumber: number; partyType: RecruitPartyType; title: string; maximumMembers: number; members: readonly RecruitMember[]; scheduledStartAt: string | null; protectedUntil: string | null }>>
  | Command<"SYNC_PARTY", Readonly<{ members: readonly RecruitMember[] }>>
  | Command<"GET_PARTY_STATUS", Readonly<Record<string, never>>>
  | Command<"FINISH_PARTY", Readonly<Record<string, never>>>
  | Command<"CANCEL_PARTY", Readonly<Record<string, never>>>
  | Command<"RESET_PARTY", Readonly<Record<string, never>>>;

export type ScrimCommand =
  | Command<"CREATE_SCRIM", Readonly<{ recruitDate: string; scrimNumber: number; tournamentId: string; requesterTeamId: string; scheduledAt: string | null; bestOf: number }>>
  | Command<"JOIN_SCRIM", Readonly<{ opponentTeamId: string }>>
  | Command<"REOPEN_SCRIM", Readonly<Record<string, never>>>
  | Command<"CONFIRM_SCRIM", Readonly<Record<string, never>>>
  | Command<"COMPLETE_SCRIM", Readonly<Record<string, never>>>
  | Command<"CANCEL_SCRIM", Readonly<Record<string, never>>>;

export type RecruitingCommand = PartyCommand | ScrimCommand;

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function recruitingCommandRequestFingerprint(command: RecruitingCommand): Uint8Array {
  return createHash("sha256")
    .update("klol-v2:recruiting-command:v1\0")
    .update(command.metadata.idempotency.scope)
    .update("\0")
    .update(command.metadata.idempotency.bodyDigestHex)
    .update("\0")
    .update(canonicalJson({ type: command.type, aggregateId: command.aggregateId, expectedRevision: command.metadata.expectedRevision, payload: command.payload }))
    .digest();
}

/** Raw request keys are accepted only at the adapter boundary and persisted as this domain-separated digest. */
export function hashRecruitingRequestKey(requestKey: string): Uint8Array {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(requestKey)) throw new Error("INVALID_RECRUIT_REQUEST_KEY");
  return createHash("sha256").update("klol-v2:recruiting-request-key:v1\0").update(requestKey).digest();
}
