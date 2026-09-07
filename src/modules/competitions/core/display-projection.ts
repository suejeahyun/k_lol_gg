export type CompetitionPlayerOption = Readonly<{
  value: string;
  label: string;
  status: "ACTIVE" | "INACTIVE";
}>;

export function competitionPlayerLabel(
  catalog: ReadonlyMap<string, string>,
  playerId: string,
) {
  return catalog.get(playerId) ?? "알 수 없는 선수";
}

export function competitionTeamLabel(
  teams: readonly Readonly<{ id: string; name: string }>[],
  teamId: string | null,
) {
  if (teamId === null) return "미정";
  return teams.find((team) => team.id === teamId)?.name ?? "알 수 없는 팀";
}
