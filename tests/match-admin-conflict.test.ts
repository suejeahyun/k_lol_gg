import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLatestAdminMatchProjection,
  zonedStartedAtFromStoredInstant,
} from "../src/app/(admin)/admin/matches/admin-match-conflict";

const players = Array.from({ length: 10 }, (_, index) => ({
  playerId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  championKey: `champion-${index + 1}`,
  team: index < 5 ? "BLUE" : "RED",
  position: ["TOP", "JGL", "MID", "ADC", "SUP"][index % 5],
  kills: index,
  deaths: 1,
  assists: 2,
}));

function fixture() {
  return {
    match: {
      id: "10000000-0000-4000-8000-000000000001",
      seasonId: "20000000-0000-4000-8000-000000000001",
      teamBalanceDraftId: "30000000-0000-4000-8000-000000000001",
      title: "최신 정기 내전",
      playedOn: "2026-09-01",
      startedAt: "2026-09-01T10:00:00.000Z",
      startedAtOffsetMinutes: 540,
      status: "PUBLISHED",
      revision: 4,
      games: [{
        gameNumber: 1,
        durationSeconds: 1800,
        winnerTeam: "BLUE",
        participants: players,
      }],
    },
  };
}

test("admin match conflict parser accepts only a complete canonical aggregate", () => {
  const parsed = parseLatestAdminMatchProjection(fixture());
  assert.ok(parsed);
  assert.equal(parsed.revision, 4);
  assert.equal(parsed.body.startedAt, "2026-09-01T19:00:00+09:00");
  assert.equal(parsed.body.games.length, 1);
  assert.equal("teamBalanceDraftId" in parsed.body, false, "conflict retry cannot mutate provenance");

  const inconsistent = fixture();
  inconsistent.match.startedAt = null as unknown as string;
  assert.equal(parseLatestAdminMatchProjection(inconsistent), null);

  const incomplete = fixture();
  incomplete.match.games[0]!.participants.pop();
  assert.equal(parseLatestAdminMatchProjection(incomplete), null);
});

test("stored instant conversion is explicit and bounded by the recorded offset", () => {
  assert.equal(zonedStartedAtFromStoredInstant(null, null), null);
  assert.equal(zonedStartedAtFromStoredInstant("2026-09-01T10:00:00Z", 540), "2026-09-01T19:00:00+09:00");
  assert.equal(zonedStartedAtFromStoredInstant("2026-09-01T10:00:00Z", 900), null);
});
