import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionPlayerLabel,
  competitionTeamLabel,
} from "../src/modules/competitions/core";

test("competition display projections prefer human labels and never fall back to raw identifiers", () => {
  const playerId = "11111111-1111-4111-8111-111111111111";
  const teamId = "22222222-2222-4222-8222-222222222222";
  assert.equal(competitionPlayerLabel(new Map([[playerId, "하늘여우#KR1"]]), playerId), "하늘여우#KR1");
  assert.equal(competitionPlayerLabel(new Map(), playerId), "알 수 없는 선수");
  assert.equal(competitionTeamLabel([{ id: teamId, name: "별빛 팀" }], teamId), "별빛 팀");
  assert.equal(competitionTeamLabel([], teamId), "알 수 없는 팀");
  assert.equal(competitionTeamLabel([], null), "미정");
});
