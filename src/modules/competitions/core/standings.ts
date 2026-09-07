import { validateBestOfResult } from "./best-of";
import { canonicalIdentifier, compareCanonicalIdentifiers, requireCompetition } from "./error";

export type StandingsFixture = Readonly<{
  id: string;
  groupKey: string | null;
  status: "PENDING" | "COMPLETED" | "VOIDED";
  confirmed: boolean;
  bestOf: number;
  teamAId: string;
  teamBId: string;
  teamAScore: number | null;
  teamBScore: number | null;
  winnerTeamId: string | null;
}>;

export type CompetitionStanding = Readonly<{
  rank: number;
  teamId: string;
  played: number;
  points: number;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  setDifference: number;
}>;

export type RecalculateStandingsInput = Readonly<{
  teamIds: readonly string[];
  fixtures: readonly StandingsFixture[];
  groupKey?: string | null;
}>;

type MutableStanding = {
  -readonly [Key in Exclude<keyof CompetitionStanding, "rank">]: CompetitionStanding[Key];
};

export function recalculateStandings(
  input: RecalculateStandingsInput,
): readonly CompetitionStanding[] {
  requireCompetition(input.teamIds.length >= 2, "INVALID_FIXTURE", "Standings need at least two teams.");
  if (input.groupKey !== undefined && input.groupKey !== null) canonicalIdentifier(input.groupKey, "groupKey");
  const table = new Map<string, MutableStanding>();
  for (const teamId of input.teamIds) {
    canonicalIdentifier(teamId, "teamId");
    requireCompetition(!table.has(teamId), "DUPLICATE_ID", "Standings team IDs must be unique.");
    table.set(teamId, {
      teamId,
      played: 0,
      points: 0,
      wins: 0,
      losses: 0,
      setsFor: 0,
      setsAgainst: 0,
      setDifference: 0,
    });
  }

  const fixtureIds = new Set<string>();
  for (const fixture of input.fixtures) {
    canonicalIdentifier(fixture.id, "fixtureId");
    if (fixture.groupKey !== null) canonicalIdentifier(fixture.groupKey, "fixture.groupKey");
    requireCompetition(
      fixture.status === "PENDING" || fixture.status === "COMPLETED" || fixture.status === "VOIDED",
      "INVALID_FIXTURE",
      "Fixture status is invalid.",
    );
    requireCompetition(typeof fixture.confirmed === "boolean", "INVALID_FIXTURE", "Fixture confirmed must be boolean.");
    requireCompetition(!fixtureIds.has(fixture.id), "DUPLICATE_ID", "Fixture IDs must be unique.");
    fixtureIds.add(fixture.id);
  }
  const fixtures = input.fixtures
    .filter((fixture) => input.groupKey === undefined || fixture.groupKey === input.groupKey)
    .sort((left, right) => compareCanonicalIdentifiers(left.id, right.id));

  for (const fixture of fixtures) {
    const teamA = table.get(fixture.teamAId);
    const teamB = table.get(fixture.teamBId);
    requireCompetition(teamA && teamB && teamA !== teamB, "INVALID_FIXTURE", "Every fixture must reference two distinct standing teams.");

    if (fixture.status === "PENDING") {
      requireCompetition(
        fixture.teamAScore === null && fixture.teamBScore === null && fixture.winnerTeamId === null,
        "INVALID_FIXTURE",
        "A pending fixture cannot carry a result.",
      );
      continue;
    }
    if (fixture.status === "VOIDED" || !fixture.confirmed) continue;

    requireCompetition(
      fixture.teamAScore !== null && fixture.teamBScore !== null && fixture.winnerTeamId !== null,
      "INVALID_FIXTURE",
      "A confirmed completed fixture needs a full result.",
    );
    const result = validateBestOfResult({
      bestOf: fixture.bestOf,
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      teamAScore: fixture.teamAScore,
      teamBScore: fixture.teamBScore,
      winnerTeamId: fixture.winnerTeamId,
    });
    const winner = result.winnerTeamId === teamA.teamId ? teamA : teamB;
    const loser = winner === teamA ? teamB : teamA;
    teamA.played += 1;
    teamB.played += 1;
    winner.points += 1;
    winner.wins += 1;
    loser.losses += 1;
    teamA.setsFor += result.teamAScore;
    teamA.setsAgainst += result.teamBScore;
    teamB.setsFor += result.teamBScore;
    teamB.setsAgainst += result.teamAScore;
    teamA.setDifference = teamA.setsFor - teamA.setsAgainst;
    teamB.setDifference = teamB.setsFor - teamB.setsAgainst;
  }

  return Object.freeze(
    [...table.values()]
      .sort((left, right) =>
        right.points - left.points ||
        right.wins - left.wins ||
        left.losses - right.losses ||
        compareCanonicalIdentifiers(left.teamId, right.teamId),
      )
      .map((standing, index) => Object.freeze({ rank: index + 1, ...standing })),
  );
}
