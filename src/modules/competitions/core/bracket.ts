import { validateBestOf, validateBestOfResult, type BestOfResult } from "./best-of";
import { canonicalIdentifier, compareCanonicalIdentifiers, requireCompetition } from "./error";

export type CompetitionTeamSeedInput = Readonly<{
  id: string;
  seed?: number;
  score?: number;
}>;

export type SeededCompetitionTeam = Readonly<{
  id: string;
  seed: number;
  score: number;
}>;

export type BracketFixtureSource =
  | Readonly<{ kind: "TEAM"; teamId: string; seed: number }>
  | Readonly<{ kind: "WINNER"; sourceFixtureId: string }>
  | Readonly<{ kind: "BYE" }>;

export type BracketFixture = Readonly<{
  id: string;
  roundNumber: number;
  roundSize: number;
  slotNumber: number;
  stage: "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL";
  bestOf: number;
  sourceA: BracketFixtureSource;
  sourceB: BracketFixtureSource;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  resolution: "PENDING" | "BYE" | "RESULT";
  result: BestOfResult | null;
}>;

export type SingleEliminationBracket = Readonly<{
  competitionId: string;
  bracketSize: number;
  teams: readonly SeededCompetitionTeam[];
  fixtures: readonly BracketFixture[];
  championTeamId: string | null;
}>;

export type BuildSingleEliminationInput = Readonly<{
  competitionId: string;
  teams: readonly CompetitionTeamSeedInput[];
  bestOf: number | readonly number[];
}>;

function validScore(score: number | undefined) {
  return score === undefined || (Number.isFinite(score) && Number.isSafeInteger(score));
}

export function seedCompetitionTeams(
  teams: readonly CompetitionTeamSeedInput[],
): readonly SeededCompetitionTeam[] {
  requireCompetition(teams.length >= 2 && teams.length <= 32, "INVALID_BRACKET", "A bracket needs between 2 and 32 teams.");
  const ids = new Set<string>();
  for (const team of teams) {
    canonicalIdentifier(team.id, "teamId");
    requireCompetition(!ids.has(team.id), "DUPLICATE_ID", "Each bracket team must be unique.");
    requireCompetition(validScore(team.score), "INVALID_BRACKET", "Team scores must be safe integers.");
    ids.add(team.id);
  }

  const suppliedSeedCount = teams.filter((team) => team.seed !== undefined).length;
  requireCompetition(
    suppliedSeedCount === 0 || suppliedSeedCount === teams.length,
    "INVALID_BRACKET",
    "Seeds must be supplied for every team or for none of them.",
  );

  if (suppliedSeedCount === teams.length) {
    const seeds = teams.map((team) => team.seed!);
    requireCompetition(
      seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 1 && seed <= teams.length) &&
        new Set(seeds).size === teams.length,
      "INVALID_BRACKET",
      "Explicit seeds must be unique and contiguous from 1 through the team count.",
    );
    return Object.freeze(
      teams
        .map((team) => Object.freeze({ id: team.id, seed: team.seed!, score: team.score ?? 0 }))
        .sort((left, right) => left.seed - right.seed),
    );
  }

  return Object.freeze(
    [...teams]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || compareCanonicalIdentifiers(left.id, right.id))
      .map((team, index) => Object.freeze({ id: team.id, seed: index + 1, score: team.score ?? 0 })),
  );
}

function nextPowerOfTwo(value: number) {
  let result = 2;
  while (result < value) result *= 2;
  return result;
}

function seededPlacement(size: number) {
  let placement = [1, 2];
  for (let bracketSize = 4; bracketSize <= size; bracketSize *= 2) {
    placement = placement.flatMap((seed) => [seed, bracketSize + 1 - seed]);
  }
  return placement;
}

function stageForRoundSize(roundSize: number): BracketFixture["stage"] {
  if (roundSize === 2) return "FINAL";
  if (roundSize === 4) return "SEMI_FINAL";
  if (roundSize === 8) return "QUARTER_FINAL";
  if (roundSize === 16) return "ROUND_OF_16";
  return "ROUND_OF_32";
}

function bestOfForRound(bestOf: number | readonly number[], roundNumber: number, roundCount: number) {
  if (typeof bestOf === "number") return validateBestOf(bestOf);
  requireCompetition(bestOf.length === roundCount, "INVALID_BRACKET", "bestOf must specify every bracket round.");
  return validateBestOf(bestOf[roundNumber - 1]!);
}

type MutableFixture = {
  -readonly [Key in keyof BracketFixture]: BracketFixture[Key];
};

function resolvedSource(
  source: BracketFixtureSource,
  fixtureById: ReadonlyMap<string, MutableFixture>,
): Readonly<{ known: boolean; teamId: string | null }> {
  if (source.kind === "TEAM") return { known: true, teamId: source.teamId };
  if (source.kind === "BYE") return { known: true, teamId: null };
  const sourceFixture = fixtureById.get(source.sourceFixtureId);
  requireCompetition(sourceFixture, "INVALID_BRACKET", "A bracket source fixture does not exist.");
  return sourceFixture.winnerTeamId
    ? { known: true, teamId: sourceFixture.winnerTeamId }
    : { known: false, teamId: null };
}

function settleFixtures(fixtures: readonly BracketFixture[]) {
  const mutable = fixtures.map((fixture) => ({ ...fixture })) as MutableFixture[];
  const fixtureById = new Map(mutable.map((fixture) => [fixture.id, fixture]));

  for (const fixture of mutable) {
    const sideA = resolvedSource(fixture.sourceA, fixtureById);
    const sideB = resolvedSource(fixture.sourceB, fixtureById);
    fixture.teamAId = sideA.teamId;
    fixture.teamBId = sideB.teamId;

    if (sideA.known && sideB.known) {
      requireCompetition(sideA.teamId !== null || sideB.teamId !== null, "INVALID_BRACKET", "A fixture cannot contain two byes.");
      if ((sideA.teamId === null) !== (sideB.teamId === null)) {
        const byeWinner = sideA.teamId ?? sideB.teamId;
        requireCompetition(
          fixture.winnerTeamId === null || fixture.winnerTeamId === byeWinner,
          "INVALID_BRACKET",
          "A bye winner contradicts its source.",
        );
        fixture.winnerTeamId = byeWinner;
        fixture.resolution = "BYE";
        fixture.result = null;
      }
    }

    if (fixture.resolution === "RESULT") {
      requireCompetition(sideA.known && sideB.known && sideA.teamId && sideB.teamId && fixture.result, "INVALID_BRACKET", "A result needs two resolved teams.");
      const result = validateBestOfResult(fixture.result);
      requireCompetition(
        result.teamAId === sideA.teamId &&
          result.teamBId === sideB.teamId &&
          result.winnerTeamId === fixture.winnerTeamId &&
          fixture.result.requiredWins === result.requiredWins,
        "INVALID_BRACKET",
        "A stored result contradicts its bracket sources.",
      );
    }
  }
  return mutable;
}

function freezeBracket(
  competitionId: string,
  bracketSize: number,
  teams: readonly SeededCompetitionTeam[],
  fixtures: readonly BracketFixture[],
): SingleEliminationBracket {
  const settled = settleFixtures(fixtures).map((fixture) => Object.freeze(fixture));
  return Object.freeze({
    competitionId,
    bracketSize,
    teams,
    fixtures: Object.freeze(settled),
    championTeamId: settled.at(-1)?.winnerTeamId ?? null,
  });
}

export function buildSingleEliminationBracket(
  input: BuildSingleEliminationInput,
): SingleEliminationBracket {
  const competitionId = canonicalIdentifier(input.competitionId, "competitionId");
  const teams = seedCompetitionTeams(input.teams);
  const bracketSize = nextPowerOfTwo(teams.length);
  const roundCount = Math.log2(bracketSize);
  const teamBySeed = new Map(teams.map((team) => [team.seed, team]));
  const placement = seededPlacement(bracketSize);
  const fixtures: BracketFixture[] = [];

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    const roundSize = bracketSize / 2 ** (roundNumber - 1);
    const fixtureCount = roundSize / 2;
    for (let slotNumber = 1; slotNumber <= fixtureCount; slotNumber += 1) {
      const id = `${competitionId}:SE:R${roundNumber}:M${slotNumber}`;
      let sourceA: BracketFixtureSource;
      let sourceB: BracketFixtureSource;
      if (roundNumber === 1) {
        const seedA = placement[(slotNumber - 1) * 2]!;
        const seedB = placement[(slotNumber - 1) * 2 + 1]!;
        const teamA = teamBySeed.get(seedA);
        const teamB = teamBySeed.get(seedB);
        sourceA = teamA ? { kind: "TEAM", teamId: teamA.id, seed: teamA.seed } : { kind: "BYE" };
        sourceB = teamB ? { kind: "TEAM", teamId: teamB.id, seed: teamB.seed } : { kind: "BYE" };
      } else {
        sourceA = { kind: "WINNER", sourceFixtureId: `${competitionId}:SE:R${roundNumber - 1}:M${slotNumber * 2 - 1}` };
        sourceB = { kind: "WINNER", sourceFixtureId: `${competitionId}:SE:R${roundNumber - 1}:M${slotNumber * 2}` };
      }
      fixtures.push({
        id,
        roundNumber,
        roundSize,
        slotNumber,
        stage: stageForRoundSize(roundSize),
        bestOf: bestOfForRound(input.bestOf, roundNumber, roundCount),
        sourceA,
        sourceB,
        teamAId: sourceA.kind === "TEAM" ? sourceA.teamId : null,
        teamBId: sourceB.kind === "TEAM" ? sourceB.teamId : null,
        winnerTeamId: null,
        resolution: "PENDING",
        result: null,
      });
    }
  }

  return freezeBracket(competitionId, bracketSize, teams, fixtures);
}

export type AdvanceBracketInput = Readonly<{
  fixtureId: string;
  teamAScore: number;
  teamBScore: number;
  winnerTeamId: string;
}>;

export type AdvanceBracketResult = Readonly<{
  bracket: SingleEliminationBracket;
  replayed: boolean;
}>;

export function advanceSingleEliminationBracket(
  bracket: SingleEliminationBracket,
  input: AdvanceBracketInput,
): AdvanceBracketResult {
  canonicalIdentifier(input.fixtureId, "fixtureId");
  const settled = settleFixtures(bracket.fixtures);
  const fixture = settled.find((entry) => entry.id === input.fixtureId);
  requireCompetition(fixture, "INVALID_FIXTURE", "The bracket fixture does not exist.");
  requireCompetition(fixture.teamAId && fixture.teamBId, "INVALID_FIXTURE", "Both fixture sources must resolve before a result is recorded.");
  const result = validateBestOfResult({
    bestOf: fixture.bestOf,
    teamAId: fixture.teamAId,
    teamBId: fixture.teamBId,
    teamAScore: input.teamAScore,
    teamBScore: input.teamBScore,
    winnerTeamId: input.winnerTeamId,
  });

  if (fixture.result) {
    const replayed = fixture.result.teamAScore === result.teamAScore &&
      fixture.result.teamBScore === result.teamBScore &&
      fixture.result.winnerTeamId === result.winnerTeamId;
    requireCompetition(replayed, "INVALID_FIXTURE", "A completed fixture cannot be overwritten by bracket advancement.");
    return {
      bracket: freezeBracket(bracket.competitionId, bracket.bracketSize, bracket.teams, settled),
      replayed: true,
    };
  }
  requireCompetition(fixture.resolution === "PENDING", "INVALID_FIXTURE", "A bye fixture cannot accept a played result.");
  fixture.result = result;
  fixture.winnerTeamId = result.winnerTeamId;
  fixture.resolution = "RESULT";

  return {
    bracket: freezeBracket(bracket.competitionId, bracket.bracketSize, bracket.teams, settled),
    replayed: false,
  };
}
