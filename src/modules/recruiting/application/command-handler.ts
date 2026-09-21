import { canonicalIdentifier, validateBestOf, type JsonObject } from "@/modules/competitions/core";

import {
  createRecruitParty,
  mergeRecruitPartySlotPatches,
  mutateRecruitPartyMember,
  mutateScrimParticipant,
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
import { partyCopyReference } from "./party-copy-reference";
import { isPartyFormCode, mergePartyCopyAdditions, mergePartyCopyEdits, readPartyCopySnapshot } from "./party-copy-snapshot";

export class RecruitingApplicationError extends Error {
  constructor(readonly code: "INVALID_COMMAND" | "INVALID_AUTHORIZATION_INTENT" | "IDEMPOTENCY_MISMATCH" | "NOT_FOUND" | "REVISION_CONFLICT" | "ALREADY_EXISTS" | "FORBIDDEN" | "SESSION_STALE" | "ACTIVE_DESTRUCTION_TOURNAMENT_NOT_FOUND" | "ACTIVE_DESTRUCTION_TOURNAMENT_AMBIGUOUS" | "AMBIGUOUS_MEMBER" | "RECRUIT_MEMBER_LIMIT_EXCEEDED", message: string) {
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

const PARTY_TYPES = new Set<RecruitingCommand["type"]>(["CREATE_PARTY", "SYNC_PARTY", "PARTY_MEMBER_ADD", "PARTY_MEMBER_REMOVE", "GET_PARTY_STATUS", "FINISH_PARTY", "CANCEL_PARTY", "RESET_PARTY"]);
const PARTY_MEMBER_TYPES = new Set<RecruitingCommand["type"]>(["PARTY_MEMBER_ADD", "PARTY_MEMBER_REMOVE"]);
const SCRIM_PARTICIPANT_TYPES = new Set<RecruitingCommand["type"]>(["ADD_SCRIM_PARTICIPANT", "REMOVE_SCRIM_PARTICIPANT"]);
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
    if (actor.authorizationIntent.deliveryId) canonicalIdentifier(actor.authorizationIntent.deliveryId, "authorizationIntent.deliveryId");
    if (
      actor.authorizationIntent.kind !== "KAKAO_HMAC" ||
      actor.authorizationIntent.transactionRecheck !== true ||
      actor.authorizationIntent.requireNonceClaim !== true ||
      actor.authorizationIntent.bodyDigestHex !== command.metadata.idempotency.bodyDigestHex ||
      !["COMPAT_V1", "RAW_V2", "KAKAO_V4"].includes(actor.commandSource)
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
  if (command.metadata.idempotency.scope !== recruitingCommandScope(
    command.metadata.actor.kind,
    command.type,
    command.metadata.actor.kind === "BOT" ? command.metadata.actor.commandSource : undefined,
  )) throw new RecruitingApplicationError("INVALID_COMMAND", "The command scope does not match its actor and action.");
  if (!Number.isSafeInteger(command.metadata.expectedRevision) || command.metadata.expectedRevision < 0) throw new RecruitingApplicationError("INVALID_COMMAND", "Expected revision must be a non-negative safe integer.");
  canonicalInstant(command.metadata.issuedAt, "issuedAt");
  digest(command.metadata.idempotency.keyHash, "keyHash");
  digest(command.metadata.idempotency.requestFingerprint, "requestFingerprint");
  if (!/^[a-f0-9]{64}$/u.test(command.metadata.idempotency.bodyDigestHex)) throw new RecruitingApplicationError("INVALID_COMMAND", "bodyDigestHex must be lowercase SHA-256.");
  if (PARTY_MEMBER_TYPES.has(command.type)) {
    const payload = command.payload as unknown as Record<string, unknown>;
    if (
      !payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length !== 1 || typeof payload.name !== "string" ||
      !payload.name || payload.name !== payload.name.trim() || payload.name.length > 80 || /[\u0000-\u001f\u007f]/u.test(payload.name)
    ) throw new RecruitingApplicationError("INVALID_COMMAND", "Party member commands require one valid name.");
  }
  if (SCRIM_PARTICIPANT_TYPES.has(command.type)) {
    const payload = command.payload as unknown as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.name !== "string" ||
        !payload.name.trim() || payload.name !== payload.name.trim() || payload.name.length > 80 ||
        (payload.team !== undefined && !["REQUESTER", "OPPONENT"].includes(String(payload.team))) ||
        (payload.position !== undefined && !["TOP", "JGL", "MID", "ADC", "SUP", "ALL"].includes(String(payload.position)))) {
      throw new RecruitingApplicationError("INVALID_COMMAND", "Scrim participant commands require a valid name, team, and position.");
    }
  }
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

function createScrim(
  command: Extract<RecruitingCommand, { type: "CREATE_SCRIM" }>,
  inferredTournamentId: string | null = null,
  allocatedScrimNumber: number | null = null,
): ScrimRecruit {
  const payload = command.payload;
  const tournamentId = payload.tournamentId ?? inferredTournamentId;
  const scrimNumber = payload.scrimNumber ?? allocatedScrimNumber;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(payload.recruitDate)) throw new RecruitingApplicationError("INVALID_COMMAND", "Scrim recruitDate must be YYYY-MM-DD.");
  if (!Number.isSafeInteger(scrimNumber) || scrimNumber === null || scrimNumber < 1 || scrimNumber > 99) throw new RecruitingApplicationError("INVALID_COMMAND", "Scrim number must be between one and 99.");
  if (tournamentId) canonicalIdentifier(tournamentId, "tournamentId");
  if (payload.requesterTeamId) canonicalIdentifier(payload.requesterTeamId, "requesterTeamId");
  if (payload.initialStatus !== "DRAFT" && !tournamentId && (!Number.isSafeInteger(payload.legacyTournamentNumber) || Number(payload.legacyTournamentNumber) < 1 || Number(payload.legacyTournamentNumber) > 9999)) {
    throw new RecruitingApplicationError("INVALID_COMMAND", "A scrim requires a tournament ID or legacy tournament number.");
  }
  const requesterTeamName = optionalScrimText(payload.requesterTeamName, "requesterTeamName", 120);
  if (payload.initialStatus !== "DRAFT" && !payload.requesterTeamId && !requesterTeamName) {
    throw new RecruitingApplicationError("INVALID_COMMAND", "A scrim requires a requester team ID or name.");
  }
  validateBestOf(payload.bestOf);
  return Object.freeze({
    id: command.aggregateId,
    revision: 0,
    sourceRoomId: command.metadata.actor.kind === "BOT" ? command.metadata.actor.authorizationIntent.roomId : null,
    sourceSenderId: command.metadata.actor.kind === "BOT" ? command.metadata.actor.authorizationIntent.senderId : null,
    opponentSenderId: null,
    recruitDate: payload.recruitDate,
    scrimNumber,
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
    organizerText: optionalScrimText(payload.organizerText, "organizerText", 100),
    status: payload.initialStatus ?? "RECRUITING",
    scheduledAt: parseDate(payload.scheduledAt, "scheduledAt"),
    bestOf: payload.bestOf,
  });
}

function partySnapshot(party: RecruitParty | null): JsonObject | null {
  return party ? { id: party.id, revision: party.revision, status: party.status, memberCount: party.members.filter((member) => !member.substitute).length, reserveCount: party.members.filter((member) => member.substitute).length, maximumMembers: party.maximumMembers, startTimeText: party.startTimeText, gameInfo: party.gameInfo, organizerText: party.organizerText } : null;
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
    bestOf: scrim.bestOf, organizerText: scrim.organizerText ?? null,
  } : null;
}

function partyJson(party: RecruitParty): JsonObject {
  const dto = toPublicPartyDto(party);
  return { id: dto.id, recruitNumber: dto.recruitNumber, type: dto.type, status: dto.status, title: dto.title, memberCount: dto.memberCount, reserveCount: party.members.filter((member) => member.substitute).length, maximumMembers: dto.maximumMembers, startTimeText: dto.startTimeText, gameInfo: dto.gameInfo, organizerText: dto.organizerText, scheduledStartAt: dto.scheduledStartAt };
}

function scrimJson(scrim: ScrimRecruit): JsonObject {
  const dto = toPublicScrimDto(scrim);
  return { id: dto.id, recruitDate: dto.recruitDate, scrimNumber: dto.scrimNumber, tournamentId: dto.tournamentId, legacyTournamentNumber: dto.legacyTournamentNumber, requesterTeamId: dto.requesterTeamId, opponentTeamId: dto.opponentTeamId, title: dto.title, requesterTeamName: dto.requesterTeamName, opponentTeamName: dto.opponentTeamName, requesterLineup: dto.requesterLineup, opponentLineup: dto.opponentLineup, memo: dto.memo, seriesRuleText: dto.seriesRuleText, organizerText: dto.organizerText ?? null, status: dto.status, scheduledAt: dto.scheduledAt, bestOf: dto.bestOf };
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
      const v4EventReplay = command.metadata.actor.kind === "BOT" && command.metadata.actor.commandSource === "KAKAO_V4";
      if (
        receipt.actorPrincipalId !== command.metadata.actor.principalId || receipt.scope !== command.metadata.idempotency.scope ||
        receipt.bodyDigestHex !== command.metadata.idempotency.bodyDigestHex ||
        !sameDigest(receipt.keyHash, command.metadata.idempotency.keyHash) || !sameDigest(receipt.requestHash, command.metadata.idempotency.requestFingerprint) ||
        (!v4EventReplay && (receipt.body.aggregateId !== command.aggregateId || receipt.body.commandType !== command.type)) ||
        receipt.body.revision !== receipt.revision
      ) throw new RecruitingApplicationError("IDEMPOTENCY_MISMATCH", "The durable receipt does not match the command identity.");
      return { body: receipt.body, revision: receipt.revision, replayed: true };
    }

    let allocatedPartyIdentity: Readonly<{ resetSequence: number; recruitNumber: number }> | null = null;
    let allocatedScrimNumber: number | null = null;
    if (command.type === "CREATE_PARTY" && command.payload.resetSequence === null) {
      if (
        command.metadata.actor.kind !== "BOT" ||
        (command.metadata.actor.commandSource !== "COMPAT_V1" && command.metadata.actor.commandSource !== "KAKAO_V4")
      ) throw new RecruitingApplicationError("INVALID_COMMAND", "Automatic party numbering is limited to signed Kakao compatibility creates.");
      allocatedPartyIdentity = await this.dependencies.repository.allocateNextPartyIdentityForUpdate(transaction, {
        sourceRoomId: command.metadata.actor.authorizationIntent.roomId,
        recruitDate: command.payload.recruitDate,
        preferredRecruitNumber: command.payload.recruitNumber,
      });
      if (!allocatedPartyIdentity) throw new RecruitingApplicationError("INVALID_COMMAND", "All 99 party numbers for this date are already used.");
    }
    if (
      command.type === "CREATE_PARTY" && command.payload.initialStatus === "DRAFT" &&
      (command.metadata.actor.kind !== "BOT" || command.metadata.actor.commandSource !== "KAKAO_V4")
    ) {
      throw new RecruitingApplicationError("INVALID_COMMAND", "Draft party number reservations are limited to signed Kakao V4 creates.");
    }
    if (command.type === "CREATE_PARTY" && command.payload.resetSequence !== null && command.payload.recruitNumber === null) {
      throw new RecruitingApplicationError("INVALID_COMMAND", "A party number is required when automatic numbering is disabled.");
    }
    if (command.type === "CREATE_SCRIM" && command.payload.scrimNumber === null) {
      if (
        command.metadata.actor.kind !== "BOT" ||
        (command.metadata.actor.commandSource !== "COMPAT_V1" && command.metadata.actor.commandSource !== "KAKAO_V4")
      ) throw new RecruitingApplicationError("INVALID_COMMAND", "Automatic scrim numbering is limited to signed Kakao compatibility creates.");
      allocatedScrimNumber = await this.dependencies.repository.allocateNextScrimNumberForUpdate(transaction, command.payload.recruitDate);
      if (allocatedScrimNumber === null) throw new RecruitingApplicationError("INVALID_COMMAND", "All 99 scrim numbers for this date are already used.");
    }
    if (command.type === "CREATE_SCRIM" && command.payload.initialStatus === "DRAFT" &&
        (command.metadata.actor.kind !== "BOT" || command.metadata.actor.commandSource !== "KAKAO_V4")) {
      throw new RecruitingApplicationError("INVALID_COMMAND", "Draft scrim number reservations are limited to signed Kakao V4 creates.");
    }

    const partyCommand = PARTY_TYPES.has(command.type);
    const party = partyCommand ? await this.dependencies.repository.loadPartyForUpdate(transaction, command.aggregateId) : null;
    const scrim = partyCommand ? null : await this.dependencies.repository.loadScrimForUpdate(transaction, command.aggregateId);
    const create = CREATE_TYPES.has(command.type);
    const current = partyCommand ? party : scrim;
    if (create ? current !== null : current === null) throw new RecruitingApplicationError(create ? "ALREADY_EXISTS" : "NOT_FOUND", create ? "Recruit aggregate already exists." : "Recruit aggregate does not exist.");
    const storedCopy = command.type === "SYNC_PARTY" && isPartyFormCode(command.payload.copyGuard?.saveReference);
    const appliesToLatestLockedAggregate = PARTY_MEMBER_TYPES.has(command.type) || SCRIM_PARTICIPANT_TYPES.has(command.type) || storedCopy;
    if (create ? command.metadata.expectedRevision !== 0 : !appliesToLatestLockedAggregate && current!.revision !== command.metadata.expectedRevision) throw new RecruitingApplicationError("REVISION_CONFLICT", "Recruit aggregate revision changed.");

    const now = this.dependencies.clock.now();
    if (!Number.isFinite(now.getTime())) throw new RecruitingApplicationError("INVALID_COMMAND", "Clock returned an invalid time.");
    let nextParty: RecruitParty | null = party;
    let nextScrim: ScrimRecruit | null = scrim;
    let memberMutation: Readonly<{
      action: "ADD" | "REMOVE";
      outcome: "APPLIED" | "ALREADY_PRESENT" | "NOT_FOUND";
      name: string;
      slotNo: number | null;
      substitute: boolean | null;
    }> | null = null;
    switch (command.type) {
      case "CREATE_PARTY":
        nextParty = createRecruitParty({
          id: command.aggregateId,
          sourceRoomId: command.metadata.actor.kind === "BOT" ? command.metadata.actor.authorizationIntent.roomId : null,
          sourceSenderId: command.metadata.actor.kind === "BOT" ? command.metadata.actor.authorizationIntent.senderId : null,
          ...command.payload,
          resetSequence: allocatedPartyIdentity?.resetSequence ?? command.payload.resetSequence!,
          recruitNumber: allocatedPartyIdentity?.recruitNumber ?? command.payload.recruitNumber!,
          type: command.payload.partyType,
          scheduledStartAt: parseDate(command.payload.scheduledStartAt, "scheduledStartAt"),
          protectedUntil: parseDate(command.payload.protectedUntil, "protectedUntil"),
          now,
        });
        break;
      case "SYNC_PARTY":
        nextParty = sync(command, party!, now, storedCopy
          ? await this.dependencies.repository.loadPartyCopySnapshot?.(transaction, party!, command.payload.copyGuard!.saveReference!, now) ?? null
          : undefined);
        break;
      case "PARTY_MEMBER_ADD":
      case "PARTY_MEMBER_REMOVE": {
        try {
          const result = mutateRecruitPartyMember({
            party: party!,
            mutation: { action: command.type === "PARTY_MEMBER_ADD" ? "ADD" : "REMOVE", name: command.payload.name },
            now,
          });
          nextParty = result.party;
          memberMutation = {
            action: result.action,
            outcome: result.outcome,
            name: result.name,
            slotNo: result.slotNo,
            substitute: result.substitute,
          };
        } catch (error) {
          if (error instanceof Error && error.message === "AMBIGUOUS_MEMBER") {
            throw new RecruitingApplicationError("AMBIGUOUS_MEMBER", "More than one party member matches this name.");
          }
          if (error instanceof Error && error.message === "RECRUIT_MEMBER_LIMIT_EXCEEDED") {
            throw new RecruitingApplicationError("RECRUIT_MEMBER_LIMIT_EXCEEDED", "The party member list has reached its total limit.");
          }
          throw error;
        }
        break;
      }
      case "GET_PARTY_STATUS":
        break;
      case "FINISH_PARTY":
      case "CANCEL_PARTY":
      case "RESET_PARTY":
        nextParty = transitionRecruitParty({ party: party!, expectedRevision: command.metadata.expectedRevision, command: command.type === "FINISH_PARTY" ? "FINISH" : command.type === "CANCEL_PARTY" ? "CANCEL" : "RESET", now });
        break;
      case "CREATE_SCRIM":
        nextScrim = createScrim(command, await this.inferScrimTournamentId(transaction, command, null), allocatedScrimNumber);
        break;
      case "SYNC_SCRIM": {
        const inferredTournamentId = await this.inferScrimTournamentId(transaction, command, scrim!);
        nextScrim = syncScrim(command, scrim!, now, inferredTournamentId);
        break;
      }
      case "ADD_SCRIM_PARTICIPANT":
      case "REMOVE_SCRIM_PARTICIPANT": {
        const result = mutateScrimParticipant({
          // Participant shortcuts are composed from the row locked above. The
          // revision resolved before this transaction is only a routing hint;
          // using it here would lose a different room member's preceding edit.
          scrim: scrim!, expectedRevision: scrim!.revision,
          action: command.type === "ADD_SCRIM_PARTICIPANT" ? "ADD" : "REMOVE",
          name: command.payload.name,
          team: command.payload.team,
          position: command.type === "ADD_SCRIM_PARTICIPANT" ? command.payload.position : undefined,
        });
        nextScrim = result.scrim;
        memberMutation = {
          action: command.type === "ADD_SCRIM_PARTICIPANT" ? "ADD" : "REMOVE",
          outcome: result.outcome, name: command.payload.name, slotNo: null, substitute: null,
        };
        break;
      }
      case "JOIN_SCRIM":
      case "REOPEN_SCRIM":
      case "CONFIRM_SCRIM":
      case "FINISH_SCRIM":
      case "COMPLETE_SCRIM":
      case "CANCEL_SCRIM":
        nextScrim = transitionScrimRecruit({
          scrim: scrim!, expectedRevision: command.metadata.expectedRevision,
          command: command.type === "JOIN_SCRIM" ? "JOIN" : command.type === "REOPEN_SCRIM" ? "REOPEN" : command.type === "CONFIRM_SCRIM" ? "CONFIRM" : command.type === "FINISH_SCRIM" ? "FINISH" : command.type === "COMPLETE_SCRIM" ? "COMPLETE" : "CANCEL",
          opponentTeamId: command.type === "JOIN_SCRIM" ? command.payload.opponentTeamId : undefined,
          opponentSenderId: command.type === "JOIN_SCRIM" && command.metadata.actor.kind === "BOT" ? command.metadata.actor.authorizationIntent.senderId : undefined,
        });
        break;
    }

    const next = (partyCommand ? nextParty : nextScrim)!;
    const formCode = partyCommand && command.metadata.actor.kind === "BOT" && command.metadata.actor.commandSource === "KAKAO_V4" &&
      (nextParty!.status === "DRAFT" || nextParty!.status === "IN_PROGRESS")
      ? await this.dependencies.repository.issuePartyCopySnapshot?.(transaction, nextParty!, now) : null;
    const data = partyCommand ? { ...partyJson(nextParty!), ...(memberMutation ?? {}), ...(formCode ? { formCode } : {}),
      ...(command.type === "SYNC_PARTY" && command.payload.copyGuard ? { copyAddedNames: nextParty!.members.filter((member) => !party!.members.some((old) => old.name === member.name)).map((member) => member.name), copyChanged: nextParty!.revision !== party!.revision } : {}) }
      : { ...scrimJson(nextScrim!), ...(memberMutation ?? {}) };
    const body: RecruitMutationBody = { aggregateKind: partyCommand ? "PARTY" : "SCRIM", aggregateId: next.id, revision: next.revision, status: next.status, commandType: command.type, data };
    const nowIso = now.toISOString();
    const mutationApplied = !STATUS_TYPES.has(command.type) && (create || current!.revision !== next.revision);
    if (mutationApplied) {
      if (partyCommand) await this.dependencies.repository.saveParty(transaction, { party: nextParty!, expectedRevision: appliesToLatestLockedAggregate ? party!.revision : command.metadata.expectedRevision, create });
      else await this.dependencies.repository.saveScrim(transaction, { scrim: nextScrim!, expectedRevision: appliesToLatestLockedAggregate ? scrim!.revision : command.metadata.expectedRevision, create });
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

  private async inferScrimTournamentId(
    transaction: RecruitingTransactionContext,
    command: Extract<RecruitingCommand, { type: "CREATE_SCRIM" | "SYNC_SCRIM" }>,
    current: ScrimRecruit | null,
  ) {
    if (command.type === "CREATE_SCRIM" && command.payload.initialStatus === "DRAFT") return null;
    if (command.payload.tournamentId || command.payload.legacyTournamentNumber !== null && command.payload.legacyTournamentNumber !== undefined) return null;
    if (command.type === "SYNC_SCRIM" && current?.status !== "DRAFT") return null;
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

function sync(command: Extract<RecruitingCommand, { type: "SYNC_PARTY" }>, party: RecruitParty, now: Date, storedBase?: JsonObject | null) {
  const guard = command.payload.copyGuard;
  const shortCode = isPartyFormCode(guard?.saveReference);
  if (guard && (guard.operatingDate !== party.recruitDate ||
      guard.submittedPartyType !== undefined && guard.submittedPartyType !== party.type ||
      guard.submittedMaximumMembers !== undefined && guard.submittedMaximumMembers !== party.maximumMembers ||
      (!shortCode && guard.saveReference !== null && guard.saveReference !== partyCopyReference(party)))) {
    throw new RecruitingApplicationError("REVISION_CONFLICT", "PARTY_COPY_CONFLICT");
  }
  const base = shortCode ? readPartyCopySnapshot(storedBase ?? null, party) : party;
  const editableCopy = shortCode && party.type === "PARTY_NUMBER";
  if (editableCopy) {
    const patches = command.payload.slotPatches;
    const observed = new Set(patches?.filter((patch) => patch.state !== "ABSENT")
      .map((patch) => `${patch.substitute ? "SUB" : "MAIN"}:${patch.slotNo}`));
    if (!patches || !["PRESENT_VALUE", "PRESENT_EMPTY"].includes(command.payload.startTimeState ?? "ABSENT") ||
        !["PRESENT_VALUE", "PRESENT_EMPTY"].includes(command.payload.gameInfoState ?? "ABSENT") ||
        Array.from({ length: base.maximumMembers }, (_, index) => index + 1).some((slot) => !observed.has(`MAIN:${slot}`)) ||
        !patches.some((patch) => patch.substitute && patch.state !== "ABSENT") ||
        base.members.some((member) => member.substitute && !observed.has(`SUB:${member.slotNo}`))) {
      throw new Error("PARTY_COPY_INCOMPLETE");
    }
  }
  const submittedMembers = command.payload.slotPatches ? mergeRecruitPartySlotPatches(base, command.payload.slotPatches) : command.payload.members;
  const metadataValue = (value: string | null | undefined, state: string | undefined, fallback: string | null) =>
    state === "PRESENT_EMPTY" ? null : state === "ABSENT" || value === undefined ? fallback : value;
  const submittedTime = metadataValue(command.payload.startTimeText, command.payload.startTimeState, base.startTimeText) || "미정";
  const submittedGame = metadataValue(command.payload.gameInfo, command.payload.gameInfoState, base.gameInfo) || "미입력";
  const submittedOrganizer = metadataValue(command.payload.organizerText, command.payload.organizerState, base.organizerText);
  if (guard && !editableCopy && party.status !== "DRAFT" && (
    submittedTime !== base.startTimeText || submittedGame !== base.gameInfo || submittedOrganizer !== base.organizerText ||
    base.startTimeText !== party.startTimeText || base.gameInfo !== party.gameInfo || base.organizerText !== party.organizerText
  )) throw new Error("PARTY_COPY_METADATA");
  const edits = editableCopy ? mergePartyCopyEdits(base, party, {
    members: submittedMembers, startTimeText: submittedTime, gameInfo: submittedGame, organizerText: submittedOrganizer,
  }) : null;
  const members = edits?.members ?? (guard ? mergePartyCopyAdditions(base, party, submittedMembers) : submittedMembers);
  const updated = syncRecruitParty({
    party,
    expectedRevision: shortCode ? party.revision : command.metadata.expectedRevision,
    members,
    startTimeText: edits?.startTimeText ?? (guard && party.status === "DRAFT" && !command.payload.startTimeText ? "미정" : command.payload.startTimeText),
    startTimeState: edits || guard && party.status === "DRAFT" && !command.payload.startTimeText ? "PRESENT_VALUE" : command.payload.startTimeState,
    gameInfo: edits?.gameInfo ?? command.payload.gameInfo,
    gameInfoState: edits ? "PRESENT_VALUE" : command.payload.gameInfoState,
    organizerText: edits ? edits.organizerText : command.payload.organizerText,
    organizerState: edits ? edits.organizerText === null ? "PRESENT_EMPTY" : "PRESENT_VALUE" : command.payload.organizerState,
    scheduledStartAt: guard && (edits ? edits.startTimeText === party.startTimeText : command.payload.startTimeText === party.startTimeText)
      ? party.scheduledStartAt
      : command.payload.scheduledStartAt === undefined
      ? undefined
      : parseDate(command.payload.scheduledStartAt, "scheduledStartAt"),
    now,
  });
  if (guard) {
    const identity = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
    const names = updated.members.map((member) => identity(member.name));
    if (new Set(names).size !== names.length) throw new RecruitingApplicationError("AMBIGUOUS_MEMBER", "PARTY_COPY_DUPLICATE_NAME");
    if (guard.saveReference === null && party.status !== "DRAFT") {
      const preserved = party.members.every((member) => updated.members.some((next) => next.slotNo === member.slotNo && next.substitute === member.substitute && next.position === member.position && next.name === member.name));
      if (!preserved || updated.startTimeText !== party.startTimeText || updated.gameInfo !== party.gameInfo || updated.organizerText !== party.organizerText || updated.scheduledStartAt?.getTime() !== party.scheduledStartAt?.getTime()) {
        throw new RecruitingApplicationError("REVISION_CONFLICT", "PARTY_COPY_CONFLICT");
      }
    }
  }
  return updated;
}

function syncScrim(
  command: Extract<RecruitingCommand, { type: "SYNC_SCRIM" }>,
  scrim: ScrimRecruit,
  now: Date,
  inferredTournamentId: string | null,
) {
  const payload = command.payload;
  return syncScrimRecruit({
    scrim,
    expectedRevision: command.metadata.expectedRevision,
    recruitDate: payload.recruitDate,
    scrimNumber: payload.scrimNumber,
    tournamentId: payload.tournamentId ?? inferredTournamentId,
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
    scheduledAt: payload.scheduledAt === null && scrim.status === "DRAFT"
      ? now
      : parseDate(payload.scheduledAt, "scheduledAt"),
    bestOf: payload.bestOf,
    organizerText: payload.organizerText,
  });
}
