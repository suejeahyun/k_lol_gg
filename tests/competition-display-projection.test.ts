import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionPlayerLabel,
  competitionTeamLabel,
  publicCompetitionFormatLabel,
  publicCompetitionStatusLabel,
  publicDestructionStatusLabel,
  publicEventStatusLabel,
  publicPreliminaryFormatLabel,
} from "../src/modules/competitions/core";

test("competition display projections prefer human labels and never fall back to raw identifiers", () => {
  const playerId = "11111111-1111-4111-8111-111111111111";
  const teamId = "22222222-2222-4222-8222-222222222222";
  assert.equal(competitionPlayerLabel(new Map([[playerId, "하늘여우#KR1"]]), playerId), "하늘여우#KR1");
  assert.equal(competitionPlayerLabel(new Map(), playerId), "알 수 없는 선수");
  assert.equal(competitionTeamLabel([{ id: teamId, name: "별빛 팀" }], teamId), "별빛 팀");
  assert.equal(competitionTeamLabel([], teamId), "알 수 없는 팀");
  assert.equal(competitionTeamLabel([], null), "미정");
  assert.equal(publicCompetitionStatusLabel("IN_PROGRESS"), "진행 중");
  assert.equal(publicCompetitionFormatLabel("ARAM"), "칼바람");
  assert.equal(publicPreliminaryFormatLabel("FULL_ROUND_ROBIN_BO1"), "전체 풀리그");
  assert.equal(publicCompetitionStatusLabel("UNREVIEWED"), "상태 확인 필요");
  assert.equal(publicEventStatusLabel("TEAM_BUILDING"), "팀 편성");
  assert.equal(publicDestructionStatusLabel("TEAM_BUILDING"), "주장 선정");
});
