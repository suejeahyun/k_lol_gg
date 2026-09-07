import {
  buildSingleEliminationBracket,
  compareCanonicalIdentifiers,
  recalculateStandings,
  type CompetitionStanding,
  type SingleEliminationBracket,
  type StandingsFixture,
} from "../core";
import { requireCompetition } from "../core/error";
import type { DestructionConfiguration } from "./configuration";

export type DestructionPreliminaryProjection = Readonly<{
  standings: readonly CompetitionStanding[];
  groupStandings: Readonly<Record<string, readonly CompetitionStanding[]>>;
  qualifiedTeamIds: readonly string[];
  tournamentBracket: SingleEliminationBracket;
}>;

function requireCompletePreliminary(fixtures: readonly StandingsFixture[]) {
  requireCompetition(fixtures.length > 0, "PRECONDITION_FAILED", "Preliminary fixtures have not been generated.");
  requireCompetition(
    fixtures.every((fixture) => fixture.status === "COMPLETED" && fixture.confirmed),
    "PRECONDITION_FAILED",
    "Every preliminary fixture must be completed and confirmed before qualification.",
  );
}

export function rebuildDestructionPreliminaryProjection(input: Readonly<{
  competitionId: string;
  configuration: DestructionConfiguration;
  teamIds: readonly string[];
  fixtures: readonly StandingsFixture[];
}>): DestructionPreliminaryProjection {
  requireCompetition(input.teamIds.length === input.configuration.teamCount, "PRECONDITION_FAILED", "The complete confirmed team set is required.");
  requireCompletePreliminary(input.fixtures);
  requireCompetition(
    input.fixtures.every((fixture) => fixture.bestOf === input.configuration.preliminaryBestOf),
    "INVALID_FIXTURE",
    "Every preliminary fixture must use the configured best-of value.",
  );
  const groupStandings: Record<string, readonly CompetitionStanding[]> = {};
  let standings: readonly CompetitionStanding[];
  let qualifiedTeamIds: readonly string[];

  if (input.configuration.preliminaryMode === "GROUP_ROUND_ROBIN") {
    const groups = [...new Set(input.fixtures.map((fixture) => fixture.groupKey).filter((key): key is string => key !== null))]
      .sort(compareCanonicalIdentifiers);
    requireCompetition(groups.length === 2 && input.fixtures.every((fixture) => fixture.groupKey !== null), "PRECONDITION_FAILED", "Group preliminaries require exactly two fully assigned groups.");
    const teamGroup = new Map<string, string>();
    for (const fixture of input.fixtures) {
      for (const teamId of [fixture.teamAId, fixture.teamBId]) {
        const existing = teamGroup.get(teamId);
        requireCompetition(existing === undefined || existing === fixture.groupKey, "INVALID_FIXTURE", "A team cannot cross preliminary groups.");
        teamGroup.set(teamId, fixture.groupKey!);
      }
    }
    requireCompetition(input.teamIds.every((teamId) => teamGroup.has(teamId)), "PRECONDITION_FAILED", "Every team must occur in its group fixture set.");
    for (const group of groups) {
      const groupTeams = input.teamIds.filter((teamId) => teamGroup.get(teamId) === group);
      requireCompetition(groupTeams.length >= 2, "PRECONDITION_FAILED", "Each group needs at least two teams.");
      groupStandings[group] = recalculateStandings({ teamIds: groupTeams, fixtures: input.fixtures, groupKey: group });
    }
    const [groupA, groupB] = groups;
    const firstA = groupStandings[groupA!]![0]!;
    const secondA = groupStandings[groupA!]![1]!;
    const firstB = groupStandings[groupB!]![0]!;
    const secondB = groupStandings[groupB!]![1]!;
    qualifiedTeamIds = Object.freeze([firstA.teamId, firstB.teamId, secondA.teamId, secondB.teamId]);
    standings = Object.freeze(groups.flatMap((group) => groupStandings[group]!));
  } else {
    requireCompetition(input.fixtures.every((fixture) => fixture.groupKey === null), "INVALID_FIXTURE", "Ungrouped preliminaries cannot carry group keys.");
    standings = recalculateStandings({ teamIds: input.teamIds, fixtures: input.fixtures });
    requireCompetition(standings.length >= 4, "PRECONDITION_FAILED", "Four preliminary qualifiers are required.");
    qualifiedTeamIds = Object.freeze(standings.slice(0, 4).map((entry) => entry.teamId));
  }

  const tournamentBracket = buildSingleEliminationBracket({
    competitionId: input.competitionId,
    teams: qualifiedTeamIds.map((id, index) => ({ id, seed: index + 1 })),
    bestOf: input.configuration.tournamentBestOf,
  });
  return Object.freeze({ standings, groupStandings: Object.freeze(groupStandings), qualifiedTeamIds, tournamentBracket });
}
