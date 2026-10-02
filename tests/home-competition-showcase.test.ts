import assert from "node:assert/strict";
import test from "node:test";
import { selectHomeCompetitions, type HomeCompetition } from "../src/modules/home/domain/home-snapshot";

function competition(id: string, title: string, status = "RECRUITING", occurredAt = "2026-10-03T00:00:00Z"): HomeCompetition {
  return { id, title, status, occurredAt, kind: "EVENT", participantCount: 10 };
}

test("home prioritizes ongoing competitions before newer completed records without mutating input", () => {
  const current = competition("current", "가을 내전", "TEAM_BUILDING", "2026-10-01T00:00:00Z");
  const complete = competition("complete", "지난 대회", "COMPLETED");
  const rows = Object.freeze([complete, current]);
  assert.deepEqual(selectHomeCompetitions([rows], 1), [current]);
  assert.deepEqual(selectHomeCompetitions([rows], 2), [current, complete]);
  assert.equal(rows[0], complete);
});

test("home omits only placeholder-only titles, retaining meaningful titles containing test", () => {
  const rows = ["test", " TEST ", "test-12", "테스트 2", "임시", " ", "Test Drive Cup", "테스트 팀 vs 협곡 팀"].map((title, i) => competition(String(i), title));
  assert.deepEqual(selectHomeCompetitions([rows], 10).map((row) => row.title), ["Test Drive Cup", "테스트 팀 vs 협곡 팀"]);
  assert.deepEqual(selectHomeCompetitions([rows], 0), []);
  assert.throws(() => selectHomeCompetitions([rows], -1), /HOME_FEED_LIMIT_INVALID/);
});
