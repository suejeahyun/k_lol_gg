import { canonicalIdentifier, type JsonObject } from "@/modules/competitions/core";

import { currentEvidence, reviewDisciplineEvidence, submitDisciplineEvidence, type DisciplineTask } from "../domain/evidence-task";
import { disciplineCommandRequestHash, type DisciplineCommand } from "./commands";
import type {
  CurrentDisciplineActor,
  DisciplineAuditPort,
  DisciplineAuthorizationPort,
  DisciplineClockPort,
  DisciplineCommandReceipt,
  DisciplineCommandResult,
  DisciplineMutationBody,
  DisciplineOutboxPort,
  DisciplineReceiptPort,
  DisciplineRepository,
  DisciplineTransaction,
  DisciplineUnitOfWork,
} from "./ports";

export class DisciplineApplicationError extends Error {
  constructor(
    readonly code: "INVALID_COMMAND" | "INVALID_AUTHORIZATION" | "NOT_FOUND" | "IDEMPOTENCY_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "DisciplineApplicationError";
  }
}

export type DisciplineCommandHandlerDependencies = Readonly<{
  unitOfWork: DisciplineUnitOfWork;
  repository: DisciplineRepository;
  authorization: DisciplineAuthorizationPort;
  receipts: DisciplineReceiptPort;
  audit: DisciplineAuditPort;
  outbox: DisciplineOutboxPort;
  clock: DisciplineClockPort;
}>;

const EXPECTED_SCOPE: Readonly<Record<DisciplineCommand["type"], string>> = {
  SUBMIT_EVIDENCE: "account:discipline:evidence:submit",
  REVIEW_EVIDENCE: "admin:discipline:evidence:review",
};

function sameDigest(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function canonicalInstant(value: string, label: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new DisciplineApplicationError("INVALID_COMMAND", `${label} must be a canonical ISO instant.`);
  }
}

function validateDigest(value: Uint8Array, label: string) {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new DisciplineApplicationError("INVALID_COMMAND", `${label} must be a 32-byte digest.`);
  }
}

function validateCommand(command: DisciplineCommand) {
  canonicalIdentifier(command.taskId, "taskId");
  canonicalIdentifier(command.metadata.principalId, "principalId");
  canonicalIdentifier(command.metadata.requestId, "requestId");
  canonicalIdentifier(command.metadata.idempotency.scope, "scope");
  if (command.metadata.idempotency.scope !== EXPECTED_SCOPE[command.type]) {
    throw new DisciplineApplicationError("INVALID_COMMAND", "Command scope does not match its action.");
  }
  if (!Number.isSafeInteger(command.metadata.expectedRevision) || command.metadata.expectedRevision < 0) {
    throw new DisciplineApplicationError("INVALID_COMMAND", "Expected revision must be a non-negative safe integer.");
  }
  canonicalInstant(command.metadata.issuedAt, "issuedAt");
  validateDigest(command.metadata.idempotency.keyHash, "keyHash");
  validateDigest(command.metadata.idempotency.requestHash, "requestHash");
  if (!/^[a-f0-9]{64}$/u.test(command.metadata.idempotency.bodyDigestHex)) {
    throw new DisciplineApplicationError("INVALID_COMMAND", "bodyDigestHex must be lowercase SHA-256.");
  }
  if (!sameDigest(command.metadata.idempotency.requestHash, disciplineCommandRequestHash(command))) {
    throw new DisciplineApplicationError("IDEMPOTENCY_MISMATCH", "Request hash does not match the immutable command body.");
  }
  const intent = command.metadata.authorizationIntent;
  canonicalIdentifier(intent.sessionId, "sessionId");
  if (command.type === "SUBMIT_EVIDENCE") {
    canonicalIdentifier(command.payload.privateAssetId, "privateAssetId");
    if (intent.kind !== "ACCOUNT_SESSION" || intent.transactionRecheck !== true) {
      throw new DisciplineApplicationError("INVALID_AUTHORIZATION", "Evidence submission requires a live account session.");
    }
  } else if (
    intent.kind !== "ADMIN_TOTP" ||
    intent.requireTotp !== true ||
    intent.transactionRecheck !== true ||
    !["ADMIN", "SUPER_ADMIN"].includes(intent.minimumRole)
  ) {
    throw new DisciplineApplicationError("INVALID_AUTHORIZATION", "Evidence review requires an ADMIN-purpose TOTP session.");
  }
}

function taskSnapshot(task: DisciplineTask): JsonObject {
  return {
    id: task.id,
    revision: task.revision,
    status: task.status,
    submittedEvidenceCount: currentEvidence(task).length,
    requiredGameCount: task.requiredGameCount,
  };
}

function mutationBody(task: DisciplineTask): DisciplineMutationBody {
  return {
    taskId: task.id,
    revision: task.revision,
    status: task.status,
    submittedEvidenceCount: currentEvidence(task).length,
    requiredGameCount: task.requiredGameCount,
  };
}

function validateReplay(command: DisciplineCommand, receipt: DisciplineCommandReceipt) {
  canonicalInstant(receipt.createdAt, "receipt.createdAt");
  canonicalInstant(receipt.expiresAt, "receipt.expiresAt");
  validateDigest(receipt.keyHash, "receipt.keyHash");
  validateDigest(receipt.requestHash, "receipt.requestHash");
  if (
    receipt.principalId !== command.metadata.principalId ||
    receipt.scope !== command.metadata.idempotency.scope ||
    receipt.bodyDigestHex !== command.metadata.idempotency.bodyDigestHex ||
    !sameDigest(receipt.keyHash, command.metadata.idempotency.keyHash) ||
    !sameDigest(receipt.requestHash, command.metadata.idempotency.requestHash) ||
    receipt.body.taskId !== command.taskId ||
    receipt.body.revision < 0 ||
    Date.parse(receipt.expiresAt) <= Date.parse(receipt.createdAt)
  ) {
    throw new DisciplineApplicationError("IDEMPOTENCY_MISMATCH", "Durable receipt does not match the command identity.");
  }
}

export class DisciplineCommandHandler {
  constructor(private readonly dependencies: DisciplineCommandHandlerDependencies) {}

  handle(command: DisciplineCommand): Promise<DisciplineCommandResult> {
    validateCommand(command);
    return this.dependencies.unitOfWork.transaction((transaction) => this.handleTransaction(transaction, command));
  }

  private async handleTransaction(
    transaction: DisciplineTransaction,
    command: DisciplineCommand,
  ): Promise<DisciplineCommandResult> {
    const actor = await this.dependencies.authorization.recheck(transaction, {
      principalId: command.metadata.principalId,
      action: command.type,
      authorizationIntent: command.metadata.authorizationIntent,
    });
    this.requireActor(command, actor);

    const claim = await this.dependencies.receipts.claim(transaction, command);
    if (claim.kind === "MISMATCH") {
      throw new DisciplineApplicationError("IDEMPOTENCY_MISMATCH", "Request key was reused for a different command.");
    }
    if (claim.kind === "REPLAY") {
      validateReplay(command, claim.receipt);
      return { body: claim.receipt.body, revision: claim.receipt.body.revision, replayed: true };
    }

    const task = await this.dependencies.repository.loadTaskForUpdate(transaction, command.taskId);
    if (!task) throw new DisciplineApplicationError("NOT_FOUND", "Discipline task is not available.");
    const now = this.dependencies.clock.now();
    if (!Number.isFinite(now.getTime())) throw new DisciplineApplicationError("INVALID_COMMAND", "Clock returned an invalid time.");

    let next: DisciplineTask;
    if (command.type === "SUBMIT_EVIDENCE") {
      const account = actor as Extract<CurrentDisciplineActor, { purpose: "ACCOUNT" }>;
      const asset = await this.dependencies.repository.loadReadyEvidenceAssetForUpdate(transaction, {
        assetId: command.payload.privateAssetId,
        taskId: command.taskId,
        userAccountId: account.userAccountId,
      });
      if (!asset) throw new DisciplineApplicationError("NOT_FOUND", "Discipline evidence is not available.");
      next = submitDisciplineEvidence({
        task,
        expectedRevision: command.metadata.expectedRevision,
        accountId: account.userAccountId,
        playerId: account.playerId,
        evidence: { id: asset.id, sha256Hex: asset.sha256Hex, submittedAt: asset.readyAt, supersededAt: null },
        now,
      });
    } else {
      next = reviewDisciplineEvidence({
        task,
        expectedRevision: command.metadata.expectedRevision,
        decision: command.payload.decision,
        reviewNote: command.payload.reviewNote,
        now,
      });
    }

    await this.dependencies.repository.saveTask(transaction, {
      task: next,
      expectedRevision: command.metadata.expectedRevision,
    });
    const occurredAt = now.toISOString();
    const eventType = `DISCIPLINE_${command.type}` as const;
    await this.dependencies.audit.append(transaction, {
      requestId: command.metadata.requestId,
      actorPrincipalId: actor!.principalId,
      action: eventType,
      targetId: next.id,
      before: taskSnapshot(task),
      after: taskSnapshot(next),
      occurredAt,
    });
    await this.dependencies.outbox.append(transaction, {
      id: `${command.metadata.requestId}:OUTBOX`,
      requestId: command.metadata.requestId,
      aggregateId: next.id,
      aggregateRevision: next.revision,
      eventType,
      dedupeKey: `${next.id}:${next.revision}:${command.type}`,
      payload: mutationBody(next),
      occurredAt,
    });

    const expiresAt = this.dependencies.clock.receiptExpiresAt(now);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      throw new DisciplineApplicationError("INVALID_COMMAND", "Receipt expiry must follow creation.");
    }
    const body = mutationBody(next);
    await this.dependencies.receipts.complete(transaction, {
      principalId: command.metadata.principalId,
      scope: command.metadata.idempotency.scope,
      keyHash: command.metadata.idempotency.keyHash,
      requestHash: command.metadata.idempotency.requestHash,
      bodyDigestHex: command.metadata.idempotency.bodyDigestHex,
      body,
      createdAt: occurredAt,
      expiresAt: expiresAt.toISOString(),
    });
    return { body, revision: next.revision, replayed: false };
  }

  private requireActor(command: DisciplineCommand, actor: CurrentDisciplineActor | null): asserts actor is CurrentDisciplineActor {
    if (!actor || actor.principalId !== command.metadata.principalId) {
      throw new DisciplineApplicationError("NOT_FOUND", "Discipline task is not available.");
    }
    if (command.type === "SUBMIT_EVIDENCE" && actor.purpose !== "ACCOUNT") {
      throw new DisciplineApplicationError("NOT_FOUND", "Discipline task is not available.");
    }
    if (command.type === "REVIEW_EVIDENCE" && actor.purpose !== "ADMIN") {
      throw new DisciplineApplicationError("NOT_FOUND", "Discipline task is not available.");
    }
    if (
      command.type === "REVIEW_EVIDENCE" &&
      command.metadata.authorizationIntent.kind === "ADMIN_TOTP" &&
      command.metadata.authorizationIntent.minimumRole === "SUPER_ADMIN" &&
      actor.purpose === "ADMIN" &&
      actor.role !== "SUPER_ADMIN"
    ) {
      throw new DisciplineApplicationError("NOT_FOUND", "Discipline task is not available.");
    }
  }
}
