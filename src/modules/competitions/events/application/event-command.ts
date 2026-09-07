import { createHash } from "node:crypto";

import type { CompetitionCommandActor } from "../../core";
import type { EventParticipantInput, EventSettings } from "../domain/event";

export type EventOwnerAuthorizationIntent = Readonly<{
  kind: "APPROVED_OWNER";
  ownerUserAccountId: string;
  playerId: string | null;
  requireApprovedAccount: true;
  requireOwnership: true;
  transactionRecheck: true;
}>;

export type EventAdminAuthorizationIntent = Readonly<{
  kind: "ADMIN_TOTP";
  minimumRole: "ADMIN";
  requireTotp: true;
  transactionRecheck: true;
}>;

type EventCommandMetadata<TActor extends CompetitionCommandActor, TAuthorization> = Readonly<{
  actor: TActor;
  authorizationIntent: TAuthorization;
  requestId: string;
  expectedRevision: number;
  idempotency: Readonly<{
    scope: string;
    keyHash: Uint8Array;
    requestFingerprint: Uint8Array;
  }>;
  issuedAt: string;
}>;

export type EventOwnerCommandMetadata = EventCommandMetadata<
  Extract<CompetitionCommandActor, { purpose: "ACCOUNT" }>,
  EventOwnerAuthorizationIntent
>;

export type EventAdminCommandMetadata = EventCommandMetadata<
  Extract<CompetitionCommandActor, { purpose: "ADMIN" }>,
  EventAdminAuthorizationIntent
>;

type OwnerCommand<Type extends string, Payload> = Readonly<{
  type: Type;
  eventId: string;
  metadata: EventOwnerCommandMetadata;
  payload: Payload;
}>;

type AdminCommand<Type extends string, Payload> = Readonly<{
  type: Type;
  eventId: string;
  metadata: EventAdminCommandMetadata;
  payload: Payload;
}>;

export type EventOwnerCommand =
  | OwnerCommand<"UPSERT_OWN_APPLICATION", Readonly<{ participantId: string; playerId: string; mainPosition: EventParticipantInput["mainPosition"]; subPositions: EventParticipantInput["subPositions"] }>>
  | OwnerCommand<"CANCEL_OWN_APPLICATION", Readonly<Record<string, never>>>;

export type EventAdminCommand =
  | AdminCommand<"CREATE_EVENT", Readonly<{ settings: EventSettings }>>
  | AdminCommand<"REPLACE_SETTINGS", Readonly<{ settings: EventSettings }>>
  | AdminCommand<"START_RECRUITMENT", Readonly<Record<string, never>>>
  | AdminCommand<"CLOSE_RECRUITMENT", Readonly<Record<string, never>>>
  | AdminCommand<"IMPORT_PARTICIPANTS", Readonly<{ participants: readonly EventParticipantInput[] }>>
  | AdminCommand<"ADD_PARTICIPANT", Readonly<{ participant: EventParticipantInput }>>
  | AdminCommand<"BUILD_TEAMS", Readonly<Record<string, never>>>
  | AdminCommand<"GENERATE_BRACKET", Readonly<Record<string, never>>>
  | AdminCommand<"RECORD_RESULT", Readonly<{ fixtureId: string; teamAScore: number; teamBScore: number; winnerTeamId: string }>>
  | AdminCommand<"CORRECT_RESULT", Readonly<{ fixtureId: string; teamAScore: number; teamBScore: number; winnerTeamId: string }>>
  | AdminCommand<"COMPLETE_EVENT", Readonly<{ mvpParticipantId: string | null }>>
  | AdminCommand<"CANCEL_EVENT", Readonly<{ reason: string }>>
  | AdminCommand<"RESTORE_EVENT", Readonly<Record<string, never>>>;

export type EventCommand = EventOwnerCommand | EventAdminCommand;

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

/** Server-derived fingerprint; raw idempotency keys never enter the command. */
export function eventCommandRequestFingerprint(command: EventCommand): Uint8Array {
  return createHash("sha256")
    .update(command.metadata.idempotency.scope)
    .update("\0")
    .update(canonicalJson({
      type: command.type,
      eventId: command.eventId,
      expectedRevision: command.metadata.expectedRevision,
      payload: command.payload,
    }))
    .digest();
}
