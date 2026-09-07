import assert from "node:assert/strict";
import test from "node:test";

import {
  DisciplineApplicationError,
  DisciplineCommandHandler,
  disciplineCommandRequestHash,
  hashDisciplineRequestKey,
  type DisciplineAuditEvent,
  type DisciplineCommand,
  type DisciplineCommandHandlerDependencies,
  type DisciplineCommandReceipt,
  type DisciplineOutboxEvent,
  type DisciplineTask,
  type DisciplineTransaction,
} from "../src/modules/discipline";

const now = new Date("2026-09-07T00:00:00.000Z");
const bodyDigestHex = "ab".repeat(32);

function baseTask(): DisciplineTask {
  return {
    id: "task-1",
    revision: 0,
    ownerAccountId: "account-1",
    ownerPlayerId: "player-1",
    requiredGameCount: 1,
    dueAt: new Date("2026-09-30T00:00:00.000Z"),
    status: "REQUIRED",
    reviewNote: null,
    reviewBoundaryAt: null,
    evidence: [],
  };
}

function seal<T extends DisciplineCommand>(command: T): T {
  return {
    ...command,
    metadata: {
      ...command.metadata,
      idempotency: {
        ...command.metadata.idempotency,
        requestHash: disciplineCommandRequestHash(command),
      },
    },
  };
}

function submitCommand(): Extract<DisciplineCommand, { type: "SUBMIT_EVIDENCE" }> {
  return seal({
    type: "SUBMIT_EVIDENCE",
    taskId: "task-1",
    metadata: {
      principalId: "account-session-1",
      requestId: "request-submit-1",
      expectedRevision: 0,
      issuedAt: now.toISOString(),
      authorizationIntent: {
        kind: "ACCOUNT_SESSION",
        sessionId: "session-1",
        role: "USER",
        authVersion: 0,
        transactionRecheck: true,
      },
      idempotency: {
        scope: "account:discipline:evidence:submit",
        keyHash: hashDisciplineRequestKey("submit-key-123456"),
        requestHash: new Uint8Array(32),
        bodyDigestHex,
      },
    },
    payload: { privateAssetId: "asset-1" },
  });
}

function reviewCommand(): Extract<DisciplineCommand, { type: "REVIEW_EVIDENCE" }> {
  return seal({
    type: "REVIEW_EVIDENCE",
    taskId: "task-1",
    metadata: {
      principalId: "admin-session-1",
      requestId: "request-review-1",
      expectedRevision: 1,
      issuedAt: now.toISOString(),
      authorizationIntent: {
        kind: "ADMIN_TOTP",
        sessionId: "admin-session-1",
        minimumRole: "ADMIN",
        authVersion: 0,
        requireTotp: true,
        transactionRecheck: true,
      },
      idempotency: {
        scope: "admin:discipline:evidence:review",
        keyHash: hashDisciplineRequestKey("review-key-123456"),
        requestHash: new Uint8Array(32),
        bodyDigestHex,
      },
    },
    payload: { decision: "APPROVE", reviewNote: "" },
  });
}

type State = {
  task: DisciplineTask | null;
  receipt: DisciplineCommandReceipt | null;
  audits: DisciplineAuditEvent[];
  outbox: DisciplineOutboxEvent[];
};

class Harness {
  state: State = { task: baseTask(), receipt: null, audits: [], outbox: [] };
  operations: string[] = [];
  actor: "ACCOUNT" | "ADMIN" | "NONE" = "ACCOUNT";
  assetReady = true;
  failOutbox = false;
  transaction = {} as DisciplineTransaction;

  dependencies(): DisciplineCommandHandlerDependencies {
    return {
      unitOfWork: {
        transaction: async <T>(operation: (transaction: DisciplineTransaction) => Promise<T>) => {
          const before = structuredClone(this.state);
          try {
            return await operation(this.transaction);
          } catch (error) {
            this.state = before;
            throw error;
          }
        },
      },
      authorization: {
        recheck: async (_transaction, input) => {
          this.operations.push("authorization");
          if (this.actor === "NONE") return null;
          if (this.actor === "ACCOUNT") {
            return { purpose: "ACCOUNT", principalId: input.principalId, userAccountId: "account-1", playerId: "player-1" };
          }
          return { purpose: "ADMIN", principalId: input.principalId, userAccountId: "admin-1", role: "ADMIN" };
        },
      },
      receipts: {
        claim: async () => {
          this.operations.push("receipt:claim");
          return this.state.receipt ? { kind: "REPLAY", receipt: this.state.receipt } : { kind: "CLAIMED" };
        },
        complete: async (_transaction, receipt) => {
          this.operations.push("receipt:complete");
          this.state.receipt = receipt;
        },
      },
      repository: {
        loadTaskForUpdate: async () => {
          this.operations.push("task:lock");
          return this.state.task;
        },
        loadReadyEvidenceAssetForUpdate: async () => {
          this.operations.push("asset:lock");
          return this.assetReady
            ? { id: "asset-1", sha256Hex: "cd".repeat(32), readyAt: now }
            : null;
        },
        saveTask: async (_transaction, input) => {
          this.operations.push("task:save");
          this.state.task = input.task;
        },
      },
      audit: {
        append: async (_transaction, event) => {
          this.operations.push("audit");
          this.state.audits.push(event);
        },
      },
      outbox: {
        append: async (_transaction, event) => {
          this.operations.push("outbox");
          if (this.failOutbox) throw new Error("OUTBOX_FAILED");
          this.state.outbox.push(event);
        },
      },
      clock: {
        now: () => now,
        receiptExpiresAt: (value) => new Date(value.getTime() + 24 * 60 * 60 * 1_000),
      },
    };
  }
}

test("owner submission rechecks authorization and binds a READY private asset atomically", async () => {
  const harness = new Harness();
  const result = await new DisciplineCommandHandler(harness.dependencies()).handle(submitCommand());
  assert.deepEqual(harness.operations, [
    "authorization",
    "receipt:claim",
    "task:lock",
    "asset:lock",
    "task:save",
    "audit",
    "outbox",
    "receipt:complete",
  ]);
  assert.equal(result.body.status, "PENDING_REVIEW");
  assert.equal(result.body.submittedEvidenceCount, 1);
  assert.equal(result.replayed, false);
  assert.equal(JSON.stringify(result.body).includes("sha256"), false);
  assert.equal(harness.state.audits.length, 1);
  assert.equal(harness.state.outbox.length, 1);
});

test("exact replay returns the durable body without touching the task or asset", async () => {
  const harness = new Harness();
  const handler = new DisciplineCommandHandler(harness.dependencies());
  const command = submitCommand();
  const first = await handler.handle(command);
  harness.operations = [];
  const replay = await handler.handle(command);
  assert.deepEqual(replay, { ...first, replayed: true });
  assert.deepEqual(harness.operations, ["authorization", "receipt:claim"]);
});

test("missing private asset and failed authorization use existence-masked errors", async () => {
  const missing = new Harness();
  missing.assetReady = false;
  await assert.rejects(
    () => new DisciplineCommandHandler(missing.dependencies()).handle(submitCommand()),
    (error: unknown) => error instanceof DisciplineApplicationError && error.code === "NOT_FOUND",
  );
  assert.equal(missing.state.task?.revision, 0);

  const unauthorized = new Harness();
  unauthorized.actor = "NONE";
  await assert.rejects(
    () => new DisciplineCommandHandler(unauthorized.dependencies()).handle(submitCommand()),
    (error: unknown) => error instanceof DisciplineApplicationError && error.code === "NOT_FOUND",
  );
  assert.deepEqual(unauthorized.operations, ["authorization"]);
});

test("outbox failure rolls task, audit, outbox and receipt back together", async () => {
  const harness = new Harness();
  harness.failOutbox = true;
  await assert.rejects(
    () => new DisciplineCommandHandler(harness.dependencies()).handle(submitCommand()),
    /OUTBOX_FAILED/,
  );
  assert.equal(harness.state.task?.revision, 0);
  assert.equal(harness.state.audits.length, 0);
  assert.equal(harness.state.outbox.length, 0);
  assert.equal(harness.state.receipt, null);
});

test("review requires an ADMIN-purpose TOTP recheck and approves the exact evidence batch", async () => {
  const harness = new Harness();
  harness.actor = "ADMIN";
  harness.state.task = {
    ...baseTask(),
    revision: 1,
    status: "PENDING_REVIEW",
    evidence: [{ id: "asset-1", sha256Hex: "cd".repeat(32), submittedAt: now, supersededAt: null }],
  };
  const result = await new DisciplineCommandHandler(harness.dependencies()).handle(reviewCommand());
  assert.equal(result.body.status, "APPROVED");
  assert.equal(result.revision, 2);
  assert.equal(harness.operations.includes("asset:lock"), false);

  const wrongActor = new Harness();
  wrongActor.actor = "ACCOUNT";
  await assert.rejects(
    () => new DisciplineCommandHandler(wrongActor.dependencies()).handle(reviewCommand()),
    (error: unknown) => error instanceof DisciplineApplicationError && error.code === "NOT_FOUND",
  );
});

test("tampered immutable request body fails before the transaction", () => {
  const harness = new Harness();
  const command = submitCommand();
  const tampered = { ...command, payload: { privateAssetId: "asset-2" } };
  assert.throws(
    () => new DisciplineCommandHandler(harness.dependencies()).handle(tampered),
    (error: unknown) => error instanceof DisciplineApplicationError && error.code === "IDEMPOTENCY_MISMATCH",
  );
  assert.deepEqual(harness.operations, []);
});
