import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSingleEliminationBracket,
  buildSingleEliminationBracket,
  CompetitionCoreError,
  type CompetitionCommandEnvelope,
} from "../src/modules/competitions/core";
import {
  applyDestructionTerminalCommand,
  executeDestructionTerminalCommand,
  toDestructionPublicDto,
  validateDestructionConfiguration,
  type DestructionAggregate,
  type DestructionCommandRepository,
  type DestructionCommit,
  type DestructionMutationBody,
  type DestructionTerminalCommandPayload,
} from "../src/modules/competitions/destruction";

const instant = "2026-09-07T00:00:00.000Z";
const digest = (byte: number) => new Uint8Array(32).fill(byte);

function failsWith(code: CompetitionCoreError["code"]) {
  return (error: unknown) => error instanceof CompetitionCoreError && error.code === code;
}

function completedBracket() {
  let bracket = buildSingleEliminationBracket({
    competitionId: "destruction-1",
    teams: ["a", "b", "c", "d"].map((id, index) => ({ id: `team-${id}`, seed: index + 1 })),
    bestOf: 3,
  });
  for (const fixture of bracket.fixtures.filter((entry) => entry.stage === "SEMI_FINAL")) {
    bracket = advanceSingleEliminationBracket(bracket, {
      fixtureId: fixture.id,
      teamAScore: 2,
      teamBScore: 0,
      winnerTeamId: fixture.teamAId!,
    }).bracket;
  }
  const final = bracket.fixtures.find((fixture) => fixture.stage === "FINAL")!;
  return advanceSingleEliminationBracket(bracket, {
    fixtureId: final.id,
    teamAScore: 2,
    teamBScore: 1,
    winnerTeamId: final.teamAId!,
  }).bracket;
}

function aggregate(): DestructionAggregate {
  return {
    id: "destruction-1",
    revision: 7,
    title: "K-LOL 멸망전",
    lifecycle: { status: "TOURNAMENT", cancelledFrom: null, cancellationReason: null },
    configuration: validateDestructionConfiguration({
      preliminaryFormat: "FULL_ROUND_ROBIN_BO3",
      teamCount: 4,
      laneLimits: { TOP: 4, JGL: 4, MID: 4, ADC: 4, SUP: 4 },
    }),
    applications: [],
    teams: [],
    participants: [],
    auctionSeed: null,
    preliminaryFixtures: [],
    qualifiedTeamIds: ["team-a", "team-b", "team-c", "team-d"],
    tournamentBracket: completedBracket(),
    rosterSnapshots: [],
    replacements: [],
    mvpBallots: [],
    createdAt: instant,
    updatedAt: instant,
  };
}

function envelope(payload: DestructionTerminalCommandPayload, overrides: Partial<CompetitionCommandEnvelope<DestructionTerminalCommandPayload>> = {}): CompetitionCommandEnvelope<DestructionTerminalCommandPayload> {
  const scope = payload.commandType === "COMPLETE"
    ? "admin:destruction:complete"
    : payload.commandType === "CANCEL"
      ? "admin:destruction:cancel"
      : "admin:destruction:restore";
  return {
    actor: { userAccountId: "admin-1", sessionId: "session-1", purpose: "ADMIN", requiredRole: "ADMIN" },
    authorization: "ADMIN_MUTATION",
    requestId: "request-1",
    aggregateId: "destruction-1",
    expectedRevision: 7,
    scope,
    keyHash: digest(1),
    requestHash: digest(2),
    issuedAt: instant,
    payload,
    ...overrides,
  };
}

class MemoryRepository implements DestructionCommandRepository {
  current: DestructionAggregate | null = aggregate();
  receipt: DestructionCommit["receipt"] | null = null;
  commits: DestructionCommit[] = [];

  async findReceipt() {
    return this.receipt;
  }

  async loadForUpdate(aggregateId: string) {
    return this.current?.id === aggregateId ? this.current : null;
  }

  async commit(command: DestructionCommit) {
    assert.equal(this.current?.revision, command.expectedRevision);
    this.current = command.aggregate;
    this.receipt = command.receipt;
    this.commits.push(command);
  }
}

test("complete uses ADMIN intent, expectedRevision, one atomic audit/outbox/receipt commit, and replay", async () => {
  const repository = new MemoryRepository();
  const command = envelope({ commandType: "COMPLETE", finalResultConfirmed: true });
  const first = await executeDestructionTerminalCommand(repository, command);
  assert.equal(first.replayed, false);
  assert.equal(first.revision, 8);
  assert.equal(first.body.destruction.status, "COMPLETED");
  assert.equal(repository.commits.length, 1);
  assert.equal(repository.commits[0]?.audit.action, "DESTRUCTION_COMPLETE");
  assert.equal(repository.commits[0]?.outbox.dedupeKey, "destruction-1:8");
  assert.equal(repository.commits[0]?.receipt.revision, 8);

  const replay = await executeDestructionTerminalCommand(repository, command);
  assert.equal(replay.replayed, true);
  assert.equal(repository.commits.length, 1);
  assert.deepEqual(replay.body, first.body);
});

test("idempotency conflicts, stale revisions, account sessions, and scope drift fail closed", async () => {
  const repository = new MemoryRepository();
  const command = envelope({ commandType: "COMPLETE", finalResultConfirmed: true });
  await executeDestructionTerminalCommand(repository, command);
  await assert.rejects(
    () => executeDestructionTerminalCommand(repository, { ...command, requestHash: digest(9) }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );

  const staleRepository = new MemoryRepository();
  await assert.rejects(
    () => executeDestructionTerminalCommand(staleRepository, { ...command, expectedRevision: 6 }),
    failsWith("PRECONDITION_FAILED"),
  );
  await assert.rejects(
    () => executeDestructionTerminalCommand(staleRepository, {
      ...command,
      actor: { userAccountId: "user-1", sessionId: "session-2", purpose: "ACCOUNT", requiredRole: "USER" },
      authorization: "APPROVED_ACCOUNT_MUTATION",
    }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );
  await assert.rejects(
    () => executeDestructionTerminalCommand(staleRepository, { ...command, scope: "admin:destruction:cancel" }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );
});

test("cancel and restore retain only the recorded lifecycle recovery state", () => {
  const current = aggregate();
  const cancelled = applyDestructionTerminalCommand(current, { type: "CANCEL", reason: " 운영 일정 변경 " });
  assert.deepEqual(cancelled.lifecycle, { status: "CANCELLED", cancelledFrom: "TOURNAMENT", cancellationReason: "운영 일정 변경" });
  const restored = applyDestructionTerminalCommand(cancelled, { type: "RESTORE_CANCELLED" });
  assert.deepEqual(restored.lifecycle, current.lifecycle);
  assert.throws(() => applyDestructionTerminalCommand(current, { type: "RESTORE_CANCELLED" }), failsWith("INVALID_TRANSITION"));
});

test("public DTO is an explicit allowlist without balances, cancellation reason, votes, audit, or session material", () => {
  const dto = toDestructionPublicDto(aggregate());
  assert.deepEqual(Object.keys(dto).sort(), [
    "advanceTeamCount",
    "championTeamId",
    "id",
    "mvpResults",
    "preliminaryBestOf",
    "preliminaryFixtures",
    "preliminaryFormat",
    "preliminaryRoundCount",
    "qualifiedTeamIds",
    "revision",
    "status",
    "teams",
    "title",
    "tournamentFixtures",
  ]);
  assert.equal("cancellationReason" in dto, false);
  assert.equal("mvpBallots" in dto, false);
  assert.equal("remainingAuctionPoints" in dto, false);
});

test("application port types retain JSON-safe public response material", () => {
  const body: DestructionMutationBody = { destruction: toDestructionPublicDto(aggregate()) as DestructionMutationBody["destruction"] };
  assert.equal(body.destruction.id, "destruction-1");
});
