import { canonicalIdentifier, type JsonObject } from "@/modules/competitions/core";

import { canonicalChampionKey, createChampion, deactivateChampion, updateChampion, type Champion } from "../domain/champion";
import { championCommandRequestHash, type ChampionCommand } from "./commands";
import type {
  ChampionAuthorizationPort,
  ChampionAuditPort,
  ChampionClockPort,
  ChampionCommandResult,
  ChampionMutationBody,
  ChampionOutboxPort,
  ChampionReceipt,
  ChampionReceiptPort,
  ChampionRepository,
  ChampionTransaction,
  ChampionUnitOfWork,
} from "./ports";

export class ChampionApplicationError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "ALREADY_EXISTS" | "PRECONDITION_FAILED" | "IDEMPOTENCY_MISMATCH", message: string) {
    super(message);
    this.name = "ChampionApplicationError";
  }
}

export type ChampionCommandHandlerDependencies = Readonly<{
  unitOfWork: ChampionUnitOfWork;
  authorization: ChampionAuthorizationPort;
  repository: ChampionRepository;
  receipts: ChampionReceiptPort;
  audit: ChampionAuditPort;
  outbox: ChampionOutboxPort;
  clock: ChampionClockPort;
}>;

const scopes: Readonly<Record<ChampionCommand["type"], string>> = {
  CREATE_CHAMPION: "admin:champions:create",
  UPDATE_CHAMPION: "admin:champions:update",
  DEACTIVATE_CHAMPION: "admin:champions:deactivate",
};

function sameDigest(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function instant(value: string, label: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ChampionApplicationError("INVALID_INPUT", `${label} must be canonical.`);
  }
}

function digest(value: Uint8Array, label: string) {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new ChampionApplicationError("INVALID_INPUT", `${label} must be a 32-byte digest.`);
  }
}

function validate(command: ChampionCommand) {
  canonicalChampionKey(command.championKey);
  canonicalIdentifier(command.metadata.actorSession.userAccountId, "actorUserAccountId");
  canonicalIdentifier(command.metadata.actorSession.sessionId, "sessionId");
  canonicalIdentifier(command.metadata.requestId, "requestId");
  if (command.metadata.idempotency.scope !== scopes[command.type]) {
    throw new ChampionApplicationError("INVALID_INPUT", "Command scope does not match its action.");
  }
  if (!Number.isSafeInteger(command.metadata.expectedRevision) || command.metadata.expectedRevision < 0) {
    throw new ChampionApplicationError("INVALID_INPUT", "Expected revision is invalid.");
  }
  instant(command.metadata.issuedAt, "issuedAt");
  digest(command.metadata.idempotency.keyHash, "keyHash");
  digest(command.metadata.idempotency.requestHash, "requestHash");
  if (!/^[a-f0-9]{64}$/u.test(command.metadata.idempotency.bodyDigestHex)) {
    throw new ChampionApplicationError("INVALID_INPUT", "bodyDigestHex must be lowercase SHA-256.");
  }
  const intent = command.metadata.authorizationIntent;
  if (intent.kind !== "ADMIN_TOTP" || intent.minimumRole !== "ADMIN" || intent.requireTotp !== true || intent.transactionRecheck !== true) {
    throw new ChampionApplicationError("FORBIDDEN", "Champion mutation requires an ADMIN-purpose TOTP session.");
  }
  if (command.metadata.actorSession.sessionId !== command.metadata.authorizationIntent.sessionId) {
    throw new ChampionApplicationError("FORBIDDEN", "Champion mutation session binding is invalid.");
  }
  if (!sameDigest(command.metadata.idempotency.requestHash, championCommandRequestHash(command))) {
    throw new ChampionApplicationError("IDEMPOTENCY_MISMATCH", "Request hash does not match the immutable command body.");
  }
}

function json(champion: Champion): ChampionMutationBody {
  return { key: champion.key, displayName: champion.displayName, status: champion.status, revision: champion.revision };
}

function snapshot(champion: Champion | null): JsonObject | null {
  return champion ? json(champion) : null;
}

function validateReplay(command: ChampionCommand, receipt: ChampionReceipt) {
  instant(receipt.createdAt, "receipt.createdAt");
  instant(receipt.expiresAt, "receipt.expiresAt");
  digest(receipt.keyHash, "receipt.keyHash");
  digest(receipt.requestHash, "receipt.requestHash");
  if (
    receipt.actorPrincipalId !== command.metadata.actorSession.sessionId ||
    receipt.scope !== command.metadata.idempotency.scope ||
    receipt.bodyDigestHex !== command.metadata.idempotency.bodyDigestHex ||
    !sameDigest(receipt.keyHash, command.metadata.idempotency.keyHash) ||
    !sameDigest(receipt.requestHash, command.metadata.idempotency.requestHash) ||
    receipt.body.key !== canonicalChampionKey(command.championKey) ||
    Date.parse(receipt.expiresAt) <= Date.parse(receipt.createdAt)
  ) throw new ChampionApplicationError("IDEMPOTENCY_MISMATCH", "Durable receipt does not match the command.");
}

export class ChampionCommandHandler {
  constructor(private readonly dependencies: ChampionCommandHandlerDependencies) {}

  handle(command: ChampionCommand): Promise<ChampionCommandResult> {
    validate(command);
    return this.dependencies.unitOfWork.transaction((transaction) => this.handleTransaction(transaction, command));
  }

  private async handleTransaction(transaction: ChampionTransaction, command: ChampionCommand): Promise<ChampionCommandResult> {
    const actor = await this.dependencies.authorization.recheck(transaction, command);
    if (
      !actor ||
      actor.principalId !== command.metadata.actorSession.sessionId ||
      actor.userAccountId !== command.metadata.actorSession.userAccountId
    ) {
      throw new ChampionApplicationError("FORBIDDEN", "Champion mutation is unavailable.");
    }
    const claim = await this.dependencies.receipts.claim(transaction, command);
    if (claim.kind === "MISMATCH") throw new ChampionApplicationError("IDEMPOTENCY_MISMATCH", "Request key was reused.");
    if (claim.kind === "REPLAY") {
      validateReplay(command, claim.receipt);
      return { body: claim.receipt.body, revision: claim.receipt.body.revision, status: claim.receipt.responseStatus, replayed: true };
    }

    const key = canonicalChampionKey(command.championKey);
    const current = await this.dependencies.repository.loadForUpdate(transaction, key);
    const now = this.dependencies.clock.now();
    if (!Number.isFinite(now.getTime())) throw new ChampionApplicationError("INVALID_INPUT", "Clock returned an invalid time.");
    let next: Champion;
    let status: 200 | 201;
    try {
      if (command.type === "CREATE_CHAMPION") {
        if (current) throw new ChampionApplicationError("ALREADY_EXISTS", "Champion already exists.");
        if (command.metadata.expectedRevision !== 0) throw new ChampionApplicationError("PRECONDITION_FAILED", "Create revision must be zero.");
        next = createChampion({ key, displayName: command.payload.displayName, now });
        await this.dependencies.repository.insert(transaction, next);
        status = 201;
      } else {
        if (!current) throw new ChampionApplicationError("NOT_FOUND", "Champion was not found.");
        next = command.type === "UPDATE_CHAMPION"
          ? updateChampion({ current, expectedRevision: command.metadata.expectedRevision, ...command.payload, now })
          : deactivateChampion({ current, expectedRevision: command.metadata.expectedRevision, now });
        await this.dependencies.repository.save(transaction, next, command.metadata.expectedRevision);
        status = 200;
      }
    } catch (error) {
      if (error instanceof ChampionApplicationError) throw error;
      if (error instanceof Error && error.message === "STALE_CHAMPION_REVISION") {
        throw new ChampionApplicationError("PRECONDITION_FAILED", "Champion revision changed.");
      }
      throw error;
    }

    const occurredAt = now.toISOString();
    const body = json(next);
    await this.dependencies.audit.append(transaction, {
      requestId: command.metadata.requestId,
      actorUserAccountId: actor.userAccountId,
      action: command.type,
      championKey: key,
      before: snapshot(current),
      after: body,
      occurredAt,
    });
    await this.dependencies.outbox.append(transaction, {
      id: `${command.metadata.requestId}:OUTBOX`,
      requestId: command.metadata.requestId,
      championKey: key,
      revision: next.revision,
      eventType: command.type,
      dedupeKey: `${key}:${next.revision}:${command.type}`,
      payload: body,
      occurredAt,
    });
    const expiresAt = this.dependencies.clock.receiptExpiresAt(now);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      throw new ChampionApplicationError("INVALID_INPUT", "Receipt expiry is invalid.");
    }
    await this.dependencies.receipts.complete(transaction, {
      actorPrincipalId: command.metadata.actorSession.sessionId,
      scope: command.metadata.idempotency.scope,
      keyHash: command.metadata.idempotency.keyHash,
      requestHash: command.metadata.idempotency.requestHash,
      bodyDigestHex: command.metadata.idempotency.bodyDigestHex,
      body,
      responseStatus: status,
      createdAt: occurredAt,
      expiresAt: expiresAt.toISOString(),
    });
    return { body, revision: next.revision, status, replayed: false };
  }
}
