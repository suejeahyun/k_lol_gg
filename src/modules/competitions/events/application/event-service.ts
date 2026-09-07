import { createHash } from "node:crypto";

import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { COMPETITION_POSITIONS } from "../../core";
import { EVENT_FORMATS, type EventParticipantInput, type EventSettings } from "../domain/event";
import { eventCommandRequestFingerprint, type EventAdminCommand, type EventCommand, type EventOwnerCommand } from "./event-command";
import { isEventUuid } from "./event-query";
import type { EventMutationResult } from "./ports";

export type EventCommandContext = Readonly<{
  actorSession: TransactionSessionActor;
  purpose: "ACCOUNT" | "ADMIN";
  requestId: string;
  idempotencyMaterial: Uint8Array;
}>;

type Handler = Readonly<{ handle(command: EventCommand): Promise<EventMutationResult> }>;

function record(value: unknown, allowed: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("INVALID_INPUT");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) throw new TypeError("INVALID_INPUT");
  return result;
}

function text(value: unknown, maximum: number, nullable = false): string | null {
  if (nullable && (value === null || value === "" || value === undefined)) return null;
  if (typeof value !== "string") throw new TypeError("INVALID_INPUT");
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new TypeError("INVALID_INPUT");
  return normalized;
}

function integer(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new TypeError("INVALID_INPUT");
  return value as number;
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !isEventUuid(value)) throw new TypeError("INVALID_INPUT");
  return value.toLocaleLowerCase("en-US");
}

function settings(value: unknown): EventSettings {
  const body = record(value, ["title", "description", "format", "recruitmentOpensAt", "recruitmentClosesAt", "bracketBestOf"]);
  const format = body.format;
  const bracketBestOf = integer(body.bracketBestOf, 1, 9);
  if (!EVENT_FORMATS.includes(format as never) || bracketBestOf % 2 === 0) throw new TypeError("INVALID_INPUT");
  return {
    title: text(body.title, 120)!,
    description: text(body.description, 2_000, true),
    format: format as EventSettings["format"],
    recruitmentOpensAt: text(body.recruitmentOpensAt, 40)!,
    recruitmentClosesAt: text(body.recruitmentClosesAt, 40)!,
    bracketBestOf,
  };
}

function preference(body: Record<string, unknown>, format?: EventSettings["format"]) {
  const mainPosition = body.mainPosition === null ? null : body.mainPosition;
  const subPositions = body.subPositions;
  if (!Array.isArray(subPositions) || subPositions.length > 4 || !subPositions.every((item) => COMPETITION_POSITIONS.includes(item as never))) {
    throw new TypeError("INVALID_INPUT");
  }
  if (format === "ARAM") return { mainPosition: null, subPositions: [] as const };
  if (!COMPETITION_POSITIONS.includes(mainPosition as never)) throw new TypeError("INVALID_INPUT");
  return { mainPosition: mainPosition as EventParticipantInput["mainPosition"], subPositions: subPositions as EventParticipantInput["subPositions"] };
}

function participant(value: unknown): EventParticipantInput {
  const body = record(value, ["participantId", "playerId", "mainPosition", "subPositions"]);
  return {
    id: uuid(body.participantId),
    playerId: uuid(body.playerId),
    ...preference(body),
  };
}

function adminPayload(value: unknown): Pick<EventAdminCommand, "type" | "payload"> {
  const input = record(value, ["type", "payload"]);
  const payload = input.payload ?? {};
  switch (input.type) {
    case "REPLACE_SETTINGS": return { type: input.type, payload: { settings: settings(record(payload, ["settings"]).settings) } };
    case "START_RECRUITMENT":
    case "CLOSE_RECRUITMENT":
    case "BUILD_TEAMS":
    case "GENERATE_BRACKET":
    case "RESTORE_EVENT":
      record(payload, []);
      return { type: input.type, payload: {} };
    case "IMPORT_PARTICIPANTS": {
      const body = record(payload, ["participants"]);
      if (!Array.isArray(body.participants) || body.participants.length < 1 || body.participants.length > 160) throw new TypeError("INVALID_INPUT");
      return { type: input.type, payload: { participants: body.participants.map(participant) } };
    }
    case "ADD_PARTICIPANT": return { type: input.type, payload: { participant: participant(record(payload, ["participant"]).participant) } };
    case "RECORD_RESULT":
    case "CORRECT_RESULT": {
      const body = record(payload, ["fixtureId", "teamAScore", "teamBScore", "winnerTeamId"]);
      return { type: input.type, payload: {
        fixtureId: text(body.fixtureId, 255)!,
        teamAScore: integer(body.teamAScore, 0, 9),
        teamBScore: integer(body.teamBScore, 0, 9),
        winnerTeamId: text(body.winnerTeamId, 255)!,
      } };
    }
    case "COMPLETE_EVENT": {
      const body = record(payload, ["mvpParticipantId"]);
      return { type: input.type, payload: { mvpParticipantId: body.mvpParticipantId === null ? null : text(body.mvpParticipantId, 180)! } };
    }
    case "CANCEL_EVENT": return { type: input.type, payload: { reason: text(record(payload, ["reason"]).reason, 500)! } };
    default: throw new TypeError("INVALID_INPUT");
  }
}

function baseMetadata(context: EventCommandContext, expectedRevision: number, scope: string) {
  const keyHash = createHash("sha256").update(context.idempotencyMaterial).digest();
  return {
    requestId: context.requestId,
    expectedRevision,
    idempotency: { scope, keyHash, requestFingerprint: new Uint8Array(32) },
    issuedAt: new Date().toISOString(),
  };
}

function adminMetadata(context: EventCommandContext, expectedRevision: number, scope: string) {
  return {
    ...baseMetadata(context, expectedRevision, scope),
    actor: { userAccountId: context.actorSession.userAccountId, sessionId: context.actorSession.sessionId, purpose: "ADMIN" as const, requiredRole: "ADMIN" as const, authVersion: context.actorSession.authVersion, sessionRole: context.actorSession.role },
    authorizationIntent: { kind: "ADMIN_TOTP" as const, minimumRole: "ADMIN" as const, requireTotp: true as const, transactionRecheck: true as const },
  };
}

function ownerMetadata(context: EventCommandContext, expectedRevision: number, scope: string, playerId: string | null) {
  return {
    ...baseMetadata(context, expectedRevision, scope),
    actor: { userAccountId: context.actorSession.userAccountId, sessionId: context.actorSession.sessionId, purpose: "ACCOUNT" as const, requiredRole: "USER" as const, authVersion: context.actorSession.authVersion, sessionRole: context.actorSession.role },
    authorizationIntent: { kind: "APPROVED_OWNER" as const, ownerUserAccountId: context.actorSession.userAccountId, playerId, requireApprovedAccount: true as const, requireOwnership: true as const, transactionRecheck: true as const },
  };
}

function fingerprint<T extends EventCommand>(command: T): T {
  return { ...command, metadata: { ...command.metadata, idempotency: { ...command.metadata.idempotency, requestFingerprint: eventCommandRequestFingerprint(command) } } };
}

export class EventService {
  constructor(private readonly handler: Handler) {}

  create(context: EventCommandContext, body: unknown) {
    if (context.purpose !== "ADMIN") throw new TypeError("FORBIDDEN");
    const input = record(body, ["eventId", "settings"]);
    const eventId = uuid(input.eventId);
    const initial = {
      type: "CREATE_EVENT",
      eventId,
      metadata: adminMetadata(context, 0, "admin:event:create"),
      payload: { settings: settings(input.settings) },
    } as const satisfies Extract<EventAdminCommand, { type: "CREATE_EVENT" }>;
    const command = fingerprint(initial);
    return this.handler.handle(command);
  }

  executeAdmin(context: EventCommandContext, eventId: string, expectedRevision: number, body: unknown) {
    if (context.purpose !== "ADMIN") throw new TypeError("FORBIDDEN");
    const action = adminPayload(body);
    const command = fingerprint({
      ...action,
      eventId: uuid(eventId),
      metadata: adminMetadata(context, expectedRevision, `admin:event:${action.type.toLocaleLowerCase("en-US")}`),
    } as EventAdminCommand);
    return this.handler.handle(command);
  }

  upsertOwnApplication(context: EventCommandContext, eventId: string, playerId: string, expectedRevision: number, body: unknown) {
    if (context.purpose !== "ACCOUNT") throw new TypeError("FORBIDDEN");
    const input = record(body, ["mainPosition", "subPositions", "participantId"]);
    const initial = {
      type: "UPSERT_OWN_APPLICATION",
      eventId: uuid(eventId),
      metadata: ownerMetadata(context, expectedRevision, "event:application:upsert", uuid(playerId)),
      payload: { participantId: uuid(input.participantId), playerId: uuid(playerId), ...preference(input) },
    } as const satisfies Extract<EventOwnerCommand, { type: "UPSERT_OWN_APPLICATION" }>;
    const command = fingerprint(initial);
    return this.handler.handle(command);
  }

  cancelOwnApplication(context: EventCommandContext, eventId: string, expectedRevision: number) {
    if (context.purpose !== "ACCOUNT") throw new TypeError("FORBIDDEN");
    const initial = {
      type: "CANCEL_OWN_APPLICATION",
      eventId: uuid(eventId),
      metadata: ownerMetadata(context, expectedRevision, "event:application:cancel", null),
      payload: {},
    } as const satisfies Extract<EventOwnerCommand, { type: "CANCEL_OWN_APPLICATION" }>;
    const command = fingerprint(initial);
    return this.handler.handle(command);
  }
}
