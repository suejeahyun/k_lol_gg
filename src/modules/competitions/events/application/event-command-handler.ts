import {
  canonicalIdentifier,
  validateCompetitionAuditEvent,
  validateCompetitionCommandEnvelope,
  validateCompetitionCommandReceipt,
  validateCompetitionOutboxEvent,
  type CompetitionAuditEvent,
  type CompetitionCommandReceipt,
  type CompetitionOutboxEvent,
  type JsonObject,
} from "../../core";
import {
  addAdminEventParticipants,
  applyEventTeamBalance,
  cancelEvent,
  cancelOwnEventApplication,
  closeEventRecruitment,
  completeEvent,
  correctEventFixtureResult,
  createEventAggregate,
  eventTeamBalanceParticipants,
  EventDomainError,
  generateEventBracket,
  recordEventFixtureResult,
  replaceEventSettings,
  restoreCancelledEvent,
  setEventMediaGallery,
  startEventRecruitment,
  upsertOwnEventApplication,
  type EventAggregate,
  type EventResultCorrectionPlan,
} from "../domain/event";
import { eventCommandRequestFingerprint, type EventCommand } from "./event-command";
import type {
  EventAuditPort,
  EventAuthorizationPort,
  EventClockPort,
  EventCommandReceiptPort,
  EventMutationBody,
  EventMutationResult,
  EventOutboxPort,
  EventRepository,
  EventTeamBalancePort,
  EventTransactionContext,
  EventUnitOfWork,
} from "./ports";

export type EventCommandHandlerDependencies = Readonly<{
  unitOfWork: EventUnitOfWork;
  repository: EventRepository;
  authorization: EventAuthorizationPort;
  receipts: EventCommandReceiptPort;
  audit: EventAuditPort;
  outbox: EventOutboxPort;
  teamBalance: EventTeamBalancePort;
  clock: EventClockPort;
}>;

const OWNER_COMMAND_TYPES = new Set<EventCommand["type"]>([
  "UPSERT_OWN_APPLICATION",
  "CANCEL_OWN_APPLICATION",
]);

function validateCommand(command: EventCommand) {
  canonicalIdentifier(command.eventId, "eventId");
  const metadata = command.metadata;
  const ownerCommand = OWNER_COMMAND_TYPES.has(command.type);
  if ((ownerCommand && metadata.actor.purpose !== "ACCOUNT") || (!ownerCommand && metadata.actor.purpose !== "ADMIN")) {
    throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "The command type and actor session purpose do not match.");
  }
  validateCompetitionCommandEnvelope({
    actor: metadata.actor,
    authorization: metadata.actor.purpose === "ADMIN" ? "ADMIN_MUTATION" : "APPROVED_ACCOUNT_MUTATION",
    requestId: metadata.requestId,
    aggregateId: command.eventId,
    expectedRevision: metadata.expectedRevision,
    scope: metadata.idempotency.scope,
    keyHash: metadata.idempotency.keyHash,
    requestHash: metadata.idempotency.requestFingerprint,
    issuedAt: metadata.issuedAt,
    payload: { commandType: command.type, eventId: command.eventId },
  });
  const expectedFingerprint = eventCommandRequestFingerprint(command);
  if (
    expectedFingerprint.byteLength !== metadata.idempotency.requestFingerprint.byteLength ||
    expectedFingerprint.some((byte, index) => byte !== metadata.idempotency.requestFingerprint[index])
  ) {
    throw new EventDomainError("IDEMPOTENCY_MISMATCH", "The request fingerprint does not match the event command payload.");
  }

  if (metadata.actor.purpose === "ACCOUNT") {
    const intent = metadata.authorizationIntent;
    if (
      intent.kind !== "APPROVED_OWNER" ||
      intent.ownerUserAccountId !== metadata.actor.userAccountId ||
      intent.requireApprovedAccount !== true ||
      intent.requireOwnership !== true ||
      intent.transactionRecheck !== true
    ) {
      throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "User event commands require APPROVED+OWNER transaction recheck.");
    }
    if (
      command.type === "UPSERT_OWN_APPLICATION" &&
      intent.playerId !== command.payload.playerId
    ) {
      throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "The ownership intent must bind the applied player.");
    }
    if (command.type === "CANCEL_OWN_APPLICATION" && intent.playerId !== null) {
      throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "Application cancellation resolves player ownership inside the transaction.");
    }
  } else {
    const intent = metadata.authorizationIntent;
    if (
      intent.kind !== "ADMIN_TOTP" ||
      intent.minimumRole !== "ADMIN" ||
      intent.requireTotp !== true ||
      intent.transactionRecheck !== true
    ) {
      throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "Admin event commands require ADMIN+TOTP transaction recheck.");
    }
  }
}

function snapshot(aggregate: EventAggregate | null): JsonObject | null {
  if (!aggregate) return null;
  return {
    revision: aggregate.revision,
    status: aggregate.lifecycle.status,
    participantCount: aggregate.participants.filter((participant) => participant.status === "ACTIVE").length,
    teamCount: aggregate.teams.length,
    winnerTeamId: aggregate.winnerTeamId,
    mvpParticipantId: aggregate.mvpParticipantId,
  };
}

function correctionJson(plan: EventResultCorrectionPlan): JsonObject {
  return {
    correctedFixtureId: plan.correctedFixtureId,
    downstreamFixtureIds: plan.downstreamFixtureIds,
    invalidatedResultFixtureIds: plan.invalidatedResultFixtureIds,
    previousWinnerTeamId: plan.previousWinnerTeamId,
    nextWinnerTeamId: plan.nextWinnerTeamId,
  };
}

async function decide(
  command: EventCommand,
  current: EventAggregate | null,
  now: string,
  transaction: EventTransactionContext,
  teamBalance: EventTeamBalancePort,
) {
  let aggregate: EventAggregate;
  let correctionPlan: EventResultCorrectionPlan | null = null;

  if (command.type === "CREATE_EVENT") {
    if (current) throw new EventDomainError("PRECONDITION_FAILED", "Event already exists.");
    aggregate = createEventAggregate({ id: command.eventId, settings: command.payload.settings, now });
    return { aggregate, correctionPlan };
  }
  if (!current) throw new EventDomainError("NOT_FOUND", "Event does not exist.");

  switch (command.type) {
    case "REPLACE_SETTINGS":
      aggregate = replaceEventSettings(current, command.payload.settings, now);
      break;
    case "START_RECRUITMENT":
      aggregate = startEventRecruitment(current, now);
      break;
    case "CLOSE_RECRUITMENT":
      aggregate = closeEventRecruitment(current, now);
      break;
    case "UPSERT_OWN_APPLICATION":
      aggregate = upsertOwnEventApplication(current, {
        id: command.payload.participantId,
        playerId: command.payload.playerId,
        ownerUserAccountId: command.metadata.authorizationIntent.ownerUserAccountId,
        mainPosition: command.payload.mainPosition,
        subPositions: command.payload.subPositions,
      }, now);
      break;
    case "CANCEL_OWN_APPLICATION":
      aggregate = cancelOwnEventApplication(current, command.metadata.authorizationIntent.ownerUserAccountId, now);
      break;
    case "IMPORT_PARTICIPANTS":
      aggregate = addAdminEventParticipants(current, command.payload.participants, "ADMIN_IMPORT", now);
      break;
    case "ADD_PARTICIPANT":
      aggregate = addAdminEventParticipants(current, [command.payload.participant], "ADMIN_MANUAL", now);
      break;
    case "BUILD_TEAMS": {
      const participants = eventTeamBalanceParticipants(current);
      const calculation = await teamBalance.calculate({ transaction, eventId: current.id, participants });
      aggregate = applyEventTeamBalance(current, calculation, now);
      break;
    }
    case "GENERATE_BRACKET":
      aggregate = generateEventBracket(current, now);
      break;
    case "RECORD_RESULT":
      aggregate = recordEventFixtureResult(current, command.payload, now);
      break;
    case "CORRECT_RESULT": {
      const corrected = correctEventFixtureResult(current, command.payload, now);
      aggregate = corrected.aggregate;
      correctionPlan = corrected.plan;
      break;
    }
    case "COMPLETE_EVENT":
      aggregate = completeEvent(current, command.payload.mvpParticipantId, now);
      break;
    case "SET_MEDIA_GALLERY":
      aggregate = setEventMediaGallery(current, command.payload.galleryId, now);
      break;
    case "CANCEL_EVENT":
      aggregate = cancelEvent(current, command.payload.reason, now);
      break;
    case "RESTORE_EVENT":
      aggregate = restoreCancelledEvent(current, now);
      break;
  }
  return { aggregate, correctionPlan };
}

function auditEvent(
  command: EventCommand,
  before: EventAggregate | null,
  after: EventAggregate,
  now: string,
  correctionPlan: EventResultCorrectionPlan | null,
): CompetitionAuditEvent {
  return validateCompetitionAuditEvent({
    requestId: command.metadata.requestId,
    actorUserAccountId: command.metadata.actor.userAccountId,
    action: `EVENT_${command.type}`,
    targetType: "EVENT",
    targetId: after.id,
    before: snapshot(before),
    after: snapshot(after),
    metadata: correctionPlan ? { correctionPlan: correctionJson(correctionPlan) } : {},
    occurredAt: now,
  });
}

function outboxEvent(command: EventCommand, aggregate: EventAggregate, now: string): CompetitionOutboxEvent {
  return validateCompetitionOutboxEvent({
    id: `${command.metadata.requestId}:OUTBOX`,
    requestId: command.metadata.requestId,
    aggregateType: "EVENT",
    aggregateId: aggregate.id,
    aggregateRevision: aggregate.revision,
    eventType: `EVENT_${command.type}`,
    dedupeKey: `${aggregate.id}:${aggregate.revision}:${command.type}`,
    payload: {
      eventId: aggregate.id,
      revision: aggregate.revision,
      status: aggregate.lifecycle.status,
      commandType: command.type,
    },
    status: "PENDING",
    attemptCount: 0,
    occurredAt: now,
    deliveredAt: null,
  });
}

function mutationBody(
  command: EventCommand,
  aggregate: EventAggregate,
  correctionPlan: EventResultCorrectionPlan | null,
): EventMutationBody {
  return {
    eventId: aggregate.id,
    revision: aggregate.revision,
    status: aggregate.lifecycle.status,
    commandType: command.type,
    ...(correctionPlan ? { correctionPlan: correctionJson(correctionPlan) } : {}),
  };
}

function sameDigest(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

export class EventCommandHandler {
  constructor(private readonly dependencies: EventCommandHandlerDependencies) {}

  handle(command: EventCommand): Promise<EventMutationResult> {
    validateCommand(command);
    return this.dependencies.unitOfWork.transaction((transaction) => this.handleTransaction(transaction, command));
  }

  private async handleTransaction(
    transaction: EventTransactionContext,
    command: EventCommand,
  ): Promise<EventMutationResult> {
    await this.dependencies.authorization.recheck(transaction, {
      actor: command.metadata.actor,
      intent: command.metadata.authorizationIntent,
      eventId: command.eventId,
    });
    const claim = await this.dependencies.receipts.claim(transaction, command);
    if (claim.kind === "MISMATCH") {
      throw new EventDomainError("IDEMPOTENCY_MISMATCH", "The idempotency key was reused for a different command fingerprint.");
    }
    if (claim.kind === "REPLAY") {
      validateCompetitionCommandReceipt(claim.receipt);
      if (
        claim.receipt.revision === null ||
        claim.receipt.actorUserAccountId !== command.metadata.actor.userAccountId ||
        claim.receipt.scope !== command.metadata.idempotency.scope ||
        !sameDigest(claim.receipt.keyHash, command.metadata.idempotency.keyHash) ||
        !sameDigest(claim.receipt.requestHash, command.metadata.idempotency.requestFingerprint) ||
        claim.receipt.body.eventId !== command.eventId ||
        claim.receipt.body.commandType !== command.type
      ) {
        throw new EventDomainError("IDEMPOTENCY_MISMATCH", "An event command receipt must retain its aggregate revision.");
      }
      return { body: claim.receipt.body, revision: claim.receipt.revision, replayed: true };
    }

    const current = await this.dependencies.repository.loadForUpdate(transaction, command.eventId);
    if (current && current.id !== command.eventId) {
      throw new EventDomainError("INVALID_STATE", "The locked aggregate does not match the command event.");
    }
    if (command.type === "CREATE_EVENT") {
      if (command.metadata.expectedRevision !== 0) throw new EventDomainError("REVISION_CONFLICT", "Create commands start at revision zero.");
    } else if (!current || current.revision !== command.metadata.expectedRevision) {
      throw new EventDomainError(current ? "REVISION_CONFLICT" : "NOT_FOUND", current ? "Event revision changed." : "Event does not exist.");
    }
    const now = this.dependencies.clock.now();
    if (command.type === "SET_MEDIA_GALLERY" && command.payload.galleryId) {
      await this.dependencies.repository.assertPublishedReadyGallery(transaction, command.payload.galleryId);
    }
    const decision = await decide(command, current, now, transaction, this.dependencies.teamBalance);
    const aggregate = Object.freeze({ ...decision.aggregate, revision: decision.aggregate.revision + 1 });
    await this.dependencies.repository.save(transaction, {
      aggregate,
      expectedRevision: command.metadata.expectedRevision,
      create: command.type === "CREATE_EVENT",
    });
    await this.dependencies.audit.append(transaction, auditEvent(command, current, aggregate, now, decision.correctionPlan));
    await this.dependencies.outbox.append(transaction, outboxEvent(command, aggregate, now));

    const body = mutationBody(command, aggregate, decision.correctionPlan);
    const receipt: CompetitionCommandReceipt<EventMutationBody> = validateCompetitionCommandReceipt({
      actorUserAccountId: command.metadata.actor.userAccountId,
      scope: command.metadata.idempotency.scope,
      keyHash: command.metadata.idempotency.keyHash,
      requestHash: command.metadata.idempotency.requestFingerprint,
      responseStatus: command.type === "CREATE_EVENT" ? 201 : 200,
      body,
      revision: aggregate.revision,
      createdAt: now,
      expiresAt: this.dependencies.clock.receiptExpiresAt(now),
    });
    await this.dependencies.receipts.complete(transaction, receipt);
    return { body, revision: aggregate.revision, replayed: false };
  }
}
