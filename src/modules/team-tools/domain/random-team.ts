import { fisherYatesShuffle, type Uint32Source } from "./random-source";

export const RANDOM_TEAM_PARTICIPANT_COUNT = 10;
export const RANDOM_TEAM_SIZE = 5;

export const SIMPLE_TIER_SCORES = Object.freeze({
  IRON: 1,
  BRONZE: 2,
  SILVER: 3,
  GOLD: 4,
  PLATINUM: 5,
  EMERALD: 6,
  DIAMOND: 7,
  MASTER: 8,
  GRANDMASTER: 9,
  CHALLENGER: 10,
} as const);

export type SimpleTier = keyof typeof SIMPLE_TIER_SCORES;
export type SimpleTierScore = (typeof SIMPLE_TIER_SCORES)[SimpleTier];

export type RandomTeamParticipant = Readonly<{
  slot: number;
  name: string;
}>;

export type ParsedRandomTeamInput = Readonly<{
  participants: readonly RandomTeamParticipant[];
  duplicateNames: readonly string[];
}>;

export type RandomTeamInputResult =
  | Readonly<{ ok: true; value: ParsedRandomTeamInput }>
  | Readonly<{
      ok: false;
      code: "PARTICIPANT_COUNT";
      expected: typeof RANDOM_TEAM_PARTICIPANT_COUNT;
      actual: number;
      participants: readonly RandomTeamParticipant[];
    }>;

export type RandomTeamResult = Readonly<{
  teamOne: readonly RandomTeamParticipant[];
  teamTwo: readonly RandomTeamParticipant[];
}>;

export type TierBalanceParticipant = RandomTeamParticipant &
  Readonly<{
    tier: SimpleTier;
    tierScore: SimpleTierScore;
  }>;

export type TierBalanceResult = Readonly<{
  teamOne: readonly TierBalanceParticipant[];
  teamTwo: readonly TierBalanceParticipant[];
  teamOneScore: number;
  teamTwoScore: number;
  difference: number;
  equallyOptimalLayoutCount: number;
}>;

export class RandomTeamDomainError extends Error {
  constructor(
    readonly code:
      | "PARTICIPANT_COUNT"
      | "INVALID_PARTICIPANT"
      | "DUPLICATE_SLOT"
      | "INVALID_TIER_SCORE",
  ) {
    super(code);
    this.name = "RandomTeamDomainError";
  }
}

function stripListMarker(value: string) {
  return value
    .replace(/^\uFEFF/u, "")
    .trim()
    .replace(/^\s*(?:\d{1,3}\s*[.)、:\-]|[①②③④⑤⑥⑦⑧⑨⑩]\s*[.)、:\-]?)\s*/u, "")
    .replace(/^\s*[-•*]\s*/u, "")
    .trim();
}

function duplicateKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
}

export function parseRandomTeamInput(rawText: string): RandomTeamInputResult {
  const participants = rawText
    .split(/\r?\n/gu)
    .map(stripListMarker)
    .filter(Boolean)
    .map((name, slot) => Object.freeze({ slot, name }));

  if (participants.length !== RANDOM_TEAM_PARTICIPANT_COUNT) {
    return {
      ok: false,
      code: "PARTICIPANT_COUNT",
      expected: RANDOM_TEAM_PARTICIPANT_COUNT,
      actual: participants.length,
      participants,
    };
  }

  const firstNameByKey = new Map<string, string>();
  const duplicateKeys = new Set<string>();

  for (const participant of participants) {
    const key = duplicateKey(participant.name);
    if (firstNameByKey.has(key)) duplicateKeys.add(key);
    else firstNameByKey.set(key, participant.name);
  }

  return {
    ok: true,
    value: {
      participants,
      duplicateNames: [...duplicateKeys].map((key) => firstNameByKey.get(key)!),
    },
  };
}

function validateParticipants(participants: readonly RandomTeamParticipant[]) {
  if (participants.length !== RANDOM_TEAM_PARTICIPANT_COUNT) {
    throw new RandomTeamDomainError("PARTICIPANT_COUNT");
  }

  if (
    participants.some(
      (participant) =>
        !Number.isSafeInteger(participant.slot) || participant.slot < 0 || !participant.name.trim(),
    )
  ) {
    throw new RandomTeamDomainError("INVALID_PARTICIPANT");
  }

  if (new Set(participants.map((participant) => participant.slot)).size !== participants.length) {
    throw new RandomTeamDomainError("DUPLICATE_SLOT");
  }
}

export function createRandomTeams(
  participants: readonly RandomTeamParticipant[],
  source: Uint32Source,
): RandomTeamResult {
  validateParticipants(participants);
  const shuffled = fisherYatesShuffle(participants, source);

  return {
    teamOne: shuffled.slice(0, RANDOM_TEAM_SIZE),
    teamTwo: shuffled.slice(RANDOM_TEAM_SIZE),
  };
}

export function tierScore(tier: SimpleTier): SimpleTierScore {
  return SIMPLE_TIER_SCORES[tier];
}

function validateTierParticipants(participants: readonly TierBalanceParticipant[]) {
  validateParticipants(participants);

  if (
    participants.some(
      (participant) =>
        SIMPLE_TIER_SCORES[participant.tier] !== participant.tierScore ||
        !Number.isInteger(participant.tierScore) ||
        participant.tierScore < 1 ||
        participant.tierScore > 10,
    )
  ) {
    throw new RandomTeamDomainError("INVALID_TIER_SCORE");
  }
}

function combinationsIncludingAnchor(length: number, teamSize: number) {
  const combinations: number[][] = [];

  function visit(nextIndex: number, selected: number[]) {
    if (selected.length === teamSize) {
      combinations.push([...selected]);
      return;
    }

    const remaining = teamSize - selected.length;
    for (let index = nextIndex; index <= length - remaining; index += 1) {
      selected.push(index);
      visit(index + 1, selected);
      selected.pop();
    }
  }

  visit(1, [0]);
  return combinations;
}

/**
 * Finds the minimum tier-score difference. Complementary team-label swaps are
 * deduplicated by anchoring the lowest slot in team one. Equal minima use the
 * lexicographically first slot layout, making the result replayable.
 */
export function createTierBalancedTeams(
  participants: readonly TierBalanceParticipant[],
): TierBalanceResult {
  validateTierParticipants(participants);
  const ordered = [...participants].sort((left, right) => left.slot - right.slot);
  const totalScore = ordered.reduce((sum, participant) => sum + participant.tierScore, 0);
  let bestIndexes: readonly number[] | null = null;
  let bestDifference = Number.POSITIVE_INFINITY;
  let equallyOptimalLayoutCount = 0;

  for (const indexes of combinationsIncludingAnchor(ordered.length, RANDOM_TEAM_SIZE)) {
    const teamOneScore = indexes.reduce((sum, index) => sum + ordered[index]!.tierScore, 0);
    const difference = Math.abs(teamOneScore - (totalScore - teamOneScore));

    if (difference < bestDifference) {
      bestDifference = difference;
      bestIndexes = indexes;
      equallyOptimalLayoutCount = 1;
    } else if (difference === bestDifference) {
      equallyOptimalLayoutCount += 1;
    }
  }

  if (!bestIndexes) throw new RandomTeamDomainError("PARTICIPANT_COUNT");

  const teamOneIndexes = new Set(bestIndexes);
  const teamOne = ordered.filter((_, index) => teamOneIndexes.has(index));
  const teamTwo = ordered.filter((_, index) => !teamOneIndexes.has(index));
  const teamOneScore = teamOne.reduce((sum, participant) => sum + participant.tierScore, 0);
  const teamTwoScore = totalScore - teamOneScore;

  return {
    teamOne,
    teamTwo,
    teamOneScore,
    teamTwoScore,
    difference: Math.abs(teamOneScore - teamTwoScore),
    equallyOptimalLayoutCount,
  };
}
