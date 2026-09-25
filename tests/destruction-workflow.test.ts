import assert from "node:assert/strict";
import test from "node:test";
import { validateDestructionConfiguration, DESTRUCTION_PRELIMINARY_FORMATS } from "../src/modules/competitions/destruction/configuration";
import { destructionReadiness, destructionRecruitment, destructionStandings } from "../src/modules/competitions/destruction/workflow";
import { buildPreliminaryFixtures } from "../src/modules/competitions/destruction/fixtures";
import { auctionTeamEligibility, sellAuctionParticipant } from "../src/modules/competitions/destruction/auction";
import { toDestructionPublicDto, type DestructionAggregate } from "../src/modules/competitions/destruction/state";
import { destructionErrorResponse } from "../src/modules/competitions/destruction/destruction-http";
import { DestructionRevisionConflict } from "../src/modules/competitions/destruction/revision-conflict";
import { CompetitionCoreError } from "../src/modules/competitions/core/error";
import { COMPETITION_POSITIONS } from "../src/modules/competitions/core/roster";
import { EMPTY_DESTRUCTION_SCHEDULE, validateDestructionSchedule } from "../src/modules/competitions/destruction/schedule";

function aggregate(): DestructionAggregate {
  const participants = Array.from({ length: 20 }, (_, i) => ({ id: `participant-${i}`, playerId: `player-${i}`, position: COMPETITION_POSITIONS[i % 5]!, isCaptain: i % 5 === 0, teamId: `team-${Math.floor(i / 5)}`, auctionStatus: "ASSIGNED" as const, purchasePoints: 0, drawOrder: null }));
  return {
    id: "workflow", revision: 8, title: "검증 대회", lifecycle: { status: "AUCTION", cancelledFrom: null, cancellationReason: null },
    configuration: validateDestructionConfiguration({ preliminaryFormat: "FULL_ROUND_ROBIN_BO1", teamCount: 4, laneLimits: { TOP: 5, JGL: 5, MID: 5, ADC: 5, SUP: 5 } }),
    applications: participants.map((entry) => ({ id: entry.id, playerId: entry.playerId, userAccountId: `user-${entry.id}`, position: entry.position, status: "CONFIRMED" as const })),
    teams: Array.from({ length: 4 }, (_, i) => ({ id: `team-${i}`, name: `${i + 1}팀`, captainParticipantId: `participant-${i * 5}`, initialAuctionPoints: 1500, remainingAuctionPoints: 1500, confirmed: false })),
    participants, auctionSeed: "test-auction-seed", preliminaryFixtures: [], qualifiedTeamIds: [], tournamentBracket: null, rosterSnapshots: [], replacements: [], mvpBallots: [], galleryId: null, createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z",
  };
}

test("recruitment counters exclude withdrawn and rejected applications; transition identifies a missing lane", () => {
  const base = aggregate();
  const current: DestructionAggregate = { ...base, lifecycle: { ...base.lifecycle, status: "RECRUITING" }, applications: base.applications.map((entry, index) => index === 0 ? { ...entry, status: "CANCELLED" } : entry) };
  const lane = destructionRecruitment(current)[0]!;
  assert.deepEqual(lane, { position: "TOP", applied: 3, confirmed: 3, limit: 5, required: 4 });
  const readiness = destructionReadiness(current);
  assert.equal(readiness.ready, false); assert.equal(readiness.action, "CLOSE_RECRUITMENT");
  assert.ok(readiness.blockers.some((reason) => reason.includes("TOP")));
  assert.equal(destructionReadiness({ ...current, applications: base.applications }).ready, true);
});

test("auction completion requires all five positions and refuses a paused auction", () => {
  const base = aggregate();
  assert.equal(destructionReadiness(base).ready, true);
  assert.equal(destructionReadiness({ ...base, auctionPaused: true }).ready, false);
  assert.equal(destructionReadiness({ ...base, participants: base.participants.slice(1) }).ready, false);
  assert.equal(destructionReadiness({ ...base, participants: base.participants.map((entry, i) => i === 1 ? { ...entry, position: "TOP" } : entry) }).ready, false);
});

test("preview generation retains every legacy format and produces no self matches or duplicate fixture IDs", () => {
  for (const format of DESTRUCTION_PRELIMINARY_FORMATS) {
    const base = aggregate();
    const fixtures = buildPreliminaryFixtures({ ...base, configuration: validateDestructionConfiguration({ preliminaryFormat: format, preliminaryRoundCount: 4, teamCount: 4, laneLimits: base.configuration.laneLimits }) });
    assert.ok(fixtures.length > 0);
    assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
    assert.ok(fixtures.every((fixture) => fixture.teamAId !== fixture.teamBId && fixture.bestOf === (format.endsWith("BO3") ? 3 : 1)));
  }
});

test("auction eligibility and server validation retain the minimum points for every unfilled slot", () => {
  const base = aggregate();
  const state = { seed: base.auctionSeed!, teams: base.teams, participants: base.participants.map((entry) => entry.isCaptain ? entry : { ...entry, teamId: null, purchasePoints: null, auctionStatus: entry.id === "participant-1" ? "DRAWN" as const : "PENDING" as const }) };
  const option = auctionTeamEligibility(state, "participant-1")[0]!;
  assert.equal(option.maximum, 1497);
  assert.equal(option.reason, null);
  assert.throws(() => sellAuctionParticipant(state, { participantId: "participant-1", teamId: "team-0", purchasePoints: 1498 }), /최소 입찰가/);
  const sold = sellAuctionParticipant(state, { participantId: "participant-1", teamId: "team-0", purchasePoints: 1497 });
  assert.equal(sold.teams[0]!.remainingAuctionPoints, 3);
});

test("public progress reveals totals and standings without exposing applicant ownership or raw ballots", () => {
  const base = aggregate();
  const fixtures = buildPreliminaryFixtures(base).map((fixture, index) => index === 0 ? { ...fixture, status: "COMPLETED" as const, confirmed: true, teamAScore: 1, teamBScore: 0, winnerTeamId: fixture.teamAId } : fixture);
  const current = { ...base, preliminaryFixtures: fixtures };
  const groups = destructionStandings(current);
  assert.equal(groups[0]!.rows[0]!.teamId, fixtures[0]!.teamAId);
  assert.equal(groups[0]!.rows.reduce((total, row) => total + row.played, 0), 2);
  const dto = toDestructionPublicDto(current);
  assert.equal(dto.recruitment[0]!.confirmed, 4);
  assert.doesNotMatch(JSON.stringify(dto), /userAccountId|auctionSeed|mvpBallots|cancellationReason/);
});

test("only a stale revision produces HTTP 412; business preconditions produce 409", () => {
  assert.equal(destructionErrorResponse(new DestructionRevisionConflict()).status, 412);
  assert.equal(destructionErrorResponse(new CompetitionCoreError("PRECONDITION_FAILED", "budget")).status, 409);
});

test("optional schedule preserves old snapshots and rejects reversed or invalid dates", () => {
  assert.deepEqual(toDestructionPublicDto(aggregate()).schedule, EMPTY_DESTRUCTION_SCHEDULE);
  assert.equal(validateDestructionSchedule({ ...EMPTY_DESTRUCTION_SCHEDULE, auctionStartsAt: "2026-10-01T10:00:00.000Z" }).auctionStartsAt, "2026-10-01T10:00:00.000Z");
  assert.throws(() => validateDestructionSchedule({ ...EMPTY_DESTRUCTION_SCHEDULE, recruitmentEndsAt: "2026-10-02T10:00:00.000Z", auctionStartsAt: "2026-10-01T10:00:00.000Z" }));
  assert.throws(() => validateDestructionSchedule({ ...EMPTY_DESTRUCTION_SCHEDULE, auctionStartsAt: "not-a-date" }));
  assert.throws(() => validateDestructionSchedule({ ...EMPTY_DESTRUCTION_SCHEDULE, unexpected: true }));
});

test("positionless recruitment and auction preserve headcount and money without imposing roles", () => {
  for (const gameMode of ["ARAM", "ARAM_MAYHEM"] as const) {
    const base = aggregate();
    const configuration = validateDestructionConfiguration({ gameMode, teamCount: 4, recruitmentLimit: 24, preliminaryFormat: "FULL_ROUND_ROBIN_BO1" });
    const participants = base.participants.map((p) => ({ ...p, position: null }));
    const current = { ...base, configuration, participants, applications: base.applications.map((p) => ({ ...p, position: null })) };
    assert.deepEqual(destructionRecruitment(current), [{ position: null, applied: 20, confirmed: 20, limit: 24, required: 20 }]);
    assert.equal(destructionReadiness(current).ready, true);
    const state = { configuration, seed: base.auctionSeed!, teams: base.teams, participants: participants.map((p) => p.isCaptain ? p : { ...p, teamId: null, purchasePoints: null, minimumBid: 300, auctionStatus: p.id === "participant-1" ? "DRAWN" as const : "PENDING" as const }) };
    const option = auctionTeamEligibility(state, "participant-1")[0]!;
    assert.equal(option.reason, null); assert.equal(option.maximum, 600);
    assert.throws(() => sellAuctionParticipant(state, { participantId: "participant-1", teamId: "team-0", purchasePoints: 601 }), /최소 입찰가/);
    const sold = sellAuctionParticipant(state, { participantId: "participant-1", teamId: "team-0", purchasePoints: 600 });
    assert.equal(sold.teams[0]!.remainingAuctionPoints, 900);
    const full = { ...state, participants: state.participants.map((p, i) => i >= 2 && i <= 5 ? { ...p, teamId: "team-0", purchasePoints: 300, auctionStatus: "SOLD" as const } : p) };
    assert.throws(() => sellAuctionParticipant(full, { participantId: "participant-1", teamId: "team-0", purchasePoints: 300 }), /already full|exceed five/);
    assert.throws(() => validateDestructionConfiguration({ gameMode, teamCount: 4, recruitmentLimit: 19, preliminaryFormat: "FULL_ROUND_ROBIN_BO1" }));
  }
});
