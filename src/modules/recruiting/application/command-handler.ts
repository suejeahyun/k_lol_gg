import { canonicalIdentifier, validateBestOf, type JsonObject } from "@/modules/competitions/core";

import {
  createRecruitParty,
  syncScrimRecruit,
  syncRecruitParty,
  transitionRecruitParty,
  transitionScrimRecruit,
  type RecruitParty,
  type ScrimLineup,
  type ScrimRecruit,
} from "../domain/recruiting";
import { recruitingCommandRequestFingerprint, recruitingCommandScope, type RecruitingCommand } from "./commands";
import type {
  RecruitCommandReceipt,
  RecruitMutationBody,
  RecruitingAuditEvent,
  RecruitingAuditPort,
  RecruitingAuthorizationPort,
  RecruitingClockPort,
  RecruitingCommandResult,
  RecruitingOutboxEvent,
  RecruitingOutboxPort,
  RecruitingReceiptPort,
  RecruitingRepository,
  RecruitingTransactionContext,
  RecruitingUnitOfWork,
} from "./ports";
import { toPublicPartyDto, toPublicScrimDto } from "./public-dto";

export class RecruitingApplicationError extends Error {
  constructor(readonly code: "INVALID_COMMAND" | "INVALID_AUTHORIZATION_INTENT" | "IDEMPOTENCY_MISMATCH" | "NOT_FOUND" | "REVISION_CONFLICT" | "ALREADY_EXISTS" | "FORBIDDEN" | "SESSION_STALE" | "ACTIVE_DESTRUCTION_TOURNAMENT_NOT_FOUND" | "ACTIVE_DESTRUCTION_TOURNAMENT_AMBIGUOUS", message: string) {
    super(message);
    this.name = "RecruitingApplicationError";
  }
}

export type RecruitingCommandHandlerDependencies = Readonly<{
  unitOfWork: RecruitingUnitOfWork;
  repository: RecruitingRepository;
  authorization: RecruitingAuthorizationPort;
  receipts: RecruitingReceiptPort;
  audit: RecruitingAuditPort;
  outbox: RecruitingOutboxPort;
  clock: RecruitingClockPort;
}>;

const PARTY_TYPES = new Set<RecruitingCommand["type"]>(["CREATE_PARTY", "SYNC_PARTY", "GET_PARTY_STATUS", "FINISH_PARTY", "CANCEL_PARTY", "RESET_PARTY"]);
const CREATE_TYPES = new Set<RecruitingCommand["type"]>(["CREATE_PARTY", "CREATE_SCRIM"]);
const STATUS_TYPES = new Set<RecruitingCommand["type"]>(["GET_PARTY_STATUS"]);

function digest(value: Uint8Array, label: string) {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) throw new RecruitingApplicationError("INVALID_COMMAND", `${label} must be a 32-byte digest.`);
}

function sameDigest(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function canonicalInstant(value: string, label: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new RecruitingApplicationError("INVALID_COMMAND", `${label} must be a canonical ISO instant.`);
}

function validateAuthorization(command: RecruitingCommand) {
  const { actor } = command.metadata;
  canonicalIdentifier(actor.principalId, "actor.principalId");
  if (actor.kind === "BOT") {
    canonicalIdentifier(actor.authorizationIntent.keyId, "authorizationIntent.keyId");
    canonicalIdentifier(actor.authorizationIntent.nonce, "authorizationIntent.nonce");
    canonicalIdentifier(actor.authorizationIntent.roomId, "authorizationIntent.roomId");
    canonicalIdentifier(actor.authorizationIntent.senderId, "authorizationIntent.senderId");
    if (
      actor.authorizationIntent.kind !== "KAKAO_HMAC" ||
      actor.authorizationIntent.transactionRecheck !== true ||
      actor.authorizationIntent.requireNonceClaim !== true ||
      actor.authorizationIntent.bodyDigestHex !== command.metadata.idempotency.bodyDigestHex
    ) throw new RecruitingApplicationError("INVALID_AUTHORIZATION_INTENT", "BOT commands require the verified Kakao body and an in-transaction nonce claim.");
    if (Math.floor(Date.parse(command.metadata.issuedAt) / 1_000) !== actor.authorizationIntent.timestampSeconds) {
      throw new RecruitingApplicationError("INVALID_AUTHORIZATION_INTENT", "The BOT command time must remain bound to its signed webhook timestamp.");
    }
    if (command.type === "RESET_PARTY") throw new RecruitingApplicationError("INVALID_AUTHORIZATION_INTENT", "Party reset requires SUPER_ADMIN authorization.");
    return;
  }
  if (actor.kind === "ACCOUNT") {
    canonicalIdentifier(actor.sessionActor.sessionId, "actor.sessionId");
    if (
      actor.principalId !== actor.sessionActor.userAccountId ||
      !["USER", "ADMIN", "SUPER_ADMIN"].includes(actor.sessionActor.role) ||
      actor.authorizationIntent.kind !== "APPROVED_ACCOUNT" ||
      actor.authorizationIntent.transactionRecheck !== true ||
      command.type === "RESET_PARTY"
    ) throw new RecruitingApplicationError("INVALID_AUTHORIZATION_INTENT", "Account commands require an approved ACCOUNT-purpose session recheck.");
    return;
  }
  if (actor.kind === "ADMIN") {
    canonicalIdentifier(actor.sessionActor.sessionId, "actor.sessionId");
    const intent = actor.authorizationIntent;
    if (actor.principalId !== actor.sessionActor.userAccountId || actor.sessionActor.role !== intent.minimumRole || intent.kind !== "ADMIN_TOTP" || !["ADMIN", "SUPER_ADMIN"].includes(intent.minimumRole) || intent.requireTotp !== true || intent.transactionRecheck !== true) {
      throw new RecruitingApplicationError("INVALID_AUTHORIZATION_INTENT", "Administrator commands require an ADMIN-purpose TOTP session recheck.");
    }
    if (command.type === "RESET_PARTY" && intent.minimumRole !== "SUPER_ADMIN") {
      throw new RecruitingApplicationError("INVALID_AUTHORIZATION_INTENT", "Party reset requires SUPER_ADMIN.");
    }
    return;
  }
  const intent = actor.authorizationIntent;
  canonicalIdentifier(intent.jobName, "authorizationIntent.jobName");
  canonicalIdentifier(intent.nonce, "authorizationIntent.nonce");
  if (
    intent.kind !== "SIGNED_JOB" || intent.transactionRecheck !== true ||
    !Number.isSafeInteger(intent.timestampSeconds) || !/^[a-f0-9]{64}$/u.test(intent.bodyDigestHex) ||
    intent.bodyDigestHex !== command.metadata.idempotency.bodyDigestHex ||
    Math.floor(Date.parse(command.metadata.issuedAt) / 1_000) !== intent.timestampSeconds ||
    !["FINISH_PARTY", "GET_PARTY_STATUS"].includes(command.type)
  ) throw new RecruitingApplicationError("INVALID_AUTHORIZATION_INTENT", "JOB authorization is limited to signed party status and finish commands.");
}

function validateReceipt(receipt: RecruitCommandReceipt) {
  canonicalIdentifier(receipt.actorPrincipalId, "receipt.actorPrincipalId");
  canonicalIdentifier(receipt.scope, "receipt.scope");
  digest(receipt.keyHash, "receipt.keyHash");
  digest(receipt.requestHash, "receipt.requestHash");
  if (!/^[a-f0-9]{64}$/u.test(receipt.bodyDigestHex) || (receipt.responseStatus !== 200 && receipt.responseStatus !== 201) || !Number.isSafeInteger(receipt.revision) || receipt.revision < 0) {
    throw new RecruitingApplicationError("IDEMPOTENCY_MISMATCH", "The durable receipt metadata is invalid.");
  }
  canonicalInstant(receipt.createdAt, "receipt.createdAt");
  canonicalInstant(receipt.expiresAt, "receipt.expiresAt");
  if (Date.parse(receipt.expiresAt) <= Date.parse(receipt.createdAt)) throw new RecruitingApplicationError("IDEMPOTENCY_MISMATCH", "The durable receipt expiry is invalid.");
  if (receipt.body.aggregateId !== receipt.body.data.id || receipt.body.revision !== receipt.revision) {
    throw new RecruitingApplicationError("IDEMPOTENCY_MISMATCH", "The durable receipt response is internally inconsistent.");
  }
}

function validateCommand(command: RecruitingCommand) {
  canonicalIdentifier(command.aggregateId, "aggregateId");
  canonicalIdentifier(command.metadata.requestId, "requestId");
  canonicalIdentifier(command.metadata.idempotency.scope, "scope");
  if (command.metadata.idempotency.scope !== recruitingCommandScope(command.metadata.actor.kind, command.type)) throw new RecruitingApplicationError("INVALID_COMMAND", "The command scope does not match its actor and action.");
  if (!Number.isSafeInteger(command.metadata.expectedRevision) || command.metadata.expectedRevision < 0) throw new RecruitingApplicationError("INVALID_COMMAND", "Expected revision must be a non-negative safe integer.");
  canonicalInstant(command.metadata.issuedAt, "issuedAt");
  digest(command.metadata.idempotency.keyHash, "keyHash");
  digest(command.metadata.idempotency.requestFingerprint, "requestFingerprint");
  if (!/^[a-f0-9]{64}$/u.test(command.metadata.idempotency.bodyDigestHex)) throw new RecruitingApplicationError("INVALID_COMMAND", "bodyDigestHex must be lowercase SHA-256.");
  validateAuthorization(command);
  if (!sameDigest(command.metadata.idempotency.requestFingerprint, recruitingCommandRequestFingerprint(command))) {
    throw new RecruitingApplicationError("IDEMPOTENCY_MISMATCH", "The request fingerprint does not match the immutable command body.");
  }
}

function parseDate(value: string | null, label: string) {
  if (value === null) return null;
  canonicalInstant(value, label);
  return new Date(value);
}

function optionalScrimText(value: string | null | undefined, label: string, maximum: number) {
  if (value === null || value === undefined) return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new RecruitingApplicationError("INVALID_COMMAND", `${label} is invalid.`);
  }
  return normalized;
}

function scrimLineup(value: ScrimLineup | null | undefined, label: string): ScrimLineup | null {
  if (!value) return null;
  const output = {
    top: optionalScrimText(value.top, `${label}.top`, 80),
    jungle: optionalScrimText(value.jungle, `${label}.jungle`, 80),
    mid: optionalScrimText(value.mid, `${label}.mid`, 80),
    adc: optionalScrimText(value.adc, `${label}.adc`, 80),
    support: optionalScrimText(value.support, `${label}.support`, 80),
  };
  return Object.values(output).some((entry) => entry !== null) ? Object.freeze(output) : null;
}

function createScrim(command: Extract<RecruitingCommand, { type: "CREATE_SCRIM" }>, inferredTournamentId: string | null = null): ScrimRecruit {
  const payload = command.payload;
  const tournamentId = payload.tournamentId ?? inferredTournamentId;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(payload.recruitDate)) throw new RecruitingApplicationError("INVALID_COMMAND", "Scrim recruitDate must be YYYY-MM-DD.");
  if (!Number.isSafeInteger(payload.scrimNumber) || payload.scrimNumber < 1 || payload.scrimNumber > 99) throw new RecruitingApplicationError("INVALID_COMMAND", "Scrim number must be between one and 99.");
  if (tournamentId) canonicalIdentifier(tournamentId, "tournamentId");
  if (payload.requesterTeamId) canonicalIdentifier(payload.requesterTeamId, "requesterTeamId");
  if (!tournamentId && (!Number.isSafeInteger(payload.legacyTournamentNumber) || Number(payload.legacyTournamentNumber) < 1 || Number(payload.legacyTournamentNumber) > 9999)) {
    throw new RecruitingApplicationError("INVALID_COMMAND", "A scrim requires a tournament ID or legacy tournament number.");
  }
  const requesterTeamName = optionalScrimText(payload.requesterTeamName, "requesterTeamName", 120);
  if (!payload.requesterTeamId && !requesterTeamName) {
    throw new RecruitingApplicationError("INVALID_COMMAND", "A scrim requires a requester team ID or name.");
  }
  validateBestOf(payload.bestOf);
  return Object.freeze({
    id: command.aggregateId,
    revision: 0,
    sourceRoomId: command.metadata.actor.kind === "BOT" ? command.metadata.actor.authorizationIntent.roomId : null,
    recruitDate: payload.recruitDate,
    scrimNumber: payload.scrimNumber,
    tournamentId,
    legacyTournamentNumber: payload.legacyTournamentNumber ?? null,
    requesterTeamId: payload.requesterTeamId,
    opponentTeamId: null,
    legacyTitle: optionalScrimText(payload.title, "title", 160),
    requesterTeamName,
    opponentTeamName: optionalScrimText(payload.opponentTeamName, "opponentTeamName", 120),
    requesterLineup: scrimLineup(payload.requesterLineup, "requesterLineup"),
    opponentLineup: scrimLineup(payload.opponentLineup, "opponentLineup"),
    legacyMemo: optionalScrimText(payload.memo, "memo", 500),
    legacySeriesRuleText: optionalScrimText(payload.seriesRuleText, "seriesRuleText", 160),
    status: "RECRUITING",
    scheduledAt: parseDate(payload.scheduledAt, "scheduledAt"),
    bestOf: payload.bestOf,
  });
}

function partySnapshot(party: RecruitParty | null): JsonObject | null {
  return party ? { id: party.id, revision: party.revision, status: party.status, memberCount: party.members.filter((member) => !member.substitute).length, reserveCount: party.members.filter((member) => member.substitute).length, maximumMembers: party.maximumMembers, startTimeText: party.startTimeText, gameInfo: party.gameInfo } : null;
}

function scrimSnapshot(scrim: ScrimRecruit | null): JsonObject | null {
  return scrim ? {
    id: scrim.id, revision: scrim.revision, recruitDate: scrim.recruitDate, scrimNumber: scrim.scrimNumber,
    tournamentId: scrim.tournamentId, legacyTournamentNumber: scrim.legacyTournamentNumber,
    status: scrim.status, requesterTeamId: scrim.requesterTeamId, opponentTeamId: scrim.opponentTeamId,
    title: scrim.legacyTitle ?? null, requesterTeamName: scrim.requesterTeamName ?? null,
    opponentTeamName: scrim.opponentTeamName ?? null, requesterLineup: scrim.requesterLineup,
    opponentLineup: scrim.opponentLineup, memo: scrim.legacyMemo,
    seriesRuleText: scrim.legacySeriesRuleText, scheduledAt: scrim.scheduledAt?.toISOString() ?? null,
    bestOf: scrim.bestOf,
  } : null;
}

function partyJson(party: RecruitParty): JsonObject {
  const dto = toPublicPartyDto(party);
  return { id: dto.id, recruitNumber: dto.recruitNumber, type: dto.type, status: dto.status, title: dto.title, memberCount: dto.memberCount, maximumMembers: dto.maximumMembers, startTimeText: dto.startTimeText, gameInfo: dto.gameInfo, scheduledStartAt: dto.scheduledStartAt };
}

function scrimJson(scrim: ScrimRecruit): JsonObject {
  const dto = toPublicScrimDto(scrim);
  return { id: dto.id, recruitDate: dto.recruitDate, scrimNumber: dto.scrimNumber, tournamentId: dto.tournamentId, legacyTournamentNumber: dto.legacyTournamentNumber, requesterTeamId: dto.requesterTeamId, opponentTeamId: dto.opponentTeamId, title: dto.title, requesterTeamName: dto.requesterTeamName, opponentTeamName: dto.opponentTeamName, requesterLineup: dto.requesterLineup, opponentLineup: dto.opponentLineup, memo: dto.memo, seriesRuleText: dto.seriesRuleText, status: dto.status, scheduledAt: dto.scheduledAt, bestOf: dto.bestOf };
}

export class RecruitingCommandHandler {
  constructor(private readonly dependencies: RecruitingCommandHandlerDependencies) {}

  handle(command: RecruitingCommand): Promise<RecruitingCommandResult> {
    validateCommand(command);
    return this.dependencies.unitOfWork.transaction((transaction) => this.handleTransaction(transaction, command));
  }

  private async handleTransaction(transaction: RecruitingTransactionContext, command: RecruitingCommand): Promise<RecruitingCommandResult> {
    await this.dependencies.authorization.recheck(transaction, {
      actor: command.metadata.actor,
      commandType: command.type,
      aggregateId: command.aggregateId,
      idempotency: command.metadata.idempotency,
    });
    const claim = await this.dependencies.receipts.claim(transaction, command);
    if (claim.kind === "MISMATCH") throw new RecruitingApplicationError("IDEMPOTENCY_MISMATCH", "The request key was reused for a different body digest.");
    if (claim.kind === "REPLAY") {
      const receipt = claim.receipt;
      validateReceipt(receipt);
      if (
        receipt.actorPrincipalId !== command.metadata.actor.principalId || receipt.scope !== command.metadata.idempotency.scope ||
        receipt.bodyDigestHex !== command.metadata.idempotency.bodyDigestHex ||
        !sameDigest(receipt.keyHash, command.metadata.idempotency.keyHash) || !sameDigest(receipt.requestHash, command.metadata.idempotency.requestFingerprint) ||
        receipt.body.aggregateId !== command.aggregateId || receipt.body.commandType !== command.type || receipt.body.revision !== receipt.revision
      ) throw new RecruitingApplicationError("IDEMPOTENCY_MISMATCH", "The durable receipt does not match the command identity.");
      return { body: receipt.body, revision: receipt.revision, replayed: true };
    }

    const partyCommand = PARTY_TYPES.has(command.type);
    const party = partyCommand ? await this.dependencies.repository.loadPartyForUpdate(transaction, command.aggregateId) : null;
    const scrim = partyCommand ? null : await this.dependencies.repository.loadScrimForUpdate(transaction, command.aggregateId);
    const create = CREATE_TYPES.has(command.type);
    const current = partyCommand ? party : scrim;
    if (create ? current !== null : current === null) throw new RecruitingApplicationError(create ? "ALREADY_EXISTS" : "NOT_FOUND", create ? "Recruit aggregate already exists." : "Recruit aggregate does not exist.");
    if (create ? command.metadata.expectedRevision !== 0 : current!.revision !== command.metadata.expectedRevision) throw new RecruitingApplicationError("REVISION_CONFLICT", "Recruit aggregate revision changed.");

    const now = this.dependencies.clock.now();
    if (!Number.isFinite(now.getTime())) throw new RecruitingApplicationError("INVALID_COMMAND", "Clock returned an invalid time.");
    let nextParty: RecruitParty | null = party;
    let nextScrim: ScrimRecruit | null = scrim;
    switch (command.type) {
      case "CREATE_PARTY":
        nextParty = createRecruitParty({ id: command.aggregateId, sourceRoomId: command.metadata.actor.kind === "BOT" ? command.metadata.actor.authorizationIntent.roomId : null, ...command.payload, type: command.payload.partyType, scheduledStartAt: parseDate(command.payload.scheduledStartAt, "scheduledStartAt"), protectedUntil: parseDate(command.payload.protectedUntil, "protectedUntil"), now });
        break;
      case "SYNC_PARTY":
        nextParty = sync(command, party!, now);
        break;
      case "GET_PARTY_STATUS":
        break;
      case "FINISH_PARTY":
      case "CANCEL_PARTY":
      case "RESET_PARTY":
        nextParty = transitionRecruitParty({ party: party!, expectedRevision: command.metadata.expectedRevision, command: command.type === "FINISH_PARTY" ? "FINISH" : command.type === "CANCEL_PARTY" ? "CANCEL" : "RESET", now });
        break;
      case "CREATE_SCRIM":
        nextScrim = createScrim(command, await this.inferV1ScrimTournamentId(transaction, command));
        break;
      case "SYNC_SCRIM":
        nextScrim = syncScrim(command, scrim!);
        break;
      case "JOIN_SCRIM":
      case "REOPEN_SCRIM":
      case "CONFIRM_SCRIM":
      case "COMPLETE_SCRIM":
      case "CANCEL_SCRIM":
        nextScrim = transitionScrimRecruit({ scrim: scrim!, expectedRevision: command.metadata.expectedRevision, command: command.type === "JOIN_SCRIM" ? "JOIN" : command.type === "REOPEN_SCRIM" ? "REOPEN" : command.type === "CONFIRM_SCRIM" ? "CONFIRM" : command.type === "COMPLETE_SCRIM" ? "COMPLETE" : "CANCEL", opponentTeamId: command.type === "JOIN_SCRIM" ? command.payload.opponentTeamId : undefined });
        break;
    }

    const next = (partyCommand ? nextParty : nextScrim)!;
    const data = partyCommand ? partyJson(nextParty!) : scrimJson(nextScrim!);
    const body: RecruitMutationBody = { aggregateKind: partyCommand ? "PARTY" : "SCRIM", aggregateId: next.id, revision: next.revision, status: next.status, commandType: command.type, data };
    const nowIso = now.toISOString();
    if (!STATUS_TYPES.has(command.type)) {
      if (partyCommand) await this.dependencies.repository.saveParty(transaction, { party: nextParty!, expectedRevision: command.metadata.expectedRevision, create });
      else await this.dependencies.repository.saveScrim(transaction, { scrim: nextScrim!, expectedRevision: command.metadata.expectedRevision, create });
      const audit: RecruitingAuditEvent = { requestId: command.metadata.requestId, actorPrincipalId: command.metadata.actor.principalId, action: `RECRUITING_${command.type}`, targetType: partyCommand ? "RECRUIT_PARTY" : "SCRIM_RECRUIT", targetId: next.id, before: partyCommand ? partySnapshot(party) : scrimSnapshot(scrim), after: partyCommand ? partySnapshot(nextParty)! : scrimSnapshot(nextScrim)!, occurredAt: nowIso };
      await this.dependencies.audit.append(transaction, audit);
      const outbox: RecruitingOutboxEvent = { id: `${command.metadata.requestId}:OUTBOX`, requestId: command.metadata.requestId, aggregateType: partyCommand ? "RECRUIT_PARTY" : "SCRIM_RECRUIT", aggregateId: next.id, aggregateRevision: next.revision, eventType: `RECRUITING_${command.type}`, dedupeKey: `${next.id}:${next.revision}:${command.type}`, payload: { aggregateId: next.id, revision: next.revision, status: next.status, commandType: command.type }, occurredAt: nowIso };
      await this.dependencies.outbox.append(transaction, outbox);
    }
    const expiresAt = this.dependencies.clock.receiptExpiresAt(now);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) throw new RecruitingApplicationError("INVALID_COMMAND", "Receipt expiry must follow creation.");
    const receipt: RecruitCommandReceipt = { actorPrincipalId: command.metadata.actor.principalId, scope: command.metadata.idempotency.scope, keyHash: command.metadata.idempotency.keyHash, requestHash: command.metadata.idempotency.requestFingerprint, bodyDigestHex: command.metadata.idempotency.bodyDigestHex, responseStatus: create ? 201 : 200, body, revision: next.revision, createdAt: nowIso, expiresAt: expiresAt.toISOString() };
    await this.dependencies.receipts.complete(transaction, receipt);
    return { body, revision: next.revision, replayed: false };
  }

  private async inferV1ScrimTournamentId(
    transaction: RecruitingTransactionContext,
    command: Extract<RecruitingCommand, { type: "CREATE_SCRIM" }>,
  ) {
    if (command.payload.tournamentId || command.payload.legacyTournamentNumber !== null && command.payload.legacyTournamentNumber !== undefined) return null;
    if (command.metadata.actor.kind !== "BOT") {
      throw new RecruitingApplicationError("INVALID_COMMAND", "Only a signed Kakao V1 form may infer its destruction tournament.");
    }
    const candidates = await this.dependencies.repository.listActiveDestructionTournamentIdsForUpdate(transaction);
    if (candidates.length === 0) {
      throw new RecruitingApplicationError("ACTIVE_DESTRUCTION_TOURNAMENT_NOT_FOUND", "No active destruction tournament is available for the V1 scrim form.");
    }
    if (candidates.length !== 1) {
      throw new RecruitingApplicationError("ACTIVE_DESTRUCTION_TOURNAMENT_AMBIGUOUS", "More than one active destruction tournament matches the V1 scrim form.");
    }
    return candidates[0]!;
  }
}

function sync(command: Extract<RecruitingCommand, { type: "SYNC_PARTY" }>, party: RecruitParty, now: Date) {
  return syncRecruitParty({
    party,
    expectedRevision: command.metadata.expectedRevision,
    members: command.payload.members,
    startTimeText: command.payload.startTimeText,
    gameInfo: command.payload.gameInfo,
    scheduledStartAt: command.payload.scheduledStartAt === undefined
      ? undefined
      : parseDate(command.payload.scheduledStartAt, "scheduledStartAt"),
    now,
  });
}

function syncScrim(command: Extract<RecruitingCommand, { type: "SYNC_SCRIM" }>, scrim: ScrimRecruit) {
  const payload = command.payload;
  return syncScrimRecruit({
    scrim,
    expectedRevision: command.metadata.expectedRevision,
    recruitDate: payload.recruitDate,
    scrimNumber: payload.scrimNumber,
    tournamentId: payload.tournamentId,
    legacyTournamentNumber: payload.legacyTournamentNumber,
    requesterTeamId: payload.requesterTeamId,
    opponentTeamId: payload.opponentTeamId ?? null,
    legacyTitle: optionalScrimText(payload.title, "title", 160),
    requesterTeamName: optionalScrimText(payload.requesterTeamName, "requesterTeamName", 120),
    opponentTeamName: optionalScrimText(payload.opponentTeamName, "opponentTeamName", 120),
    requesterLineup: scrimLineup(payload.requesterLineup, "requesterLineup"),
    opponentLineup: scrimLineup(payload.opponentLineup, "opponentLineup"),
    legacyMemo: optionalScrimText(payload.memo, "memo", 500),
    legacySeriesRuleText: optionalScrimText(payload.seriesRuleText, "seriesRuleText", 160),
    scheduledAt: parseDate(payload.scheduledAt, "scheduledAt"),
    bestOf: payload.bestOf,
  });
}
