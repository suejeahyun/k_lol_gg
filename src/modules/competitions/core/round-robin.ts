import { seedCompetitionTeams, type CompetitionTeamSeedInput } from "./bracket";
import { validateBestOf } from "./best-of";
import { canonicalIdentifier, compareCanonicalIdentifiers, requireCompetition } from "./error";

export type RoundRobinFixture = Readonly<{
  id: string;
  groupKey: string | null;
  roundNumber: number;
  slotNumber: number;
  teamAId: string;
  teamBId: string;
  bestOf: number;
}>;

export type RoundRobinGroup = Readonly<{
  key: string;
  teams: readonly CompetitionTeamSeedInput[];
}>;

function scheduleRoundRobin(
  competitionId: string,
  teams: readonly CompetitionTeamSeedInput[],
  bestOfValue: number,
  groupKey: string | null,
  fixtureNamespace: string,
) {
  const ordered = seedCompetitionTeams(teams).map((team) => team.id);
  const bestOf = validateBestOf(bestOfValue);
  const rotation: Array<string | null> = ordered.length % 2 === 0 ? [...ordered] : [...ordered, null];
  const fixtures: RoundRobinFixture[] = [];

  for (let roundIndex = 0; roundIndex < rotation.length - 1; roundIndex += 1) {
    let slotNumber = 0;
    for (let pairIndex = 0; pairIndex < rotation.length / 2; pairIndex += 1) {
      const left = rotation[pairIndex];
      const right = rotation[rotation.length - 1 - pairIndex];
      if (left === null || right === null) continue;
      slotNumber += 1;
      const swap = (roundIndex + pairIndex) % 2 === 1;
      fixtures.push(Object.freeze({
        id: `${competitionId}:${fixtureNamespace}:R${roundIndex + 1}:M${slotNumber}`,
        groupKey,
        roundNumber: roundIndex + 1,
        slotNumber,
        teamAId: swap ? right : left,
        teamBId: swap ? left : right,
        bestOf,
      }));
    }
    const fixed = rotation[0]!;
    const last = rotation.at(-1)!;
    rotation.splice(0, rotation.length, fixed, last, ...rotation.slice(1, -1));
  }
  return Object.freeze(fixtures);
}

export function buildRoundRobinFixtures(input: Readonly<{
  competitionId: string;
  teams: readonly CompetitionTeamSeedInput[];
  bestOf: number;
}>): readonly RoundRobinFixture[] {
  const competitionId = canonicalIdentifier(input.competitionId, "competitionId");
  return scheduleRoundRobin(competitionId, input.teams, input.bestOf, null, "RR");
}

export function buildGroupRoundRobinFixtures(input: Readonly<{
  competitionId: string;
  groups: readonly RoundRobinGroup[];
  bestOf: number;
}>): readonly RoundRobinFixture[] {
  const competitionId = canonicalIdentifier(input.competitionId, "competitionId");
  requireCompetition(input.groups.length >= 1, "INVALID_FIXTURE", "At least one round-robin group is required.");
  const groupKeys = new Set<string>();
  const teamIds = new Set<string>();
  const groups = [...input.groups].sort((left, right) => compareCanonicalIdentifiers(left.key, right.key));

  for (const group of groups) {
    canonicalIdentifier(group.key, "groupKey");
    requireCompetition(!groupKeys.has(group.key), "DUPLICATE_ID", "Round-robin group keys must be unique.");
    groupKeys.add(group.key);
    for (const team of group.teams) {
      canonicalIdentifier(team.id, "teamId");
      requireCompetition(!teamIds.has(team.id), "DUPLICATE_ID", "A team cannot belong to multiple round-robin groups.");
      teamIds.add(team.id);
    }
  }

  return Object.freeze(groups.flatMap((group, groupIndex) =>
    scheduleRoundRobin(
      competitionId,
      group.teams,
      input.bestOf,
      group.key,
      `GRR:G${groupIndex + 1}`,
    ),
  ));
}
