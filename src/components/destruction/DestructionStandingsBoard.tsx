import type { CSSProperties } from "react";

type StandingTeam = {
  id: number;
  name: string;
  preliminaryGroup: string | null;
  points: number;
  wins: number;
  losses: number;
};

type StandingMatch = {
  id: number;
  stage: string;
  preliminaryGroup: string | null;
  teamAId: number;
  teamBId: number;
  winnerTeamId: number | null;
  teamAScore: number;
  teamBScore: number;
  isConfirmed: boolean;
  matchDate: Date | null;
  round: number;
};

function calculateTeamStanding(team: StandingTeam, matches: StandingMatch[]) {
  const teamMatches = matches
    .filter(
      (match) =>
        match.stage === "PRELIMINARY" &&
        match.isConfirmed &&
        match.winnerTeamId &&
        (match.teamAId === team.id || match.teamBId === team.id),
    )
    .sort((a, b) => {
      const aTime = a.matchDate?.getTime() ?? 0;
      const bTime = b.matchDate?.getTime() ?? 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.round - b.round;
    });

  let matchWins = 0;
  let matchLosses = 0;
  let gameWins = 0;
  let gameLosses = 0;
  const form: Array<"W" | "L"> = [];

  for (const match of teamMatches) {
    const isTeamA = match.teamAId === team.id;
    const won = match.winnerTeamId === team.id;
    if (won) matchWins += 1;
    else matchLosses += 1;
    gameWins += isTeamA ? match.teamAScore : match.teamBScore;
    gameLosses += isTeamA ? match.teamBScore : match.teamAScore;
    form.push(won ? "W" : "L");
  }

  const played = matchWins + matchLosses;
  return {
    ...team,
    matchWins,
    matchLosses,
    played,
    winRate: played > 0 ? Math.round((matchWins / played) * 100) : 0,
    gameWins,
    gameLosses,
    gameDiff: gameWins - gameLosses,
    form: form.slice(-5),
  };
}

function getAdvancementStatus(teamId: number, matches: StandingMatch[]) {
  const finalMatch = matches.find(
    (match) =>
      match.stage === "FINAL" &&
      (match.teamAId === teamId || match.teamBId === teamId),
  );

  if (finalMatch) {
    if (!finalMatch.winnerTeamId) {
      return { label: "결승 진출", tone: "final" };
    }
    return finalMatch.winnerTeamId === teamId
      ? { label: "우승", tone: "champion" }
      : { label: "준우승", tone: "runner-up" };
  }

  const semiFinalMatch = matches.find(
    (match) =>
      match.stage === "SEMI_FINAL" &&
      (match.teamAId === teamId || match.teamBId === teamId),
  );

  if (!semiFinalMatch) return null;
  if (!semiFinalMatch.winnerTeamId) {
    return { label: "4강 확정", tone: "semi-final" };
  }
  return semiFinalMatch.winnerTeamId === teamId
    ? { label: "결승 진출", tone: "final" }
    : { label: "4강 종료", tone: "eliminated" };
}

export default function DestructionStandingsBoard({
  title,
  teams,
  matches,
}: {
  title: string;
  teams: StandingTeam[];
  matches: StandingMatch[];
}) {
  const groupNames = Array.from(
    new Set(teams.map((team) => team.preliminaryGroup?.trim() || "통합")),
  ).sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <div className="destruction-standings">
      {groupNames.map((groupName) => {
        const groupTeams = teams
          .filter(
            (team) => (team.preliminaryGroup?.trim() || "통합") === groupName,
          )
          .map((team) => calculateTeamStanding(team, matches))
          .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.matchWins !== a.matchWins) return b.matchWins - a.matchWins;
            if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
            if (b.gameWins !== a.gameWins) return b.gameWins - a.gameWins;
            if (a.matchLosses !== b.matchLosses)
              return a.matchLosses - b.matchLosses;
            return a.name.localeCompare(b.name, "ko");
          });

        return (
          <section className="destruction-standings__group" key={groupName}>
            <header className="destruction-standings__header">
              <span>DESTRUCTION MATCH</span>
              <h3>{title}</h3>
              <strong>{groupName === "통합" ? "통합 순위" : `GROUP ${groupName}`}</strong>
            </header>

            <div className="destruction-standings__scroll">
              <table>
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>팀</th>
                    <th>경기</th>
                    <th>승-패</th>
                    <th>승률</th>
                    <th>세트 승-패</th>
                    <th>세트 득실</th>
                    <th>최근 결과 / 진출</th>
                  </tr>
                </thead>
                <tbody>
                  {groupTeams.map((team, index) => {
                    const advancement = getAdvancementStatus(team.id, matches);
                    return (
                      <tr data-rank={index + 1} key={team.id}>
                        <td>
                          <b>{index + 1}</b>
                        </td>
                        <td>
                          <span
                            className="destruction-standings__emblem"
                            style={
                              {
                                "--team-hue": String((team.id * 53) % 360),
                              } as CSSProperties
                            }
                            aria-hidden="true"
                          >
                            {team.name.slice(0, 1)}
                          </span>
                          <strong>{team.name}</strong>
                        </td>
                        <td>{team.played}</td>
                        <td>
                          {team.matchWins}-{team.matchLosses}
                        </td>
                        <td>{team.winRate}%</td>
                        <td>
                          {team.gameWins}-{team.gameLosses}
                        </td>
                        <td data-diff={Math.sign(team.gameDiff)}>
                          {team.gameDiff > 0 ? "+" : ""}
                          {team.gameDiff}
                        </td>
                        <td>
                          {advancement ? (
                            <strong
                              className="destruction-standings__advancement"
                              data-tone={advancement.tone}
                            >
                              {advancement.label}
                            </strong>
                          ) : (
                            <span className="destruction-standings__form">
                              {team.form.length > 0 ? (
                                team.form.map((result, resultIndex) => (
                                  <i
                                    data-result={result}
                                    key={`${team.id}-${resultIndex}`}
                                  >
                                    {result}
                                  </i>
                                ))
                              ) : (
                                <em>-</em>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
