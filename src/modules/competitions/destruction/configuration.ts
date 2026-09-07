import {
  COMPETITION_POSITIONS,
  validateBestOf,
  type CompetitionPosition,
} from "../core";
import { requireCompetition } from "../core/error";

export const DESTRUCTION_PRELIMINARY_FORMATS = [
  "FULL_ROUND_ROBIN_BO3",
  "FULL_ROUND_ROBIN_BO1",
  "GROUP_ROUND_ROBIN_BO3",
  "GROUP_ROUND_ROBIN_BO1",
  "SWISS_ROUND_BO3",
  "SWISS_ROUND_BO1",
  "RANDOM_ROUNDS_BO3",
  "RANDOM_ROUNDS_BO1",
] as const;

export type DestructionPreliminaryFormat = (typeof DESTRUCTION_PRELIMINARY_FORMATS)[number];
export type DestructionPreliminaryMode = "FULL_ROUND_ROBIN" | "GROUP_ROUND_ROBIN" | "SWISS_ROUND" | "RANDOM_ROUNDS";
export type DestructionLaneLimits = Readonly<Record<CompetitionPosition, number>>;

export type DestructionConfiguration = Readonly<{
  preliminaryFormat: DestructionPreliminaryFormat;
  preliminaryMode: DestructionPreliminaryMode;
  preliminaryBestOf: 1 | 3;
  preliminaryRoundCount: number;
  tournamentBestOf: 3;
  teamCount: number;
  rosterSize: 5;
  advanceTeamCount: 4;
  laneLimits: DestructionLaneLimits;
}>;

const MODE_BY_PREFIX = {
  FULL_ROUND_ROBIN: "FULL_ROUND_ROBIN",
  GROUP_ROUND_ROBIN: "GROUP_ROUND_ROBIN",
  SWISS_ROUND: "SWISS_ROUND",
  RANDOM_ROUNDS: "RANDOM_ROUNDS",
} as const;

function parseFormat(format: string) {
  requireCompetition(
    DESTRUCTION_PRELIMINARY_FORMATS.includes(format as DestructionPreliminaryFormat),
    "PRECONDITION_FAILED",
    "The preliminary format must be one of the eight supported formats.",
  );
  const [prefix] = Object.keys(MODE_BY_PREFIX).filter((candidate) => format.startsWith(candidate));
  requireCompetition(prefix, "PRECONDITION_FAILED", "The preliminary format mode is invalid.");
  const bestOf = format.endsWith("BO3") ? 3 : 1;
  validateBestOf(bestOf);
  return { mode: MODE_BY_PREFIX[prefix as keyof typeof MODE_BY_PREFIX], bestOf } as const;
}
export function validateDestructionConfiguration(input: Readonly<{
  preliminaryFormat: string;
  preliminaryRoundCount?: number;
  teamCount: number;
  laneLimits: Readonly<Record<CompetitionPosition, number>>;
}>): DestructionConfiguration {
  const parsed = parseFormat(input.preliminaryFormat);
  requireCompetition(
    Number.isSafeInteger(input.teamCount) && input.teamCount >= 4 && input.teamCount <= 99,
    "PRECONDITION_FAILED",
    "A destruction competition needs between four and 99 teams.",
  );
  const usesRoundCount = parsed.mode === "SWISS_ROUND" || parsed.mode === "RANDOM_ROUNDS";
  const preliminaryRoundCount = usesRoundCount ? input.preliminaryRoundCount : 1;
  requireCompetition(
    Number.isSafeInteger(preliminaryRoundCount) && preliminaryRoundCount! >= 1 && preliminaryRoundCount! <= 10,
    "PRECONDITION_FAILED",
    "Swiss and random formats need between one and ten rounds.",
  );

  const laneLimits = Object.fromEntries(COMPETITION_POSITIONS.map((position) => {
    const limit = input.laneLimits[position];
    requireCompetition(
      Number.isSafeInteger(limit) && limit >= input.teamCount && limit <= 99,
      "PRECONDITION_FAILED",
      `The ${position} applicant limit must be between the team count and 99.`,
    );
    return [position, limit];
  })) as Record<CompetitionPosition, number>;

  return Object.freeze({
    preliminaryFormat: input.preliminaryFormat as DestructionPreliminaryFormat,
    preliminaryMode: parsed.mode,
    preliminaryBestOf: parsed.bestOf,
    preliminaryRoundCount: preliminaryRoundCount!,
    tournamentBestOf: 3,
    teamCount: input.teamCount,
    rosterSize: 5,
    advanceTeamCount: 4,
    laneLimits: Object.freeze(laneLimits),
  });
}
