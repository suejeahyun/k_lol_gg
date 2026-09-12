import assert from "node:assert/strict";
import test from "node:test";

import type { TeamBalanceCalculation } from "../src/modules/team-tools";
import { buildSingleEliminationBracket } from "../src/modules/competitions/core";
import {
  addAdminEventParticipants,
  applyEventTeamBalance,
  cancelEvent,
  cancelOwnEventApplication,
  closeEventRecruitment,
  completeEvent,
  correctEventFixtureResult,
  createEventAggregate,
  eventCommandRequestFingerprint,
  EventCommandHandler,
  EventDomainError,
  eventTeamBalanceParticipants,
  generateEventBracket,
  recordEventFixtureResult,
  restoreCancelledEvent,
  setEventMediaGallery,
  startEventRecruitment,
  toOwnEventApplicationDto,
  toPublicEventDto,
  upsertOwnEventApplication,
  type EventAdminCommand,
  type EventAggregate,
  type EventCommandHandlerDependencies,
  type EventParticipantInput,
  type EventTransactionContext,
} from "../src/modules/competitions/events";

const opensAt = "2026-09-07T00:00:00.000Z";
const duringRecruitment = "2026-09-07T01:00:00.000Z";
const closesAt = "2026-09-08T00:00:00.000Z";
const digest = (byte: number) => new Uint8Array(32).fill(byte);

test("event result gallery can be linked only during or after play", () => {
  const galleryId = "00000000-0000-4000-8000-000000000099";
  assert.throws(() => setEventMediaGallery(planned(), galleryId, opensAt), /result gallery/i);
  const inProgress = { ...planned(), lifecycle: { status: "IN_PROGRESS" as const, cancelledFrom: null, cancellationReason: null } };
  assert.equal(setEventMediaGallery(inProgress, galleryId, opensAt).galleryId, galleryId);
  assert.equal(setEventMediaGallery({ ...inProgress, lifecycle: { ...inProgress.lifecycle, status: "COMPLETED" as const } }, null, opensAt).galleryId, null);
});

function settings(format: "POSITION" | "ARAM" = "POSITION") {
  return {
    title: "  하늘빛 이벤트전  ",
    description: "즐거운  내전",
    format,
    recruitmentOpensAt: opensAt,
    recruitmentClosesAt: closesAt,
    bracketBestOf: 3,
  } as const;
}

function planned(format: "POSITION" | "ARAM" = "POSITION") {
  return createEventAggregate({ id: `event-${format.toLowerCase()}`, settings: settings(format), now: opensAt });
}

function positionInput(index: number, overrides: Partial<EventParticipantInput> = {}): EventParticipantInput {
  const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
  return {
    id: `participant-${index}`,
    playerId: `player-${index}`,
    mainPosition: positions[index % positions.length]!,
    subPositions: [positions[(index + 1) % positions.length]!],
    ...overrides,
  };
}

function expectEventError(code: EventDomainError["code"]) {
  return (error: unknown) => error instanceof EventDomainError && error.code === code;
}

function balanceCalculation(playerIds: readonly string[]): TeamBalanceCalculation {
  const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
  return {
    candidates: [{
      rank: 1,
      signature: "stable-layout",
      assignments: playerIds.map((playerId, index) => ({
        playerId,
        team: index < 5 ? "BLUE" as const : "RED" as const,
        position: positions[index % 5]!,
        preference: "MAIN" as const,
        rating: {
          source: "DEFAULT" as const,
          rawScore: 50,
          effectiveScore: 50,
          confidence: 0,
          sampleSize: null,
        },
      })),
      score: {
        teamStrength: { blueTotal: 251, redTotal: 249, difference: 2, weightedPenalty: 200 },
        positions: [],
        positionDifferenceTotal: 0,
        positionWeightedPenalty: 0,
        preference: { mainCount: 10, subCount: 0, autoCount: 0, rawPenalty: 0, weightedPenalty: 0 },
        uncertainty: { averageConfidence: 0, noSampleCount: 10, rawPenalty: 10, weightedPenalty: 10 },
        totalPenalty: 210,
      },
    }],
    search: { symmetryAnchorPlayerId: playerIds[0]!, teamCombinationCount: 126, feasibleLayoutCount: 1 },
  };
}

function teamReadyEvent() {
  let aggregate = startEventRecruitment(planned(), opensAt);
  aggregate = addAdminEventParticipants(
    aggregate,
    Array.from({ length: 10 }, (_, index) => positionInput(index + 1)),
    "ADMIN_IMPORT",
    duringRecruitment,
  );
  aggregate = closeEventRecruitment(aggregate, duringRecruitment);
  const players = eventTeamBalanceParticipants(aggregate).map((participant) => participant.playerId);
  return applyEventTeamBalance(aggregate, balanceCalculation(players), duringRecruitment);
}

test("POSITION applications upsert, retain identity, cancel, and reactivate only inside recruitment", () => {
  let aggregate = startEventRecruitment(planned(), opensAt);
  aggregate = upsertOwnEventApplication(aggregate, {
    ...positionInput(1),
    ownerUserAccountId: "user-1",
  }, duringRecruitment);
  aggregate = upsertOwnEventApplication(aggregate, {
    ...positionInput(1, { mainPosition: "MID", subPositions: ["ADC"] }),
    ownerUserAccountId: "user-1",
  }, duringRecruitment);
  assert.deepEqual(toOwnEventApplicationDto(aggregate, "user-1"), {
    eventId: "event-position",
    participantId: "participant-1",
    playerId: "player-1",
    mainPosition: "MID",
    subPositions: ["ADC"],
    status: "ACTIVE",
    eventRevision: 0,
  });
  aggregate = cancelOwnEventApplication(aggregate, "user-1", duringRecruitment);
  assert.equal(toOwnEventApplicationDto(aggregate, "user-1")?.status, "CANCELLED");
  aggregate = upsertOwnEventApplication(aggregate, {
    ...positionInput(1),
    ownerUserAccountId: "user-1",
  }, duringRecruitment);
  assert.equal(toOwnEventApplicationDto(aggregate, "user-1")?.status, "ACTIVE");
  assert.throws(
    () => upsertOwnEventApplication(aggregate, { ...positionInput(1, { id: "new-id" }), ownerUserAccountId: "user-1" }, duringRecruitment),
    expectEventError("INVALID_INPUT"),
  );
  assert.throws(
    () => cancelOwnEventApplication(aggregate, "user-1", closesAt),
    expectEventError("APPLICATION_CLOSED"),
  );
});

test("ARAM applications reject position claims and accept positionless entries", () => {
  let aggregate = startEventRecruitment(planned("ARAM"), opensAt);
  assert.throws(
    () => upsertOwnEventApplication(aggregate, { ...positionInput(1), ownerUserAccountId: "user-1" }, duringRecruitment),
    expectEventError("INVALID_INPUT"),
  );
  aggregate = upsertOwnEventApplication(aggregate, {
    ...positionInput(1, { mainPosition: null, subPositions: [] }),
    ownerUserAccountId: "user-1",
  }, duringRecruitment);
  assert.equal(aggregate.participants[0]?.mainPosition, null);
});

test("admin import is atomic at the aggregate boundary and recruitment closes with exactly ten active entries", () => {
  let aggregate = startEventRecruitment(planned(), opensAt);
  assert.throws(
    () => addAdminEventParticipants(
      aggregate,
      [positionInput(1), positionInput(2, { playerId: "player-1" })],
      "ADMIN_IMPORT",
      duringRecruitment,
    ),
    expectEventError("DUPLICATE_PARTICIPANT"),
  );
  assert.equal(aggregate.participants.length, 0);
  aggregate = addAdminEventParticipants(
    aggregate,
    Array.from({ length: 10 }, (_, index) => positionInput(index + 1)),
    "ADMIN_IMPORT",
    duringRecruitment,
  );
  assert.equal(closeEventRecruitment(aggregate, duringRecruitment).lifecycle.status, "TEAM_BUILDING");
});

test("event consumes the S06 balance port shape and validates two complete five-person rosters", () => {
  let aggregate = startEventRecruitment(planned(), opensAt);
  aggregate = addAdminEventParticipants(
    aggregate,
    Array.from({ length: 10 }, (_, index) => positionInput(index + 1)),
    "ADMIN_MANUAL",
    duringRecruitment,
  );
  aggregate = closeEventRecruitment(aggregate, duringRecruitment);
  const balanceInput = eventTeamBalanceParticipants(aggregate);
  assert.equal(balanceInput.length, 10);
  assert.deepEqual(balanceInput[0]?.eligiblePositions.map((entry) => entry.preference), ["AUTO", "MAIN", "SUB", "AUTO", "AUTO"]);
  const balanced = applyEventTeamBalance(aggregate, balanceCalculation(balanceInput.map((entry) => entry.playerId)), duringRecruitment);
  assert.deepEqual(balanced.teams.map((team) => [team.id, team.members.length, team.balanceScore]), [
    ["event-position:TEAM:BLUE", 5, 251],
    ["event-position:TEAM:RED", 5, 249],
  ]);
  const forged = balanceCalculation(balanceInput.map((entry) => entry.playerId));
  const assignments = forged.candidates[0]!.assignments.map((entry, index) => index === 9 ? { ...entry, playerId: "player-1" } : entry);
  assert.throws(
    () => applyEventTeamBalance(aggregate, { ...forged, candidates: [{ ...forged.candidates[0]!, assignments }] }, duringRecruitment),
    expectEventError("PRECONDITION_FAILED"),
  );
});

test("seeded bracket derives the champion, supports correction, and completes with an event participant MVP", () => {
  let aggregate = generateEventBracket(teamReadyEvent(), duringRecruitment);
  const final = aggregate.bracket!.fixtures[0]!;
  assert.deepEqual([final.teamAId, final.teamBId], ["event-position:TEAM:BLUE", "event-position:TEAM:RED"]);
  aggregate = recordEventFixtureResult(aggregate, {
    fixtureId: final.id,
    teamAScore: 2,
    teamBScore: 0,
    winnerTeamId: final.teamAId!,
  }, duringRecruitment);
  const corrected = correctEventFixtureResult(aggregate, {
    fixtureId: final.id,
    teamAScore: 1,
    teamBScore: 2,
    winnerTeamId: final.teamBId!,
  }, duringRecruitment);
  assert.deepEqual(corrected.plan.invalidatedResultFixtureIds, []);
  assert.equal(corrected.aggregate.bracket?.championTeamId, final.teamBId);
  const completed = completeEvent(corrected.aggregate, corrected.aggregate.participants[0]!.id, duringRecruitment);
  assert.equal(completed.lifecycle.status, "COMPLETED");
  assert.equal(completed.winnerTeamId, final.teamBId);
});

test("correcting an upstream result preserves the other branch and explicitly invalidates downstream results", () => {
  const base = teamReadyEvent();
  const teams = [1, 2, 3, 4].map((seed) => ({
    id: `event-position:TEAM:${seed}`,
    name: `T${seed}`,
    seed: null,
    balanceScore: 500 - seed,
    members: [],
  }));
  const seededTeams = teams.map((team, index) => ({ ...team, seed: index + 1 }));
  let aggregate: EventAggregate = {
    ...base,
    teams: seededTeams,
    bracket: buildSingleEliminationBracket({
      competitionId: base.id,
      teams: seededTeams.map((team) => ({ id: team.id, seed: team.seed })),
      bestOf: base.settings.bracketBestOf,
    }),
    lifecycle: { status: "IN_PROGRESS", cancelledFrom: null, cancellationReason: null },
  };
  const [semiOne, semiTwo, final] = aggregate.bracket!.fixtures;
  aggregate = recordEventFixtureResult(aggregate, { fixtureId: semiOne!.id, teamAScore: 2, teamBScore: 0, winnerTeamId: semiOne!.teamAId! }, duringRecruitment);
  aggregate = recordEventFixtureResult(aggregate, { fixtureId: semiTwo!.id, teamAScore: 2, teamBScore: 1, winnerTeamId: semiTwo!.teamAId! }, duringRecruitment);
  aggregate = recordEventFixtureResult(aggregate, { fixtureId: final!.id, teamAScore: 2, teamBScore: 0, winnerTeamId: semiOne!.teamAId! }, duringRecruitment);
  const corrected = correctEventFixtureResult(aggregate, { fixtureId: semiOne!.id, teamAScore: 0, teamBScore: 2, winnerTeamId: semiOne!.teamBId! }, duringRecruitment);
  assert.deepEqual(corrected.plan.downstreamFixtureIds, [final!.id]);
  assert.deepEqual(corrected.plan.invalidatedResultFixtureIds, [final!.id]);
  assert.equal(corrected.aggregate.bracket?.fixtures[1]?.result?.winnerTeamId, semiTwo!.teamAId);
  assert.equal(corrected.aggregate.bracket?.fixtures[2]?.result, null);
  assert.equal(corrected.aggregate.bracket?.championTeamId, null);
});

test("cancellation recovery restores only the recorded phase and public DTOs omit private ownership data", () => {
  const bracket = generateEventBracket(teamReadyEvent(), duringRecruitment);
  const restored = restoreCancelledEvent(cancelEvent(bracket, "운영 일정 변경", duringRecruitment), duringRecruitment);
  assert.equal(restored.lifecycle.status, "IN_PROGRESS");
  assert.deepEqual(restored.bracket, bracket.bracket);
  const playerNames = new Map(restored.participants.map((participant, index) => [participant.playerId, `선수 ${index + 1}`]));
  const publicDto = toPublicEventDto(restored, duringRecruitment, playerNames);
  const serialized = JSON.stringify(publicDto);
  for (const forbidden of ["ownerUserAccountId", "cancellationReason", "balanceScore", "requestFingerprint", "keyHash"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(publicDto.teams.flatMap((team) => team.members).every((member) => member.playerName.startsWith("선수 ")), true);
  assert.equal(publicDto.fixtures.every((fixture) => fixture.teamAName !== fixture.teamAId && fixture.teamBName !== fixture.teamBId), true);
});

function adminMetadata(expectedRevision: number) {
  return {
    actor: { userAccountId: "admin-1", sessionId: "session-1", purpose: "ADMIN", requiredRole: "ADMIN" },
    authorizationIntent: { kind: "ADMIN_TOTP", minimumRole: "ADMIN", requireTotp: true, transactionRecheck: true },
    requestId: "request-1",
    expectedRevision,
    idempotency: { scope: "admin:event:create", keyHash: digest(1), requestFingerprint: digest(2) },
    issuedAt: opensAt,
  } as const;
}

function createAdminCommand(): Extract<EventAdminCommand, { type: "CREATE_EVENT" }> {
  const command: Extract<EventAdminCommand, { type: "CREATE_EVENT" }> = {
    type: "CREATE_EVENT",
    eventId: "event-handler",
    metadata: adminMetadata(0),
    payload: { settings: settings() },
  };
  return {
    ...command,
    metadata: {
      ...command.metadata,
      idempotency: {
        ...command.metadata.idempotency,
        requestFingerprint: eventCommandRequestFingerprint(command),
      },
    },
  };
}

function handlerDependencies(
  overrides: Partial<EventCommandHandlerDependencies> = {},
) {
  const operations: string[] = [];
  let saved: EventAggregate | null = null;
  const transaction = {} as EventTransactionContext;
  const dependencies: EventCommandHandlerDependencies = {
    unitOfWork: { transaction: async (operation) => operation(transaction) },
    repository: {
      assertPublishedReadyGallery: async () => {},
      loadForUpdate: async () => {
        operations.push("load");
        return null;
      },
      save: async (_transaction, input) => {
        operations.push("save");
        saved = input.aggregate;
      },
    },
    authorization: { recheck: async () => { operations.push("authorization"); } },
    receipts: {
      claim: async () => {
        operations.push("claim");
        return { kind: "CLAIMED" };
      },
      complete: async () => { operations.push("receipt"); },
    },
    audit: { append: async () => { operations.push("audit"); } },
    outbox: { append: async () => { operations.push("outbox"); } },
    teamBalance: { calculate: async () => { throw new Error("unused"); } },
    clock: {
      now: () => duringRecruitment,
      receiptExpiresAt: () => closesAt,
    },
    ...overrides,
  };
  return { dependencies, operations, saved: () => saved };
}

test("command handler rechecks authorization in-transaction and commits aggregate, audit, outbox, then receipt", async () => {
  const harness = handlerDependencies();
  const command = createAdminCommand();
  const result = await new EventCommandHandler(harness.dependencies).handle(command);
  assert.deepEqual(harness.operations, ["authorization", "claim", "load", "save", "audit", "outbox", "receipt"]);
  assert.equal(result.revision, 1);
  assert.equal(harness.saved()?.revision, 1);
});

test("authorized idempotency replay skips aggregate work and a mismatched fingerprint fails closed", async () => {
  const command = createAdminCommand();
  const body = { eventId: "event-handler", revision: 1, status: "PLANNED", commandType: "CREATE_EVENT" } as const;
  const receipt = {
    actorUserAccountId: "admin-1",
    scope: "admin:event:create",
    keyHash: digest(1),
    requestHash: command.metadata.idempotency.requestFingerprint,
    responseStatus: 201,
    body,
    revision: 1,
    createdAt: duringRecruitment,
    expiresAt: closesAt,
  } as const;
  const replayHarness = handlerDependencies({
    receipts: {
      claim: async () => {
        replayHarness.operations.push("claim");
        return { kind: "REPLAY", receipt };
      },
      complete: async () => { throw new Error("must not complete replay"); },
    },
  });
  const replay = await new EventCommandHandler(replayHarness.dependencies).handle(command);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replayHarness.operations, ["authorization", "claim"]);

  const mismatchHarness = handlerDependencies({
    receipts: { claim: async () => ({ kind: "MISMATCH" }), complete: async () => undefined },
  });
  await assert.rejects(
    new EventCommandHandler(mismatchHarness.dependencies).handle(command),
    expectEventError("IDEMPOTENCY_MISMATCH"),
  );
});

test("command handler rejects stale expected revisions before any aggregate write", async () => {
  const current = { ...planned(), revision: 2 };
  const harness = handlerDependencies({
    repository: {
      assertPublishedReadyGallery: async () => {},
      loadForUpdate: async () => {
        harness.operations.push("load");
        return current;
      },
      save: async () => { throw new Error("must not save a stale command"); },
    },
  });
  const initial = {
    type: "START_RECRUITMENT",
    eventId: current.id,
    metadata: { ...adminMetadata(1), idempotency: { ...adminMetadata(1).idempotency, scope: "admin:event:start" } },
    payload: {},
  } as const;
  const command: EventAdminCommand = {
    ...initial,
    metadata: {
      ...initial.metadata,
      idempotency: {
        ...initial.metadata.idempotency,
        requestFingerprint: eventCommandRequestFingerprint(initial),
      },
    },
  };
  await assert.rejects(
    new EventCommandHandler(harness.dependencies).handle(command),
    expectEventError("REVISION_CONFLICT"),
  );
  assert.deepEqual(harness.operations, ["authorization", "claim", "load"]);
});

test("command metadata cannot downgrade admin commands or detach owner intent from the player", () => {
  const harness = handlerDependencies();
  const forgedOwnerInput = {
    type: "UPSERT_OWN_APPLICATION",
    eventId: "event-position",
    metadata: {
      actor: { userAccountId: "user-1", sessionId: "session-1", purpose: "ACCOUNT", requiredRole: "USER" },
      authorizationIntent: {
        kind: "APPROVED_OWNER",
        ownerUserAccountId: "user-1",
        playerId: "player-other",
        requireApprovedAccount: true,
        requireOwnership: true,
        transactionRecheck: true,
      },
      requestId: "request-user",
      expectedRevision: 0,
      idempotency: { scope: "event:application:upsert", keyHash: digest(3), requestFingerprint: digest(4) },
      issuedAt: opensAt,
    },
    payload: { participantId: "participant-1", playerId: "player-1", mainPosition: "TOP", subPositions: [] },
  } as const;
  const forgedOwner = {
    ...forgedOwnerInput,
    metadata: {
      ...forgedOwnerInput.metadata,
      idempotency: {
        ...forgedOwnerInput.metadata.idempotency,
        requestFingerprint: eventCommandRequestFingerprint(forgedOwnerInput),
      },
    },
  } as const;
  assert.throws(
    () => new EventCommandHandler(harness.dependencies).handle(forgedOwner),
    expectEventError("INVALID_AUTHORIZATION_INTENT"),
  );
  assert.deepEqual(harness.operations, []);

  const command = createAdminCommand();
  assert.throws(
    () => new EventCommandHandler(harness.dependencies).handle({
      ...command,
      payload: { settings: { ...command.payload.settings, title: "fingerprint tampered" } },
    }),
    expectEventError("IDEMPOTENCY_MISMATCH"),
  );
  assert.deepEqual(harness.operations, []);

  const withoutTotp = {
    ...command,
    metadata: {
      ...command.metadata,
      authorizationIntent: { ...command.metadata.authorizationIntent, requireTotp: false },
    },
  };
  assert.throws(
    () => new EventCommandHandler(harness.dependencies).handle(withoutTotp as unknown as EventAdminCommand),
    expectEventError("INVALID_AUTHORIZATION_INTENT"),
  );
  assert.deepEqual(harness.operations, []);
});
