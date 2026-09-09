import { createHash } from "node:crypto";

import type { RecruitMember, RecruitPartyType, ScrimLineup } from "../domain/recruiting";
import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

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
  | Readonly<{ kind: "ACCOUNT"; principalId: string; sessionActor: TransactionSessionActor; authorizationIntent: Readonly<{ kind: "APPROVED_ACCOUNT"; transactionRecheck: true }> }>
  | Readonly<{ kind: "ADMIN"; principalId: string; sessionActor: TransactionSessionActor; authorizationIntent: RecruitingAdminAuthorizationIntent }>
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
  | Command<"CREATE_PARTY", Readonly<{ recruitDate: string; resetSequence: number; recruitNumber: number; partyType: RecruitPartyType; title: string; maximumMembers: number; members: readonly RecruitMember[]; startTimeText?: string | null; gameInfo?: string | null; scheduledStartAt: string | null; protectedUntil: string | null }>>
  | Command<"SYNC_PARTY", Readonly<{ members: readonly RecruitMember[]; startTimeText?: string | null; gameInfo?: string | null; scheduledStartAt?: string | null }>>
  | Command<"GET_PARTY_STATUS", Readonly<Record<string, never>>>
  | Command<"FINISH_PARTY", Readonly<Record<string, never>>>
  | Command<"CANCEL_PARTY", Readonly<Record<string, never>>>
  | Command<"RESET_PARTY", Readonly<Record<string, never>>>;

export type ScrimFormCommandPayload = Readonly<{
      recruitDate: string;
      scrimNumber: number;
      tournamentId: string | null;
      legacyTournamentNumber?: number | null;
      requesterTeamId: string | null;
      title?: string | null;
      requesterTeamName?: string | null;
      opponentTeamName?: string | null;
      requesterLineup?: ScrimLineup | null;
      opponentLineup?: ScrimLineup | null;
      memo?: string | null;
      seriesRuleText?: string | null;
      scheduledAt: string | null;
      bestOf: number;
    }>;

export type SyncScrimCommandPayload = Readonly<{
  recruitDate: string;
  scrimNumber: number;
  tournamentId: string | null;
  legacyTournamentNumber: number | null;
  requesterTeamId: string | null;
  opponentTeamId?: string | null;
  title: string | null;
  requesterTeamName: string | null;
  opponentTeamName: string | null;
  requesterLineup: ScrimLineup | null;
  opponentLineup: ScrimLineup | null;
  memo: string | null;
  seriesRuleText: string | null;
  scheduledAt: string | null;
  bestOf: number;
}>;

export type ScrimCommand =
  | Command<"CREATE_SCRIM", ScrimFormCommandPayload>
  | Command<"SYNC_SCRIM", SyncScrimCommandPayload>
  | Command<"JOIN_SCRIM", Readonly<{ opponentTeamId: string }>>
  | Command<"REOPEN_SCRIM", Readonly<Record<string, never>>>
  | Command<"CONFIRM_SCRIM", Readonly<Record<string, never>>>
  | Command<"COMPLETE_SCRIM", Readonly<Record<string, never>>>
  | Command<"CANCEL_SCRIM", Readonly<Record<string, never>>>;

export type RecruitingCommand = PartyCommand | ScrimCommand;

export type KakaoRecruitCommandAccess = "PUBLIC_CREATE" | "PUBLIC_READ" | "PUBLIC_JOIN" | "OWNER_OR_MANAGER" | "ADMIN" | "DENY";

/** Server-side policy for commands received through the signed Kakao webhook. */
export function kakaoRecruitCommandAccess(type: RecruitingCommand["type"]): KakaoRecruitCommandAccess {
  if (type === "CREATE_PARTY" || type === "CREATE_SCRIM") return "PUBLIC_CREATE";
  if (type === "GET_PARTY_STATUS") return "PUBLIC_READ";
  if (type === "JOIN_SCRIM") return "PUBLIC_JOIN";
  if (type === "RESET_PARTY") return "DENY";
  if (type === "CANCEL_PARTY" || type === "CANCEL_SCRIM" || type === "REOPEN_SCRIM") return "ADMIN";
  return "OWNER_OR_MANAGER";
}

const COMMAND_SCOPE_SUFFIX: Readonly<Record<RecruitingCommand["type"], string>> = {
  CREATE_PARTY: "recruiting:party:create",
  SYNC_PARTY: "recruiting:party:sync",
  GET_PARTY_STATUS: "recruiting:party:status",
  FINISH_PARTY: "recruiting:party:finish",
  CANCEL_PARTY: "recruiting:party:cancel",
  RESET_PARTY: "recruiting:party:reset",
  CREATE_SCRIM: "recruiting:scrim:create",
  SYNC_SCRIM: "recruiting:scrim:sync",
  JOIN_SCRIM: "recruiting:scrim:join",
  REOPEN_SCRIM: "recruiting:scrim:reopen",
  CONFIRM_SCRIM: "recruiting:scrim:confirm",
  COMPLETE_SCRIM: "recruiting:scrim:complete",
  CANCEL_SCRIM: "recruiting:scrim:cancel",
};

export function recruitingCommandScope(actorKind: RecruitingCommandActor["kind"], type: RecruitingCommand["type"]) {
  if (type === "RESET_PARTY") return "admin:recruiting:party:reset";
  return `${actorKind === "ACCOUNT" ? "account" : actorKind === "ADMIN" ? "admin" : "bot"}:${COMMAND_SCOPE_SUFFIX[type]}`;
}

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function recruitingCommandRequestFingerprint(command: RecruitingCommand): Uint8Array {
  const actorBinding = command.metadata.actor.kind === "BOT"
    ? command.metadata.actor.authorizationIntent.deliveryId ? {
        kind: command.metadata.actor.kind,
        principalId: command.metadata.actor.principalId,
        roomId: command.metadata.actor.authorizationIntent.roomId,
        deliveryId: command.metadata.actor.authorizationIntent.deliveryId,
      } : {
        kind: command.metadata.actor.kind,
        principalId: command.metadata.actor.principalId,
        roomId: command.metadata.actor.authorizationIntent.roomId,
        senderId: command.metadata.actor.authorizationIntent.senderId,
      }
    : { kind: command.metadata.actor.kind, principalId: command.metadata.actor.principalId };
  return createHash("sha256")
    .update("klol-v2:recruiting-command:v3\0")
    .update(command.metadata.idempotency.scope)
    .update("\0")
    .update(command.metadata.idempotency.bodyDigestHex)
    .update("\0")
    .update(canonicalJson({ actorBinding, type: command.type, aggregateId: command.aggregateId, expectedRevision: command.metadata.expectedRevision, payload: command.payload }))
    .digest();
}

export function sealRecruitingCommand<T extends RecruitingCommand>(command: T): T {
  return {
    ...command,
    metadata: {
      ...command.metadata,
      idempotency: {
        ...command.metadata.idempotency,
        requestFingerprint: recruitingCommandRequestFingerprint(command),
      },
    },
  };
}

/** Raw request keys are accepted only at the adapter boundary and persisted as this domain-separated digest. */
export function hashRecruitingRequestKey(requestKey: string): Uint8Array {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(requestKey)) throw new Error("INVALID_RECRUIT_REQUEST_KEY");
  return createHash("sha256").update("klol-v2:recruiting-request-key:v1\0").update(requestKey).digest();
}
