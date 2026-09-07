import { createHash } from "node:crypto";

import { COMPETITION_POSITIONS, type CompetitionPosition } from "../core";
import { DESTRUCTION_PRELIMINARY_FORMATS, validateDestructionConfiguration } from "./configuration";
import {
  destructionAdminMinimumRole,
  destructionCommandRequestFingerprint,
  type DestructionAdminCommand,
  type DestructionCommandContext,
  type DestructionCommandExecutor,
  type DestructionHttpCommand,
  type DestructionOwnerCommand,
} from "./http-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export function isDestructionUuid(value: string) { return UUID.test(value); }

function record(value: unknown, allowed: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("INVALID_INPUT");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) throw new TypeError("INVALID_INPUT");
  return result;
}

function text(value: unknown, maximum: number, minimum = 1) {
  if (typeof value !== "string") throw new TypeError("INVALID_INPUT");
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalized.length < minimum || normalized.length > maximum || UNSAFE.test(value)) throw new TypeError("INVALID_INPUT");
  return normalized;
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError("INVALID_INPUT");
  return value.toLocaleLowerCase("en-US");
}

function integer(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new TypeError("INVALID_INPUT");
  return value as number;
}

function finite(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new TypeError("INVALID_INPUT");
  return value;
}

function position(value: unknown): CompetitionPosition {
  if (!COMPETITION_POSITIONS.includes(value as never)) throw new TypeError("INVALID_INPUT");
  return value as CompetitionPosition;
}

function configuration(value: unknown) {
  const body = record(value, ["preliminaryFormat", "preliminaryRoundCount", "teamCount", "laneLimits"]);
  if (!DESTRUCTION_PRELIMINARY_FORMATS.includes(body.preliminaryFormat as never)) throw new TypeError("INVALID_INPUT");
  const teamCount = integer(body.teamCount, 4, 99);
  const laneInput = record(body.laneLimits, [...COMPETITION_POSITIONS]);
  const laneLimits = Object.fromEntries(COMPETITION_POSITIONS.map((lane) => [lane, integer(laneInput[lane], teamCount, 99)])) as Record<CompetitionPosition, number>;
  return validateDestructionConfiguration({
    preliminaryFormat: body.preliminaryFormat as string,
    preliminaryRoundCount: body.preliminaryRoundCount === undefined ? undefined : integer(body.preliminaryRoundCount, 1, 10),
    teamCount,
    laneLimits,
  });
}

function resultPayload(value: unknown) {
  const body = record(value, ["fixtureId", "teamAScore", "teamBScore", "winnerTeamId"]);
  return { fixtureId: text(body.fixtureId, 255), teamAScore: integer(body.teamAScore, 0, 9), teamBScore: integer(body.teamBScore, 0, 9), winnerTeamId: text(body.winnerTeamId, 255) };
}

export function parseDestructionAdminAction(value: unknown): Pick<DestructionAdminCommand, "type" | "payload"> {
  const input = record(value, ["type", "payload"]);
  const payload = input.payload ?? {};
  switch (input.type) {
    case "START_RECRUITMENT":
    case "CLOSE_RECRUITMENT":
    case "START_AUCTION":
    case "DRAW_AUCTION":
    case "PUBLISH_PRELIMINARY":
    case "PUBLISH_TOURNAMENT":
    case "COMPLETE_DESTRUCTION":
    case "RESTORE_DESTRUCTION":
      record(payload, []);
      return { type: input.type, payload: {} } as Pick<DestructionAdminCommand, "type" | "payload">;
    case "SET_APPLICATION_STATUS": {
      const body = record(payload, ["applicationId", "status"]);
      if (!["CONFIRMED", "RESERVE", "REJECTED"].includes(body.status as string)) throw new TypeError("INVALID_INPUT");
      return { type: input.type, payload: { applicationId: uuid(body.applicationId), status: body.status as "CONFIRMED" | "RESERVE" | "REJECTED" } };
    }
    case "CONFIRM_TEAMS": {
      const body = record(payload, ["seed", "captains"]);
      if (!Array.isArray(body.captains) || body.captains.length < 4 || body.captains.length > 99) throw new TypeError("INVALID_INPUT");
      const captains = body.captains.map((candidate) => {
        const captain = record(candidate, ["teamId", "name", "participantId", "baselineValue"]);
        return { teamId: uuid(captain.teamId), name: text(captain.name, 80), participantId: uuid(captain.participantId), baselineValue: finite(captain.baselineValue, 0, 1_000_000) };
      });
      return { type: input.type, payload: { seed: text(body.seed, 128, 8), captains } };
    }
    case "HOLD_AUCTION":
    case "RESET_MVP": {
      const key = input.type === "HOLD_AUCTION" ? "participantId" : "fixtureId";
      const body = record(payload, [key]);
      return { type: input.type, payload: { [key]: input.type === "HOLD_AUCTION" ? uuid(body[key]) : text(body[key], 255) } } as Pick<DestructionAdminCommand, "type" | "payload">;
    }
    case "SELL_AUCTION": {
      const body = record(payload, ["participantId", "teamId", "purchasePoints"]);
      return { type: input.type, payload: { participantId: uuid(body.participantId), teamId: uuid(body.teamId), purchasePoints: integer(body.purchasePoints, 0, 1_000_000) } };
    }
    case "RECORD_PRELIMINARY_RESULT":
    case "CORRECT_PRELIMINARY_RESULT":
    case "RECORD_TOURNAMENT_RESULT":
    case "CORRECT_TOURNAMENT_RESULT":
      return { type: input.type, payload: resultPayload(payload) };
    case "REPLACE_PARTICIPANT": {
      const body = record(payload, ["replacementId", "participantId", "incomingPlayerId", "incomingPosition", "reason"]);
      return { type: input.type, payload: { replacementId: uuid(body.replacementId), participantId: uuid(body.participantId), incomingPlayerId: uuid(body.incomingPlayerId), incomingPosition: position(body.incomingPosition), reason: text(body.reason, 500, 2) } };
    }
    case "ASSIGN_MVP": {
      const body = record(payload, ["fixtureId", "playerId"]);
      return { type: input.type, payload: { fixtureId: text(body.fixtureId, 255), playerId: uuid(body.playerId) } };
    }
    case "CANCEL_DESTRUCTION":
      return { type: input.type, payload: { reason: text(record(payload, ["reason"]).reason, 300, 2) } };
    default: throw new TypeError("INVALID_INPUT");
  }
}

function metadata(context: DestructionCommandContext, expectedRevision: number, scope: string) {
  return {
    actor: context.actorSession,
    requestId: context.requestId,
    expectedRevision,
    idempotency: { scope, keyHash: createHash("sha256").update(context.idempotencyMaterial).digest(), requestFingerprint: new Uint8Array(32) },
    issuedAt: new Date().toISOString(),
  };
}

function fingerprint<T extends DestructionHttpCommand>(command: T): T {
  return { ...command, metadata: { ...command.metadata, idempotency: { ...command.metadata.idempotency, requestFingerprint: destructionCommandRequestFingerprint(command) } } };
}

export class DestructionService {
  constructor(private readonly handler: DestructionCommandExecutor) {}

  create(context: DestructionCommandContext, body: unknown) {
    if (context.purpose !== "ADMIN") throw new TypeError("FORBIDDEN");
    const input = record(body, ["tournamentId", "title", "configuration"]);
    const tournamentId = uuid(input.tournamentId);
    const type = "CREATE_DESTRUCTION" as const;
    return this.handler.handle(fingerprint({ type, tournamentId, metadata: {
      ...metadata(context, 0, "admin:destruction:create"),
      authorizationIntent: { kind: "ADMIN_TOTP", minimumRole: "ADMIN", requireTotp: true, transactionRecheck: true },
    }, payload: { title: text(input.title, 120), configuration: configuration(input.configuration) } }));
  }

  executeAdmin(context: DestructionCommandContext, tournamentId: string, expectedRevision: number, body: unknown) {
    if (context.purpose !== "ADMIN") throw new TypeError("FORBIDDEN");
    const action = parseDestructionAdminAction(body);
    const minimumRole = destructionAdminMinimumRole(action.type);
    if (minimumRole === "SUPER_ADMIN" && context.actorSession.role !== "SUPER_ADMIN") throw new TypeError("FORBIDDEN");
    return this.handler.handle(fingerprint({
      ...action,
      tournamentId: uuid(tournamentId),
      metadata: {
        ...metadata(context, expectedRevision, `admin:destruction:${action.type.toLocaleLowerCase("en-US")}`),
        authorizationIntent: { kind: "ADMIN_TOTP", minimumRole, requireTotp: true, transactionRecheck: true },
      },
    } as DestructionAdminCommand));
  }

  upsertOwnApplication(context: DestructionCommandContext, tournamentId: string, playerId: string, expectedRevision: number, body: unknown) {
    if (context.purpose !== "ACCOUNT") throw new TypeError("FORBIDDEN");
    const input = record(body, ["applicationId", "position"]);
    const ownedPlayerId = uuid(playerId);
    const command = {
      type: "UPSERT_OWN_APPLICATION",
      tournamentId: uuid(tournamentId),
      metadata: {
        ...metadata(context, expectedRevision, "destruction:application:upsert"),
        authorizationIntent: { kind: "APPROVED_OWNER", ownerUserAccountId: context.actorSession.userAccountId, playerId: ownedPlayerId, requireApprovedAccount: true, requireOwnership: true, transactionRecheck: true },
      },
      payload: { applicationId: uuid(input.applicationId), playerId: ownedPlayerId, position: position(input.position) },
    } as const satisfies DestructionOwnerCommand;
    return this.handler.handle(fingerprint(command));
  }

  cancelOwnApplication(context: DestructionCommandContext, tournamentId: string, playerId: string, expectedRevision: number) {
    if (context.purpose !== "ACCOUNT") throw new TypeError("FORBIDDEN");
    const ownedPlayerId = uuid(playerId);
    const command = { type: "CANCEL_OWN_APPLICATION", tournamentId: uuid(tournamentId), metadata: {
      ...metadata(context, expectedRevision, "destruction:application:cancel"),
      authorizationIntent: { kind: "APPROVED_OWNER", ownerUserAccountId: context.actorSession.userAccountId, playerId: ownedPlayerId, requireApprovedAccount: true, requireOwnership: true, transactionRecheck: true },
    }, payload: { playerId: ownedPlayerId } } as const satisfies DestructionOwnerCommand;
    return this.handler.handle(fingerprint(command));
  }

  castOwnMvpVote(context: DestructionCommandContext, tournamentId: string, playerId: string, expectedRevision: number, body: unknown) {
    if (context.purpose !== "ACCOUNT") throw new TypeError("FORBIDDEN");
    const input = record(body, ["fixtureId", "candidatePlayerId"]);
    const ownedPlayerId = uuid(playerId);
    const command = { type: "CAST_MVP_VOTE", tournamentId: uuid(tournamentId), metadata: {
      ...metadata(context, expectedRevision, "destruction:mvp:vote"),
      authorizationIntent: { kind: "APPROVED_OWNER", ownerUserAccountId: context.actorSession.userAccountId, playerId: ownedPlayerId, requireApprovedAccount: true, requireOwnership: true, transactionRecheck: true },
    }, payload: { fixtureId: text(input.fixtureId, 255), voterPlayerId: ownedPlayerId, candidatePlayerId: uuid(input.candidatePlayerId) } } as const satisfies DestructionOwnerCommand;
    return this.handler.handle(fingerprint(command));
  }
}
