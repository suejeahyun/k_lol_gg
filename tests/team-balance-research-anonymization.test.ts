import assert from "node:assert/strict";
import test from "node:test";
import { createResearchPlayerIdentity } from "../scripts/balance-research/anonymize";
import { calculateTeamBalanceCandidates, TEAM_BALANCE_POSITIONS, type TeamBalancePlayer } from "../src/modules/team-tools/domain/team-balance";

const legacy = [70, null, 10, 40, 20, null, 20, 50, 30, 5] as const;
const identities = legacy.map((legacy_id, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, legacy_id, status: "ACTIVE",
}));
function roster(): TeamBalancePlayer[] {
  return identities.map((row, index) => ({
    playerId: row.id, eligiblePositions: [{ position: TEAM_BALANCE_POSITIONS[index % 5], preference: "MAIN" }],
    rating: { overall: 50, confidence: 0, sampleSize: 0, positions: null,
      v1: { legacyPlayerId: row.legacy_id, currentTier: "GOLD II", peakTier: "GOLD II", season: null,
        internalGames: 0, internalPositionGames: {}, recentSolo: null, balanceOverrideScore: 0,
        mmr: { overall: 50, confidence: 0, positions: {} }, missingSources: [] } },
  }));
}

test("research aliases preserve UUID signature ties separately from nullable legacy ordering", () => {
  const original = roster();
  const identity = createResearchPlayerIdentity([...identities].reverse());
  const reverse = new Map([...identity.anonymous].map(([id, alias]) => [alias, id]));
  const remap = (aliases: Map<string, string>) => original.map(player => ({ ...player,
    playerId: aliases.get(player.playerId)!,
    rating: { ...player.rating!, v1: { ...player.rating!.v1!, legacyPlayerId: identity.activeLegacyOrdinal.get(player.playerId)! } },
  }));
  const originalResult = calculateTeamBalanceCandidates(original);
  const anonymousResult = calculateTeamBalanceCandidates(remap(identity.anonymous));
  assert.equal(originalResult.search.feasibleLayoutCount, 16);
  assert.equal(anonymousResult.search.feasibleLayoutCount, 16);
  assert.deepEqual(anonymousResult.candidates[0].assignments.map(assignment => ({ ...assignment, playerId: reverse.get(assignment.playerId)! })), originalResult.candidates[0].assignments);
  assert.deepEqual(anonymousResult.candidates[0].score, originalResult.candidates[0].score);
  assert.deepEqual(identity.invariant, { uuidCanonicalOrderPreserved: true, legacyOrderPreserved: true, aliasWidth: 4 });
  assert.deepEqual([...identity.activeLegacyOrdinal.keys()], [identities[9], identities[2], identities[4], identities[6], identities[8], identities[3], identities[7], identities[0], identities[1], identities[5]].map(row => row.id));

  // Sensitivity check: the previous mapping ranked aliases by legacy order,
  // preserving the RED anchor but changing which equal-cost UUID signature wins.
  const wrongAliases = new Map([...identity.activeLegacyOrdinal].map(([id, ordinal]) => [id, `P${String(ordinal).padStart(4, "0")}`]));
  const wrongReverse = new Map([...wrongAliases].map(([id, alias]) => [alias, id]));
  const wrong = calculateTeamBalanceCandidates(remap(wrongAliases));
  assert.notDeepEqual(wrong.candidates[0].assignments.map(assignment => ({ ...assignment, playerId: wrongReverse.get(assignment.playerId)! })), originalResult.candidates[0].assignments);
  assert.deepEqual(original, roster(), "anonymization never changes the source players");
});

test("research identity order handles bigint strings and more than four alias digits", () => {
  const many = Array.from({ length: 10_001 }, (_, index) => ({ id: `synthetic-${String(index).padStart(6, "0")}`, legacy_id: null, status: "INACTIVE" }));
  const identity = createResearchPlayerIdentity(many);
  assert.equal(identity.invariant.aliasWidth, 5);
  assert.ok(identity.anonymous.get(many[9_998].id)! < identity.anonymous.get(many[9_999].id)!);
  assert.equal(identity.activeLegacyOrdinal.size, 0);
  const strings = createResearchPlayerIdentity([{ id: "b", legacy_id: "10", status: "ACTIVE" }, { id: "a", legacy_id: "2", status: "ACTIVE" }]);
  assert.deepEqual([...strings.activeLegacyOrdinal.keys()], ["a", "b"]);
  assert.throws(() => createResearchPlayerIdentity([{ id: "private-value", legacy_id: "bad", status: "ACTIVE" }]), { message: "INVALID_RESEARCH_LEGACY_ORDER" });
});
