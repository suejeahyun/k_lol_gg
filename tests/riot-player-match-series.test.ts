import assert from "node:assert/strict";
import test from "node:test";
import { matchGrowthSeries } from "../src/components/riot/player-match-series";
import { normalizeRiotMatch, normalizeRiotTimeline } from "../src/modules/riot/domain/riot-match-normalizer";
import { analyticsMatch, analyticsPuuid, analyticsTimeline } from "./fixtures/riot-analytics";

function fixture() {
  const base = normalizeRiotMatch(analyticsMatch(), "KR_100", analyticsPuuid)!;
  return { ...base, timeline: normalizeRiotTimeline(analyticsTimeline(), base)! };
}

test("match growth series compares the matching enemy lane and uses actual frame timestamps", () => {
  const match = fixture();
  assert.deepEqual(matchGrowthSeries(match, "cs").map((row) => [row.timestamp, row.value, row.opponent]), [[0, 0, 0], [600000, 60, 60], [900000, 90, 90]]);
  assert.equal(matchGrowthSeries(match, "teamGold")[2].value, 0);
  assert.equal(matchGrowthSeries({ ...match, mapId: 12 }, "xp")[2].opponent, null);
  const multiTeam = { ...match, participants: match.participants.map((row) => row.participantId === 10 ? { ...row, teamId: 300 } : row) };
  assert.equal(matchGrowthSeries(multiTeam, "teamGold")[2].value, null, "multiple opponents cannot be combined into one opposing team");
});

test("match growth series does not count missing participants or statistics as zero", () => {
  const original = fixture();
  const match = { ...original, timeline: { ...original.timeline, frames: original.timeline.frames.map((frame) => ({ ...frame, participants: frame.participants.map((row) => row.participantId === 2 ? { ...row, totalGold: null } : row) })) } };
  assert.equal(matchGrowthSeries(match, "teamGold")[2].value, null);
  assert.equal(matchGrowthSeries({ ...match, timeline: null }, "totalGold").length, 0);
  const ambiguous = { ...original, participants: original.participants.map((row) => row.participantId === 7 ? { ...row, position: "TOP" as const } : row) };
  assert.equal(matchGrowthSeries(ambiguous, "totalGold")[2].opponent, null);
});
