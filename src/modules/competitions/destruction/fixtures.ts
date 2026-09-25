import { buildGroupRoundRobinFixtures, buildRoundRobinFixtures } from "../core/round-robin";
import type { StandingsFixture } from "../core/standings";
import type { DestructionAggregate } from "./state";

function pendingFixture(fixture: Readonly<{ id: string; groupKey: string | null; bestOf: number; teamAId: string; teamBId: string }>): StandingsFixture {
  return Object.freeze({ id: fixture.id, groupKey: fixture.groupKey, status: "PENDING", confirmed: false, bestOf: fixture.bestOf, teamAId: fixture.teamAId, teamBId: fixture.teamBId, teamAScore: null, teamBScore: null, winnerTeamId: null });
}

export function buildPreliminaryFixtures(aggregate: DestructionAggregate) {
  const teams = aggregate.teams.map((team) => ({ id: team.id }));
  const { preliminaryMode: mode, preliminaryBestOf: bestOf } = aggregate.configuration;
  if (mode === "GROUP_ROUND_ROBIN") {
    const midpoint = Math.ceil(teams.length / 2);
    return buildGroupRoundRobinFixtures({ competitionId: aggregate.id, groups: [{ key: "A", teams: teams.slice(0, midpoint) }, { key: "B", teams: teams.slice(midpoint) }], bestOf }).map(pendingFixture);
  }
  const complete = buildRoundRobinFixtures({ competitionId: aggregate.id, teams, bestOf });
  if (mode === "FULL_ROUND_ROBIN") return complete.map(pendingFixture);
  const maxRound = Math.max(...complete.map((fixture) => fixture.roundNumber));
  return Object.freeze(Array.from({ length: aggregate.configuration.preliminaryRoundCount }, (_, roundIndex) => {
    const sourceRound = (roundIndex % maxRound) + 1;
    return complete.filter((fixture) => fixture.roundNumber === sourceRound).map((fixture) => pendingFixture({ ...fixture, id: `${aggregate.id}:${mode}:R${roundIndex + 1}:M${fixture.slotNumber}` }));
  }).flat());
}
