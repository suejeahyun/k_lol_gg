import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseTeamBalanceOverride } from "../src/modules/team-tools/domain/team-balance-override";

test("team-only overrides retain the existing -1000..1000 integer contract without touching MMR inputs", () => {
  const playerId = randomUUID();
  for (const score of [-1000, 0, 1000]) assert.deepEqual(parseTeamBalanceOverride({ playerId, score, reason: " 검토한 편성 보정 " }), { playerId, score, reason: "검토한 편성 보정" });
  for (const score of [-1001, 1001, 0.5, NaN, "10"]) assert.throws(() => parseTeamBalanceOverride({ playerId, score, reason: "검토한 편성 보정" }));
  for (const value of [{ playerId, score: 1, reason: "짧음" }, { playerId, score: 1, reason: "line\nbreak" }, { playerId, score: 1, reason: "검토 사유", deltaBp: 100 }, { playerId: "not-an-id", score: 1, reason: "검토 사유" }]) assert.throws(() => parseTeamBalanceOverride(value));
});
