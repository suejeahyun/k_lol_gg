import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSingleEliminationBracket,
  buildGroupRoundRobinFixtures,
  buildRoundRobinFixtures,
  buildSingleEliminationBracket,
  CompetitionCoreError,
  INITIAL_DESTRUCTION_LIFECYCLE,
  INITIAL_EVENT_LIFECYCLE,
  recalculateStandings,
  seedCompetitionTeams,
  transitionDestructionLifecycle,
  transitionEventLifecycle,
  validateBestOfResult,
  validateCompetitionAuditEvent,
  validateCompetitionCommandEnvelope,
  validateCompetitionCommandReceipt,
  validateCompetitionOutboxEvent,
  validateCompetitionRoster,
  type CompetitionPosition,
  type CompetitionTeamSeedInput,
  type StandingsFixture,
} from "../src/modules/competitions/core";

function failsWith(code: CompetitionCoreError["code"]) {
  return (error: unknown) => error instanceof CompetitionCoreError && error.code === code;
}

const digest = (byte: number) => new Uint8Array(32).fill(byte);
const instant = "2026-09-07T00:00:00.000Z";

test("event lifecycle follows its explicit path and restores only its recorded cancelled state", () => {
  const recruiting = transitionEventLifecycle(INITIAL_EVENT_LIFECYCLE, { type: "START_RECRUITMENT" });
  const building = transitionEventLifecycle(recruiting, { type: "CLOSE_RECRUITMENT", participantsReady: true });
  const cancelled = transitionEventLifecycle(building, { type: "CANCEL", reason: " 운영자 일정 변경 " });

  assert.deepEqual(cancelled, {
    status: "CANCELLED",
    cancelledFrom: "TEAM_BUILDING",
    cancellationReason: "운영자 일정 변경",
  });
  assert.deepEqual(transitionEventLifecycle(cancelled, { type: "RESTORE_CANCELLED" }), building);
  assert.throws(
    () => transitionEventLifecycle({ ...cancelled, cancellationReason: null }, { type: "RESTORE_CANCELLED" }),
    failsWith("INVALID_TRANSITION"),
  );
  assert.throws(
    () => transitionEventLifecycle(recruiting, { type: "PUBLISH_BRACKET", rostersValid: true, bracketReady: true }),
    failsWith("INVALID_TRANSITION"),
  );
  assert.throws(
    () => transitionEventLifecycle(building, { type: "PUBLISH_BRACKET", rostersValid: false, bracketReady: true }),
    failsWith("PRECONDITION_FAILED"),
  );
});

test("event lifecycle cannot complete without a confirmed final or leave a terminal state", () => {
  const progress = transitionEventLifecycle(
    { status: "TEAM_BUILDING", cancelledFrom: null, cancellationReason: null },
    { type: "PUBLISH_BRACKET", rostersValid: true, bracketReady: true },
  );
  assert.throws(
    () => transitionEventLifecycle(progress, { type: "COMPLETE", finalResultConfirmed: false }),
    failsWith("PRECONDITION_FAILED"),
  );
  const complete = transitionEventLifecycle(progress, { type: "COMPLETE", finalResultConfirmed: true });
  assert.throws(
    () => transitionEventLifecycle(complete, { type: "CANCEL", reason: "완료 뒤 취소" }),
    failsWith("INVALID_TRANSITION"),
  );
});

test("destruction lifecycle gates auction, preliminary, four-team tournament, and final", () => {
  let state = transitionDestructionLifecycle(INITIAL_DESTRUCTION_LIFECYCLE, { type: "START_RECRUITMENT" });
  state = transitionDestructionLifecycle(state, { type: "CLOSE_RECRUITMENT", participantsReady: true });
  state = transitionDestructionLifecycle(state, { type: "START_AUCTION", rostersValid: true });
  state = transitionDestructionLifecycle(state, { type: "PUBLISH_PRELIMINARY", auctionComplete: true, fixturesReady: true });
  assert.throws(
    () => transitionDestructionLifecycle(state, { type: "PUBLISH_TOURNAMENT", preliminaryComplete: true, finalistCount: 3 }),
    failsWith("PRECONDITION_FAILED"),
  );
  state = transitionDestructionLifecycle(state, { type: "PUBLISH_TOURNAMENT", preliminaryComplete: true, finalistCount: 4 });
  state = transitionDestructionLifecycle(state, { type: "COMPLETE", finalResultConfirmed: true });
  assert.equal(state.status, "COMPLETED");
});

function roster(positionValues: readonly (CompetitionPosition | null)[]) {
  return positionValues.map((position, index) => ({
    participantId: `participant-${index + 1}`,
    playerId: `player-${index + 1}`,
    position,
    isCaptain: index === 0,
  }));
}

test("rosters enforce five unique players, positional coverage, ARAM semantics, and one captain", () => {
  const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
  assert.equal(validateCompetitionRoster({ format: "POSITIONAL", members: roster(positions), requireCaptain: true }).members.length, 5);
  assert.equal(validateCompetitionRoster({ format: "ARAM", members: roster(["TOP", "TOP", null, "ADC", null]) }).members.length, 5);
  assert.throws(
    () => validateCompetitionRoster({ format: "POSITIONAL", members: roster(["TOP", "TOP", "MID", "ADC", "SUP"]) }),
    failsWith("INVALID_ROSTER"),
  );
  const duplicate = roster(positions).map((member, index) => index === 4 ? { ...member, playerId: "player-1" } : member);
  assert.throws(() => validateCompetitionRoster({ format: "POSITIONAL", members: duplicate }), failsWith("DUPLICATE_ID"));
  assert.throws(
    () => validateCompetitionRoster({ format: "ARAM", members: roster([null, null, null, null, null]).map((member) => ({ ...member, isCaptain: false })), requireCaptain: true }),
    failsWith("INVALID_ROSTER"),
  );
});

test("best-of results require an exact clinching score and a consistent winner", () => {
  assert.deepEqual(validateBestOfResult({
    bestOf: 5,
    teamAId: "team-a",
    teamBId: "team-b",
    teamAScore: 3,
    teamBScore: 2,
    winnerTeamId: "team-a",
  }), {
    bestOf: 5,
    teamAId: "team-a",
    teamBId: "team-b",
    teamAScore: 3,
    teamBScore: 2,
    winnerTeamId: "team-a",
    requiredWins: 3,
  });
  for (const result of [
    { bestOf: 3, teamAScore: 1, teamBScore: 0, winnerTeamId: "team-a" },
    { bestOf: 3, teamAScore: 2, teamBScore: 2, winnerTeamId: "team-a" },
    { bestOf: 3, teamAScore: 2, teamBScore: 0, winnerTeamId: "team-b" },
    { bestOf: 2, teamAScore: 2, teamBScore: 0, winnerTeamId: "team-a" },
  ]) {
    assert.throws(
      () => validateBestOfResult({ teamAId: "team-a", teamBId: "team-b", ...result }),
      failsWith("INVALID_RESULT"),
    );
  }
});

const bracketTeams = [
  { id: "team-e", score: 10 },
  { id: "team-c", score: 30 },
  { id: "team-a", score: 50 },
  { id: "team-d", score: 20 },
  { id: "team-b", score: 40 },
] as const;

test("single elimination seeding is canonical and creates replayable bye/source-fixture structure", () => {
  const first = buildSingleEliminationBracket({ competitionId: "event-1", teams: bracketTeams, bestOf: [1, 3, 5] });
  const replay = buildSingleEliminationBracket({ competitionId: "event-1", teams: [...bracketTeams].reverse(), bestOf: [1, 3, 5] });
  assert.deepEqual(replay, first);
  assert.equal(first.bracketSize, 8);
  assert.deepEqual(first.teams.map((team) => [team.id, team.seed]), [
    ["team-a", 1], ["team-b", 2], ["team-c", 3], ["team-d", 4], ["team-e", 5],
  ]);
  assert.deepEqual(first.fixtures.slice(0, 4).map((fixture) => fixture.winnerTeamId), ["team-a", null, "team-b", "team-c"]);
  assert.deepEqual(first.fixtures[4]?.sourceA, { kind: "WINNER", sourceFixtureId: "event-1:SE:R1:M1" });
  assert.equal(first.fixtures.at(-1)?.stage, "FINAL");
  assert.equal(first.championTeamId, null);
  assert.throws(
    () => seedCompetitionTeams([{ id: "a", seed: 1 }, { id: "b" }]),
    failsWith("INVALID_BRACKET"),
  );
});

test("bracket advancement is deterministic, idempotent, and rejects overwrites or premature results", () => {
  let bracket = buildSingleEliminationBracket({ competitionId: "event-2", teams: bracketTeams, bestOf: [1, 3, 5] });
  assert.throws(
    () => advanceSingleEliminationBracket(bracket, { fixtureId: "event-2:SE:R2:M1", teamAScore: 2, teamBScore: 0, winnerTeamId: "team-a" }),
    failsWith("INVALID_FIXTURE"),
  );
  bracket = advanceSingleEliminationBracket(bracket, { fixtureId: "event-2:SE:R1:M2", teamAScore: 1, teamBScore: 0, winnerTeamId: "team-d" }).bracket;
  assert.deepEqual([bracket.fixtures[4]?.teamAId, bracket.fixtures[4]?.teamBId], ["team-a", "team-d"]);
  bracket = advanceSingleEliminationBracket(bracket, { fixtureId: "event-2:SE:R2:M1", teamAScore: 2, teamBScore: 0, winnerTeamId: "team-a" }).bracket;
  bracket = advanceSingleEliminationBracket(bracket, { fixtureId: "event-2:SE:R2:M2", teamAScore: 0, teamBScore: 2, winnerTeamId: "team-c" }).bracket;
  bracket = advanceSingleEliminationBracket(bracket, { fixtureId: "event-2:SE:R3:M1", teamAScore: 3, teamBScore: 1, winnerTeamId: "team-a" }).bracket;
  assert.equal(bracket.championTeamId, "team-a");
  assert.equal(advanceSingleEliminationBracket(bracket, { fixtureId: "event-2:SE:R3:M1", teamAScore: 3, teamBScore: 1, winnerTeamId: "team-a" }).replayed, true);
  assert.throws(
    () => advanceSingleEliminationBracket(bracket, { fixtureId: "event-2:SE:R3:M1", teamAScore: 2, teamBScore: 3, winnerTeamId: "team-c" }),
    failsWith("INVALID_FIXTURE"),
  );
});

function pairKey(left: string, right: string) {
  return [left, right].sort().join("/");
}

test("round robin schedules each pair exactly once without same-round double booking", () => {
  const teams: CompetitionTeamSeedInput[] = ["e", "c", "a", "d", "b"].map((id) => ({ id: `team-${id}` }));
  const fixtures = buildRoundRobinFixtures({ competitionId: "destruction-1", teams, bestOf: 3 });
  assert.equal(fixtures.length, 10);
  assert.equal(new Set(fixtures.map((fixture) => pairKey(fixture.teamAId, fixture.teamBId))).size, 10);
  for (let round = 1; round <= 5; round += 1) {
    const ids = fixtures.filter((fixture) => fixture.roundNumber === round).flatMap((fixture) => [fixture.teamAId, fixture.teamBId]);
    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.deepEqual(buildRoundRobinFixtures({ competitionId: "destruction-1", teams: [...teams].reverse(), bestOf: 3 }), fixtures);
});

test("group round robin is group-key canonical and prevents cross-group duplicates", () => {
  const fixtures = buildGroupRoundRobinFixtures({
    competitionId: "destruction-2",
    bestOf: 1,
    groups: [
      { key: "B", teams: [{ id: "team-d" }, { id: "team-e" }, { id: "team-f" }] },
      { key: "A", teams: [{ id: "team-a" }, { id: "team-b" }, { id: "team-c" }] },
    ],
  });
  assert.equal(fixtures.length, 6);
  assert.deepEqual(fixtures.map((fixture) => fixture.groupKey), ["A", "A", "A", "B", "B", "B"]);
  assert.throws(
    () => buildGroupRoundRobinFixtures({
      competitionId: "destruction-2",
      bestOf: 1,
      groups: [{ key: "A", teams: [{ id: "team-a" }, { id: "team-b" }] }, { key: "B", teams: [{ id: "team-a" }, { id: "team-c" }] }],
    }),
    failsWith("DUPLICATE_ID"),
  );
});

function completedFixture(
  id: string,
  teamAId: string,
  teamBId: string,
  teamAScore: number,
  teamBScore: number,
  confirmed = true,
): StandingsFixture {
  return {
    id,
    groupKey: "A",
    status: "COMPLETED",
    confirmed,
    bestOf: 3,
    teamAId,
    teamBId,
    teamAScore,
    teamBScore,
    winnerTeamId: teamAScore > teamBScore ? teamAId : teamBId,
  };
}

test("standings rebuild from the full confirmed fixture set with V1-compatible canonical ties", () => {
  const fixtures = [
    completedFixture("fixture-1", "team-a", "team-b", 2, 0),
    completedFixture("fixture-2", "team-a", "team-c", 0, 2),
    completedFixture("fixture-3", "team-b", "team-c", 2, 1, false),
  ];
  const standings = recalculateStandings({ teamIds: ["team-c", "team-a", "team-b"], fixtures, groupKey: "A" });
  assert.deepEqual(standings.map((entry) => [entry.teamId, entry.points, entry.wins, entry.losses]), [
    ["team-c", 1, 1, 0], ["team-a", 1, 1, 1], ["team-b", 0, 0, 1],
  ]);

  const corrected = recalculateStandings({
    teamIds: ["team-a", "team-b", "team-c"],
    fixtures: [completedFixture("fixture-1", "team-a", "team-b", 0, 2), fixtures[1]!],
  });
  assert.deepEqual(corrected.map((entry) => [entry.teamId, entry.points, entry.losses]), [
    ["team-b", 1, 0], ["team-c", 1, 0], ["team-a", 0, 2],
  ]);
  assert.throws(
    () => recalculateStandings({ teamIds: ["team-a", "team-b"], fixtures: [fixtures[0]!, fixtures[0]!] }),
    failsWith("DUPLICATE_ID"),
  );
});

test("command envelope and receipt validators bind actor purpose, optimistic revision, and digests", () => {
  const envelope = {
    actor: { userAccountId: "user-1", sessionId: "session-1", purpose: "ADMIN", requiredRole: "ADMIN" },
    authorization: "ADMIN_MUTATION",
    requestId: "request-1",
    aggregateId: "event-1",
    expectedRevision: 4,
    scope: "admin:event:publish",
    keyHash: digest(1),
    requestHash: digest(2),
    issuedAt: instant,
    payload: { nextStatus: "IN_PROGRESS" },
  } as const;
  assert.equal(validateCompetitionCommandEnvelope(envelope), envelope);
  assert.throws(
    () => validateCompetitionCommandEnvelope({ ...envelope, authorization: "APPROVED_ACCOUNT_MUTATION" }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );
  assert.throws(
    () => validateCompetitionCommandEnvelope({ ...envelope, expectedRevision: null }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );
  assert.throws(
    () => validateCompetitionCommandEnvelope({ ...envelope, payload: { accessToken: "must-not-persist" } }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );

  const receipt = {
    actorUserAccountId: "user-1",
    scope: "admin:event:publish",
    keyHash: digest(1),
    requestHash: digest(2),
    responseStatus: 200,
    body: { id: "event-1" },
    revision: 5,
    createdAt: instant,
    expiresAt: "2026-09-08T00:00:00.000Z",
  } as const;
  assert.equal(validateCompetitionCommandReceipt(receipt), receipt);
  assert.throws(
    () => validateCompetitionCommandReceipt({ ...receipt, requestHash: digest(2).slice(0, 31) }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );
});

test("audit and outbox contracts reject secret-bearing or incoherent records", () => {
  const audit = {
    requestId: "request-1",
    actorUserAccountId: "user-1",
    action: "EVENT_PUBLISHED",
    targetType: "EVENT",
    targetId: "event-1",
    before: { status: "TEAM_BUILDING" },
    after: { status: "IN_PROGRESS" },
    metadata: {},
    occurredAt: instant,
  } as const;
  assert.equal(validateCompetitionAuditEvent(audit), audit);
  assert.throws(
    () => validateCompetitionAuditEvent({ ...audit, metadata: { password: "raw" } }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );

  const outbox = {
    id: "outbox-1",
    requestId: "request-1",
    aggregateType: "EVENT",
    aggregateId: "event-1",
    aggregateRevision: 5,
    eventType: "EVENT_PUBLISHED",
    dedupeKey: "event-1:5:published",
    payload: { eventId: "event-1" },
    status: "PENDING",
    attemptCount: 0,
    occurredAt: instant,
    deliveredAt: null,
  } as const;
  assert.equal(validateCompetitionOutboxEvent(outbox), outbox);
  assert.throws(
    () => validateCompetitionOutboxEvent({ ...outbox, status: "DELIVERED" }),
    failsWith("INVALID_COMMAND_CONTRACT"),
  );
});
