import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSingleEliminationBracket,
  buildRoundRobinFixtures,
  buildSingleEliminationBracket,
  CompetitionCoreError,
  type StandingsFixture,
} from "../src/modules/competitions/core";
import {
  assignDestructionMvp,
  calculateCaptainAuctionPoints,
  cancelDestructionApplication,
  captureFixtureRosterSnapshot,
  castDestructionMvpVote,
  confirmDestructionTeams,
  createDestructionMvpBallot,
  DESTRUCTION_PRELIMINARY_FORMATS,
  drawAuctionParticipant,
  holdAuctionParticipant,
  isAuctionComplete,
  rebuildDestructionPreliminaryProjection,
  replaceDestructionParticipant,
  resetDestructionMvp,
  sellAuctionParticipant,
  validateConfirmedDestructionRosters,
  validateDestructionConfiguration,
  type DestructionAuctionState,
  type DestructionParticipant,
} from "../src/modules/competitions/destruction";

function failsWith(code: CompetitionCoreError["code"]) {
  return (error: unknown) => error instanceof CompetitionCoreError && error.code === code;
}

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const instant = "2026-09-07T00:00:00.000Z";

test("the eight preliminary configurations derive BO1/BO3 and enforce viable lane capacity", () => {
  assert.equal(DESTRUCTION_PRELIMINARY_FORMATS.length, 8);
  for (const format of DESTRUCTION_PRELIMINARY_FORMATS) {
    const config = validateDestructionConfiguration({
      preliminaryFormat: format,
      preliminaryRoundCount: 4,
      teamCount: 4,
      laneLimits: { TOP: 8, JGL: 8, MID: 8, ADC: 8, SUP: 8 },
    });
    assert.equal(config.preliminaryBestOf, format.endsWith("BO3") ? 3 : 1);
    assert.equal(config.preliminaryRoundCount, format.startsWith("SWISS") || format.startsWith("RANDOM") ? 4 : 1);
    assert.equal(config.advanceTeamCount, 4);
  }
  assert.throws(() => validateDestructionConfiguration({
    preliminaryFormat: "UNKNOWN",
    teamCount: 4,
    laneLimits: { TOP: 4, JGL: 4, MID: 4, ADC: 4, SUP: 4 },
  }), failsWith("PRECONDITION_FAILED"));
  assert.throws(() => validateDestructionConfiguration({
    preliminaryFormat: "FULL_ROUND_ROBIN_BO1",
    teamCount: 5,
    laneLimits: { TOP: 4, JGL: 5, MID: 5, ADC: 5, SUP: 5 },
  }), failsWith("PRECONDITION_FAILED"));
});

test("captain points use the versioned arithmetic boundary: subtract, round to ten, clamp", () => {
  assert.equal(calculateCaptainAuctionPoints(60.9), 1_390);
  assert.equal(calculateCaptainAuctionPoints(10), 1_900);
  assert.equal(calculateCaptainAuctionPoints(999), 0);
  assert.equal(calculateCaptainAuctionPoints(0), 2_000);
  assert.equal(calculateCaptainAuctionPoints(24.45), 1_760);
  assert.throws(() => calculateCaptainAuctionPoints(-1), failsWith("PRECONDITION_FAILED"));
});

function participant(index: number): DestructionParticipant {
  return {
    id: `participant-${index + 1}`,
    playerId: `player-${index + 1}`,
    position: positions[index % 5]!,
    isCaptain: false,
    teamId: null,
    auctionStatus: "PENDING",
    purchasePoints: null,
    drawOrder: null,
  };
}

test("owner/admin cancellation intent is explicit and cannot cancel another user's application", () => {
  const application = { id: "application-1", userAccountId: "user-1", playerId: "player-1", status: "APPLIED" as const };
  assert.equal(cancelDestructionApplication(application, {
    type: "CANCEL_APPLICATION",
    applicationId: application.id,
    actorUserAccountId: application.userAccountId,
    authorization: "OWNER",
  }).status, "CANCELLED");
  assert.throws(() => cancelDestructionApplication(application, {
    type: "CANCEL_APPLICATION",
    applicationId: application.id,
    actorUserAccountId: "user-2",
    authorization: "OWNER",
  }), failsWith("PRECONDITION_FAILED"));
});

test("captain confirmation and seeded auction preserve draw, balance, roster, and position invariants", () => {
  const pool = Array.from({ length: 20 }, (_, index) => participant(index));
  const confirmed = confirmDestructionTeams(pool, [0, 6, 12, 18].map((index, teamIndex) => ({
    teamId: `team-${teamIndex + 1}`,
    name: `Team ${teamIndex + 1}`,
    participantId: `participant-${index + 1}`,
    initialAuctionPoints: 2_000,
  })));
  const initial: DestructionAuctionState = { seed: "stable-seed-2026", ...confirmed };
  const drawA = drawAuctionParticipant(initial);
  const drawB = drawAuctionParticipant({ seed: "stable-seed-2026", teams: [...confirmed.teams].reverse(), participants: [...confirmed.participants].reverse() });
  assert.equal(drawA.participantId, drawB.participantId);
  assert.deepEqual(drawA.state, drawB.state);
  assert.equal(drawA.drawOrder, 1);
  assert.throws(() => drawAuctionParticipant(drawA.state), failsWith("INVALID_TRANSITION"));

  const selected = drawA.state.participants.find((entry) => entry.id === drawA.participantId)!;
  const compatibleTeam = drawA.state.teams.find((team) => !drawA.state.participants.some((entry) => entry.teamId === team.id && entry.position === selected.position))!;
  const sold = sellAuctionParticipant(drawA.state, { participantId: selected.id, teamId: compatibleTeam.id, purchasePoints: 250 });
  assert.equal(sold.teams.find((team) => team.id === compatibleTeam.id)?.remainingAuctionPoints, 1_750);
  assert.equal(sold.participants.find((entry) => entry.id === selected.id)?.auctionStatus, "SOLD");
  assert.equal(isAuctionComplete(sold), false);

  const heldDraw = drawAuctionParticipant(sold);
  const held = holdAuctionParticipant(heldDraw.state, heldDraw.participantId);
  assert.equal(held.participants.find((entry) => entry.id === heldDraw.participantId)?.auctionStatus, "HOLD");
  assert.throws(() => sellAuctionParticipant(drawAuctionParticipant(held).state, {
    participantId: drawAuctionParticipant(held).participantId,
    teamId: compatibleTeam.id,
    purchasePoints: 9_999,
  }), failsWith("PRECONDITION_FAILED"));
});

function completedFixture(fixture: ReturnType<typeof buildRoundRobinFixtures>[number], winnerTeamId: string): StandingsFixture {
  return {
    id: fixture.id,
    groupKey: fixture.groupKey,
    status: "COMPLETED",
    confirmed: true,
    bestOf: fixture.bestOf,
    teamAId: fixture.teamAId,
    teamBId: fixture.teamBId,
    teamAScore: winnerTeamId === fixture.teamAId ? 1 : 0,
    teamBScore: winnerTeamId === fixture.teamBId ? 1 : 0,
    winnerTeamId,
  };
}

test("preliminary standings always rebuild from the full fixture set and seed four finalists", () => {
  const teamIds = ["team-a", "team-b", "team-c", "team-d"];
  const configuration = validateDestructionConfiguration({
    preliminaryFormat: "FULL_ROUND_ROBIN_BO1",
    teamCount: 4,
    laneLimits: { TOP: 4, JGL: 4, MID: 4, ADC: 4, SUP: 4 },
  });
  const schedule = buildRoundRobinFixtures({ competitionId: "destruction-1", teams: teamIds.map((id) => ({ id })), bestOf: 1 });
  const fixtures = schedule.map((fixture) => completedFixture(fixture, fixture.teamAId));
  const first = rebuildDestructionPreliminaryProjection({ competitionId: "destruction-1", configuration, teamIds, fixtures });
  const corrected = rebuildDestructionPreliminaryProjection({
    competitionId: "destruction-1",
    configuration,
    teamIds,
    fixtures: fixtures.map((fixture, index) => index === 0 ? { ...fixture, teamAScore: 0, teamBScore: 1, winnerTeamId: fixture.teamBId } : fixture),
  });
  assert.equal(first.qualifiedTeamIds.length, 4);
  assert.equal(first.tournamentBracket.fixtures.filter((fixture) => fixture.stage === "SEMI_FINAL").length, 2);
  assert.notDeepEqual(corrected.standings, first.standings);
  assert.throws(() => rebuildDestructionPreliminaryProjection({
    competitionId: "destruction-1",
    configuration,
    teamIds,
    fixtures: fixtures.map((fixture, index) => index === 0 ? { ...fixture, confirmed: false } : fixture),
  }), failsWith("PRECONDITION_FAILED"));
});

function fullRoster(teamId: string, offset: number): DestructionParticipant[] {
  return positions.map((position, index) => ({
    id: `${teamId}-participant-${index + 1}`,
    playerId: `player-${offset + index + 1}`,
    position,
    isCaptain: index === 0,
    teamId,
    auctionStatus: index === 0 ? "ASSIGNED" : "SOLD",
    purchasePoints: index === 0 ? 0 : 100,
    drawOrder: index === 0 ? null : offset + index,
  }));
}

test("a replacement changes only the current roster and cannot rewrite an existing fixture snapshot", () => {
  const participants = [...fullRoster("team-a", 0), ...fullRoster("team-b", 5)];
  const snapshot = captureFixtureRosterSnapshot({ fixtureId: "fixture-1", teamAId: "team-a", teamBId: "team-b", participants, capturedAt: instant });
  const result = replaceDestructionParticipant({
    replacementId: "replacement-1",
    participantId: "team-a-participant-2",
    incomingPlayerId: "player-11",
    incomingPosition: "JGL",
    reason: "선수 개인 사정",
    effectiveAt: instant,
    participants,
    replacements: [],
    fixtureSnapshots: [snapshot],
  });
  assert.equal(result.participants.find((entry) => entry.id === "team-a-participant-2")?.playerId, "player-11");
  assert.equal(result.fixtureSnapshots[0], snapshot);
  assert.equal(result.fixtureSnapshots[0]?.teamA[1]?.playerId, "player-2");
  assert.throws(() => replaceDestructionParticipant({
    replacementId: "replacement-2",
    participantId: "team-a-participant-2",
    incomingPlayerId: "player-12",
    incomingPosition: "MID",
    reason: "포지션 중복",
    effectiveAt: instant,
    participants,
    replacements: [],
    fixtureSnapshots: [snapshot],
  }), failsWith("INVALID_ROSTER"));
  assert.equal(validateConfirmedDestructionRosters([
    { id: "team-a", name: "A", captainParticipantId: "team-a-participant-1", initialAuctionPoints: 2_000, remainingAuctionPoints: 1_600, confirmed: true },
    { id: "team-b", name: "B", captainParticipantId: "team-b-participant-1", initialAuctionPoints: 2_000, remainingAuctionPoints: 1_600, confirmed: true },
  ], result.participants), true);
});

test("match-wide MVP voting bans self votes, requires ten voters, and limits tie revotes", () => {
  const playerIds = Array.from({ length: 10 }, (_, index) => `player-${index + 1}`);
  let ballot = createDestructionMvpBallot("fixture-1", playerIds);
  assert.throws(() => castDestructionMvpVote(ballot, { voterPlayerId: "player-1", candidatePlayerId: "player-1" }, instant), failsWith("PRECONDITION_FAILED"));
  for (const voter of playerIds) {
    const candidatePlayerId = ["player-1", "player-2", "player-3", "player-4", "player-10"].includes(voter) ? "player-9" : "player-10";
    const result = castDestructionMvpVote(ballot, { voterPlayerId: voter, candidatePlayerId }, instant);
    ballot = result.ballot;
  }
  assert.equal(ballot.round, 2);
  assert.deepEqual(ballot.candidatePlayerIds, ["player-10", "player-9"]);
  assert.equal(ballot.votes.length, 0);
  assert.throws(() => castDestructionMvpVote(ballot, { voterPlayerId: "player-1", candidatePlayerId: "player-8" }, instant), failsWith("PRECONDITION_FAILED"));
  for (const voter of playerIds) {
    const candidatePlayerId = voter === "player-9" ? "player-10" : "player-9";
    ballot = castDestructionMvpVote(ballot, { voterPlayerId: voter, candidatePlayerId }, instant).ballot;
  }
  assert.equal(ballot.finalizedPlayerId, "player-9");
  assert.equal(ballot.selectionMethod, "VOTE");
  const admin = assignDestructionMvp(resetDestructionMvp(ballot), "player-3", instant);
  assert.equal(admin.selectionMethod, "ADMIN");
  assert.equal(resetDestructionMvp(admin).round, 1);
});

test("the common bracket can finish semifinal and final fixtures for destruction completion", () => {
  let bracket = buildSingleEliminationBracket({ competitionId: "destruction-final", teams: ["a", "b", "c", "d"].map((id, index) => ({ id: `team-${id}`, seed: index + 1 })), bestOf: 3 });
  for (const fixture of bracket.fixtures.filter((entry) => entry.stage === "SEMI_FINAL")) {
    bracket = advanceSingleEliminationBracket(bracket, { fixtureId: fixture.id, teamAScore: 2, teamBScore: 0, winnerTeamId: fixture.teamAId! }).bracket;
  }
  const final = bracket.fixtures.find((fixture) => fixture.stage === "FINAL")!;
  bracket = advanceSingleEliminationBracket(bracket, { fixtureId: final.id, teamAScore: 2, teamBScore: 1, winnerTeamId: final.teamAId! }).bracket;
  assert.ok(bracket.championTeamId);
});
