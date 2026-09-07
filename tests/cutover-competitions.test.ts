import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImportedDestructionAggregate,
  buildImportedEventAggregate,
  importV1Competitions,
  type LegacyDestructionCompetition,
  type LegacyEventCompetition,
} from "../scripts/cutover/import-v1-competitions";
import type { CutoverClient } from "../scripts/cutover/types";

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const openedAt = "2026-09-01T00:00:00.000Z";
const closedAt = "2026-09-02T00:00:00.000Z";
const eventDate = "2026-09-03T00:00:00.000Z";

function teamBuildingEvent(): LegacyEventCompetition {
  const teams = [0, 1].map((index) => ({
    legacyId: index + 1,
    id: uuid(100 + index),
    name: index === 0 ? "블루" : "레드",
    seed: index + 1,
    score: 500 - index,
  }));
  const positions = ["TOP", "JGL", "MID", "ADC", "SUP"];
  const participants = Array.from({ length: 10 }, (_, index) => ({
    legacyId: index + 1,
    id: uuid(200 + index),
    playerId: uuid(300 + index),
    ownerUserAccountId: uuid(400 + index),
    teamId: teams[Math.floor(index / 5)]!.id,
    position: positions[index % 5]!,
    balanceScore: 50,
  }));
  return {
    legacyId: 1,
    id: uuid(1),
    title: "  하늘빛   이벤트전  ",
    description: "안전한 이관",
    status: "TEAM_BUILDING",
    mode: "POSITION",
    eventDate,
    recruitFrom: openedAt,
    recruitTo: closedAt,
    winnerTeamId: null,
    mvpPlayerId: null,
    galleryImageId: null,
    createdAt: openedAt,
    updatedAt: closedAt,
    teams,
    participants,
    applications: participants.map((participant, index) => ({
      legacyId: index + 1,
      id: uuid(500 + index),
      playerId: participant.playerId,
      ownerUserAccountId: participant.ownerUserAccountId,
      mainPosition: participant.position,
      subPositions: [],
      status: "CONFIRMED",
    })),
    fixtures: [],
  };
}

function teamBuildingDestruction(): LegacyDestructionCompetition {
  const positions = ["TOP", "JGL", "MID", "ADC", "SUP"];
  const teams = Array.from({ length: 4 }, (_, index) => ({
    legacyId: index + 1,
    id: uuid(600 + index),
    name: `팀 ${index + 1}`,
    captainPlayerId: uuid(800 + index * 5),
    initialAuctionPoints: 2_000,
    remainingAuctionPoints: 1_600,
    points: 0,
    wins: 0,
    losses: 0,
  }));
  const participants = Array.from({ length: 20 }, (_, index) => ({
    legacyId: index + 1,
    id: uuid(700 + index),
    playerId: uuid(800 + index),
    teamId: teams[Math.floor(index / 5)]!.id,
    position: positions[index % 5]!,
    isCaptain: index % 5 === 0,
    auctionStatus: index % 5 === 0 ? "ASSIGNED" : "SOLD",
    purchasePoints: index % 5 === 0 ? 0 : 100,
    drawOrder: index % 5 === 0 ? null : index,
  }));
  return {
    legacyId: 2,
    id: uuid(2),
    title: "멸망전",
    description: null,
    status: "TEAM_BUILDING",
    startDate: null,
    endDate: null,
    preliminaryFormat: "FULL_ROUND_ROBIN_BO1",
    preliminaryBestOf: 1,
    preliminaryRoundCount: 1,
    advanceTeamCount: 4,
    laneLimits: { TOP: 4, JGL: 4, MID: 4, ADC: 4, SUP: 4 },
    winnerTeamId: null,
    mvpPlayerId: null,
    galleryImageId: null,
    createdAt: openedAt,
    updatedAt: closedAt,
    applications: participants.map((participant, index) => ({
      legacyId: index + 1,
      id: uuid(900 + index),
      playerId: participant.playerId,
      ownerUserAccountId: uuid(1_000 + index),
      position: participant.position,
      subPositions: [],
      status: "CONFIRMED",
    })),
    participants,
    teams,
    fixtures: [],
    replacements: [],
  };
}

test("V1 events preserve participant ownership, team membership and a canonical import revision", () => {
  const aggregate = buildImportedEventAggregate(teamBuildingEvent());
  assert.equal(aggregate.revision, 1);
  assert.equal(aggregate.settings.title, "하늘빛 이벤트전");
  assert.equal(aggregate.lifecycle.status, "TEAM_BUILDING");
  assert.equal(aggregate.participants.length, 10);
  assert.equal(aggregate.teams.length, 2);
  assert.deepEqual(aggregate.teams.map((team) => team.members.length), [5, 5]);
  assert.equal(aggregate.participants[0]?.source, "USER_APPLICATION");
  assert.equal(aggregate.participants[0]?.ownerUserAccountId, uuid(400));
});

test("V1 event winners are replayed through the deterministic V2 bracket", () => {
  const source = teamBuildingEvent();
  const finalMvpPlayerId = source.participants[0]!.playerId;
  const completed = buildImportedEventAggregate({
    ...source,
    status: "COMPLETED",
    winnerTeamId: source.teams[0]!.id,
    mvpPlayerId: finalMvpPlayerId,
    fixtures: [{
      legacyId: 1,
      id: uuid(2_000),
      stage: "FINAL",
      round: 1,
      teamAId: source.teams[0]!.id,
      teamBId: source.teams[1]!.id,
      winnerTeamId: source.teams[0]!.id,
      mvpPlayerId: finalMvpPlayerId,
    }],
  });
  assert.equal(completed.bracket?.championTeamId, source.teams[0]!.id);
  assert.equal(completed.mvpParticipantId, source.participants[0]!.id);
});

test("V1 destruction preserves four validated rosters, applications and auction balances", () => {
  const aggregate = buildImportedDestructionAggregate(teamBuildingDestruction());
  assert.equal(aggregate.revision, 1);
  assert.equal(aggregate.configuration.teamCount, 4);
  assert.equal(aggregate.participants.length, 20);
  assert.equal(aggregate.applications.length, 20);
  assert.equal(aggregate.teams[0]?.captainParticipantId, uuid(700));
  assert.equal(aggregate.teams[0]?.remainingAuctionPoints, 1_600);
  assert.match(aggregate.auctionSeed ?? "", /^v1-import-/u);
});

test("lossy cancellation and in-flight auction states fail closed while gallery linking is deferred", () => {
  assert.throws(
    () => buildImportedEventAggregate({ ...teamBuildingEvent(), status: "CANCELLED" }),
    /lack a recoverable prior state/u,
  );
  assert.equal(
    buildImportedEventAggregate({ ...teamBuildingEvent(), galleryImageId: 7 }).id,
    teamBuildingEvent().id,
  );
  const destruction = teamBuildingDestruction();
  assert.throws(
    () => buildImportedDestructionAggregate({
      ...destruction,
      status: "AUCTION",
      participants: destruction.participants.map((participant, index) => index === 1 ? { ...participant, auctionStatus: "PENDING", purchasePoints: null } : participant),
    }),
    /no reproducible auction seed/u,
  );
});

test("empty source imports are rerunnable and never control the caller transaction", async () => {
  const statements: string[] = [];
  const client = {
    query: async (statement: string) => {
      statements.push(statement);
      if (statement.includes("from auth.user_accounts")) return { rows: [{ id: uuid(9_999) }], rowCount: 1 };
      if (statement.includes("select count(*)::text")) return { rows: [{ count: "0" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as CutoverClient;
  const options = { actorUserAccountId: uuid(9_999) };
  assert.deepEqual(await importV1Competitions(client, options), [
    { name: "event-competitions", sourceCount: 0, targetCount: 0, insertedCount: 0 },
    { name: "destruction-competitions", sourceCount: 0, targetCount: 0, insertedCount: 0 },
  ]);
  assert.deepEqual(await importV1Competitions(client, options), [
    { name: "event-competitions", sourceCount: 0, targetCount: 0, insertedCount: 0 },
    { name: "destruction-competitions", sourceCount: 0, targetCount: 0, insertedCount: 0 },
  ]);
  assert.equal(statements.some((statement) => /\b(?:begin|commit|rollback)\b/iu.test(statement)), false);
});
