import assert from "node:assert/strict";
import test from "node:test";

import {
  beginCoinToss,
  CoinTossTransitionError,
  createRandomTeams,
  createSeededUint32Source,
  createTierBalancedTeams,
  fisherYatesShuffle,
  INITIAL_COIN_TOSS_STATE,
  parseRandomTeamInput,
  RandomTeamDomainError,
  revealCoinToss,
  tierScore,
  transitionCoinToss,
  uniformRandomIndex,
  type RandomTeamParticipant,
  type SimpleTier,
  type TierBalanceParticipant,
} from "../src/modules/team-tools";

const names = Array.from({ length: 10 }, (_, index) => `참가자 ${index + 1}`);

function participants(): RandomTeamParticipant[] {
  return names.map((name, slot) => ({ slot, name }));
}

function tierParticipants(scores: readonly number[]): TierBalanceParticipant[] {
  const tiers = [
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
  ] as const satisfies readonly SimpleTier[];

  return scores.map((score, slot) => ({
    slot,
    name: names[slot]!,
    tier: tiers[score - 1]!,
    tierScore: score as TierBalanceParticipant["tierScore"],
  }));
}

test("random-team parser accepts common numbered and bullet list forms", () => {
  const markers = ["1.", "2)", "3、", "4:", "5-", "⑥", "⑦.", "-", "•", "*"];
  const parsed = parseRandomTeamInput(
    names.map((name, index) => `${markers[index]} ${name}`).join("\r\n"),
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.participants.map((item) => item.name), names);
  assert.deepEqual(parsed.value.participants.map((item) => item.slot), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("random-team parser reports exact participant counts", () => {
  const tooFew = parseRandomTeamInput(names.slice(0, 9).join("\n"));
  const tooMany = parseRandomTeamInput([...names, "한 명 더"].join("\n"));

  assert.deepEqual(tooFew.ok ? null : [tooFew.code, tooFew.expected, tooFew.actual], [
    "PARTICIPANT_COUNT",
    10,
    9,
  ]);
  assert.deepEqual(tooMany.ok ? null : [tooMany.code, tooMany.expected, tooMany.actual], [
    "PARTICIPANT_COUNT",
    10,
    11,
  ]);
});

test("duplicate display names remain distinct slots and are disclosed", () => {
  const parsed = parseRandomTeamInput(["구름", "구름", ...names.slice(2)].join("\n"));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.duplicateNames, ["구름"]);

  const result = createRandomTeams(parsed.value.participants, createSeededUint32Source("duplicates"));
  assert.equal([...result.teamOne, ...result.teamTwo].filter((item) => item.name === "구름").length, 2);
  assert.equal(new Set([...result.teamOne, ...result.teamTwo].map((item) => item.slot)).size, 10);
});

test("seeded Fisher-Yates is replayable, non-mutating, and preserves every slot", () => {
  const input = participants();
  const first = fisherYatesShuffle(input, createSeededUint32Source("하늘-살랑"));
  const second = fisherYatesShuffle(input, createSeededUint32Source("하늘-살랑"));

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, input);
  assert.deepEqual(input, participants());
  assert.deepEqual(first.map((item) => item.slot).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("uniform index rejects the modulo-bias tail", () => {
  const values = [0xffff_ffff, 20];
  let calls = 0;
  const result = uniformRandomIndex(10, () => {
    calls += 1;
    return values.shift()!;
  });

  assert.equal(result, 0);
  assert.equal(calls, 2);
});

test("random teams remain a lossless 5:5 partition across seeds", () => {
  for (let seed = 0; seed < 128; seed += 1) {
    const result = createRandomTeams(participants(), createSeededUint32Source(seed));
    const all = [...result.teamOne, ...result.teamTwo];
    assert.equal(result.teamOne.length, 5);
    assert.equal(result.teamTwo.length, 5);
    assert.deepEqual(all.map((item) => item.slot).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
});

test("simple tier mapping is the V2 1-to-10 contract", () => {
  assert.deepEqual(
    ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"].map(
      (tier) => tierScore(tier as SimpleTier),
    ),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
});

test("tier balance is deterministic and reaches the exhaustive minimum", () => {
  const input = tierParticipants([1, 1, 2, 3, 4, 6, 7, 8, 9, 10]);
  const result = createTierBalancedTeams(input);
  let oracle = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 1 << input.length; mask += 1) {
    if ((mask & 1) === 0) continue;
    const indexes = input.flatMap((_, index) => (mask & (1 << index) ? [index] : []));
    if (indexes.length !== 5) continue;
    const one = indexes.reduce((sum, index) => sum + input[index]!.tierScore, 0);
    const total = input.reduce((sum, item) => sum + item.tierScore, 0);
    oracle = Math.min(oracle, Math.abs(one - (total - one)));
  }

  assert.equal(result.difference, oracle);
  assert.equal(result.teamOne.length, 5);
  assert.equal(result.teamTwo.length, 5);
  assert.equal(result.teamOne[0]?.slot, 0);
  assert.deepEqual(createTierBalancedTeams([...input].reverse()), result);
  assert.ok(result.equallyOptimalLayoutCount >= 1);
});

test("tier balance rejects forged scores and duplicate slots", () => {
  const input = tierParticipants([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const forged = input.map((item, index) => (index === 0 ? { ...item, tierScore: 10 as const } : item));
  assert.throws(
    () => createTierBalancedTeams(forged),
    (error) => error instanceof RandomTeamDomainError && error.code === "INVALID_TIER_SCORE",
  );

  const duplicateSlot = input.map((item, index) => (index === 9 ? { ...item, slot: 0 } : item));
  assert.throws(
    () => createTierBalancedTeams(duplicateSlot),
    (error) => error instanceof RandomTeamDomainError && error.code === "DUPLICATE_SLOT",
  );
});

test("coin toss follows idle-playing-revealed and blocks illegal transitions", () => {
  const playing = beginCoinToss(INITIAL_COIN_TOSS_STATE, () => 0);
  assert.deepEqual(playing, { phase: "playing", round: 1, outcome: "FRONT" });
  assert.throws(
    () => beginCoinToss(playing, () => 1),
    (error) => error instanceof CoinTossTransitionError && error.code === "TOSS_IN_PROGRESS",
  );

  const revealed = revealCoinToss(playing);
  assert.deepEqual(revealed, { phase: "revealed", round: 1, outcome: "FRONT" });
  assert.throws(
    () => revealCoinToss(revealed),
    (error) => error instanceof CoinTossTransitionError && error.code === "NOT_PLAYING",
  );

  assert.deepEqual(transitionCoinToss(revealed, { type: "RESET" }), {
    phase: "idle",
    round: 1,
    outcome: null,
  });
});

test("seeded coin toss reaches both sides and replays each seed", () => {
  const outcomes = new Set<string>();

  for (let seed = 0; seed < 128; seed += 1) {
    const first = beginCoinToss(INITIAL_COIN_TOSS_STATE, createSeededUint32Source(seed));
    const replay = beginCoinToss(INITIAL_COIN_TOSS_STATE, createSeededUint32Source(seed));
    assert.equal(first.outcome, replay.outcome);
    outcomes.add(first.outcome);
  }

  assert.deepEqual(outcomes, new Set(["FRONT", "BACK"]));
});
