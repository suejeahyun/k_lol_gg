import {
  validateCompetitionAuditEvent,
  validateCompetitionCommandEnvelope,
  validateCompetitionCommandReceipt,
  validateCompetitionOutboxEvent,
  type CompetitionAuditEvent,
  type CompetitionCommandEnvelope,
  type CompetitionCommandReceipt,
  type CompetitionOutboxEvent,
  type JsonObject,
} from "../core";
import { requireCompetition } from "../core/error";
import {
  applyDestructionTerminalCommand,
  toDestructionPublicDto,
  type DestructionAggregate,
  type DestructionPublicDto,
  type DestructionTerminalCommand,
} from "./state";

export type DestructionTerminalCommandPayload = JsonObject & Readonly<{
  commandType: "COMPLETE" | "CANCEL" | "RESTORE_CANCELLED";
  finalResultConfirmed?: boolean;
  reason?: string;
}>;

export type DestructionMutationBody = JsonObject & Readonly<{
  destruction: DestructionPublicDto & JsonObject;
}>;

export type DestructionReceiptLookup = Readonly<{
  actorUserAccountId: string;
  scope: string;
  keyHash: Uint8Array;
}>;

export type DestructionCommit = Readonly<{
  expectedRevision: number;
  aggregate: DestructionAggregate;
  receipt: CompetitionCommandReceipt<DestructionMutationBody>;
  audit: CompetitionAuditEvent;
  outbox: CompetitionOutboxEvent;
}>;

export interface DestructionCommandRepository {
  findReceipt(lookup: DestructionReceiptLookup): Promise<CompetitionCommandReceipt<DestructionMutationBody> | null>;
  loadForUpdate(aggregateId: string): Promise<DestructionAggregate | null>;
  commit(command: DestructionCommit): Promise<void>;
}
function sameDigest(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function terminalCommand(payload: DestructionTerminalCommandPayload): DestructionTerminalCommand {
  const keys = Object.keys(payload).sort();
  if (payload.commandType === "COMPLETE") {
    requireCompetition(keys.every((key) => key === "commandType" || key === "finalResultConfirmed") && typeof payload.finalResultConfirmed === "boolean", "INVALID_COMMAND_CONTRACT", "COMPLETE accepts only finalResultConfirmed.");
    return { type: "COMPLETE", finalResultConfirmed: payload.finalResultConfirmed };
  }
  if (payload.commandType === "CANCEL") {
    requireCompetition(keys.every((key) => key === "commandType" || key === "reason") && typeof payload.reason === "string", "INVALID_COMMAND_CONTRACT", "CANCEL accepts only a reason.");
    return { type: "CANCEL", reason: payload.reason };
  }
  requireCompetition(payload.commandType === "RESTORE_CANCELLED" && keys.length === 1, "INVALID_COMMAND_CONTRACT", "RESTORE_CANCELLED accepts no extra fields.");
  return { type: "RESTORE_CANCELLED" };
}

function expectedScope(commandType: DestructionTerminalCommandPayload["commandType"]) {
  if (commandType === "COMPLETE") return "admin:destruction:complete";
  if (commandType === "CANCEL") return "admin:destruction:cancel";
  return "admin:destruction:restore";
}

function lifecycleJson(aggregate: DestructionAggregate): JsonObject {
  return {
    id: aggregate.id,
    revision: aggregate.revision,
    status: aggregate.lifecycle.status,
    cancelledFrom: aggregate.lifecycle.cancelledFrom,
    cancellationReason: aggregate.lifecycle.cancellationReason,
    championTeamId: aggregate.tournamentBracket?.championTeamId ?? null,
  };
}

function publicBody(aggregate: DestructionAggregate): DestructionMutationBody {
  return { destruction: toDestructionPublicDto(aggregate) as DestructionPublicDto & JsonObject };
}

export async function executeDestructionTerminalCommand(
  repository: DestructionCommandRepository,
  envelope: CompetitionCommandEnvelope<DestructionTerminalCommandPayload>,
): Promise<Readonly<{ replayed: boolean; body: DestructionMutationBody; revision: number }>> {
  validateCompetitionCommandEnvelope(envelope);
  requireCompetition(envelope.actor.purpose === "ADMIN" && envelope.actor.requiredRole === "ADMIN" && envelope.authorization === "ADMIN_MUTATION", "INVALID_COMMAND_CONTRACT", "Destruction lifecycle commands require an ADMIN-purpose session.");
  requireCompetition(envelope.aggregateId !== null && envelope.expectedRevision !== null, "INVALID_COMMAND_CONTRACT", "Destruction lifecycle commands require an aggregate and expected revision.");
  requireCompetition(envelope.scope === expectedScope(envelope.payload.commandType), "INVALID_COMMAND_CONTRACT", "The command scope does not match the payload.");

  const lookup = { actorUserAccountId: envelope.actor.userAccountId, scope: envelope.scope, keyHash: envelope.keyHash };
  const existing = await repository.findReceipt(lookup);
  if (existing) {
    requireCompetition(sameDigest(existing.requestHash, envelope.requestHash), "INVALID_COMMAND_CONTRACT", "An idempotency key cannot be reused for a different request.");
    requireCompetition(existing.revision !== null, "INVALID_COMMAND_CONTRACT", "A lifecycle receipt requires a revision.");
    return Object.freeze({ replayed: true, body: existing.body, revision: existing.revision });
  }

  const current = await repository.loadForUpdate(envelope.aggregateId);
  requireCompetition(current, "PRECONDITION_FAILED", "The destruction competition does not exist.");
  requireCompetition(current.revision === envelope.expectedRevision, "PRECONDITION_FAILED", "The destruction competition revision changed.");
  const transitioned = applyDestructionTerminalCommand(current, terminalCommand(envelope.payload));
  const aggregate = Object.freeze({ ...transitioned, revision: current.revision + 1 });
  const body = publicBody(aggregate);
  const expiresAt = new Date(Date.parse(envelope.issuedAt) + 24 * 60 * 60 * 1_000).toISOString();
  const receipt: CompetitionCommandReceipt<DestructionMutationBody> = {
    actorUserAccountId: envelope.actor.userAccountId,
    scope: envelope.scope,
    keyHash: envelope.keyHash,
    requestHash: envelope.requestHash,
    responseStatus: 200,
    body,
    revision: aggregate.revision,
    createdAt: envelope.issuedAt,
    expiresAt,
  };
  const audit: CompetitionAuditEvent = {
    requestId: envelope.requestId,
    actorUserAccountId: envelope.actor.userAccountId,
    action: `DESTRUCTION_${envelope.payload.commandType}`,
    targetType: "DESTRUCTION",
    targetId: aggregate.id,
    before: lifecycleJson(current),
    after: lifecycleJson(aggregate),
    metadata: { scope: envelope.scope },
    occurredAt: envelope.issuedAt,
  };
  const outbox: CompetitionOutboxEvent = {
    id: envelope.requestId,
    requestId: envelope.requestId,
    aggregateType: "DESTRUCTION",
    aggregateId: aggregate.id,
    aggregateRevision: aggregate.revision,
    eventType: `DESTRUCTION_${envelope.payload.commandType}`,
    dedupeKey: `${aggregate.id}:${aggregate.revision}`,
    payload: { destructionId: aggregate.id, revision: aggregate.revision, status: aggregate.lifecycle.status },
    status: "PENDING",
    attemptCount: 0,
    occurredAt: envelope.issuedAt,
    deliveredAt: null,
  };
  validateCompetitionCommandReceipt(receipt);
  validateCompetitionAuditEvent(audit);
  validateCompetitionOutboxEvent(outbox);
  await repository.commit({ expectedRevision: current.revision, aggregate, receipt, audit, outbox });
  return Object.freeze({ replayed: false, body, revision: aggregate.revision });
}
