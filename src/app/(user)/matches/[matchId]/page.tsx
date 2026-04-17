import { prisma } from "@/lib/prisma/client";

type PageProps = {
  params: Promise<{ matchId: string }>;
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("ko-KR");
}

function getTeamLabel(team: "BLUE" | "RED"): string {
  return team === "BLUE" ? "블루" : "레드";
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { matchId } = await params;
  const id = Number(matchId);

  if (Number.isNaN(id)) {
    throw new Error("Invalid matchId");
  }

  const match = await prisma.matchSeries.findUnique({
    where: { id },
    include: {
      season: true,
      games: {
        orderBy: {
          gameNumber: "asc",
        },
        include: {
          participants: {
            include: {
              player: true,
              champion: true,
            },
          },
        },
      },
    },
  });

  if (!match) {
    throw new Error("Match not found");
  }

  const gamesWithMvp = match.games.map((game) => {
    const participantsWithScore = game.participants.map((participant) => {
      const isWinner = participant.team === game.winnerTeam;
      const score =
        participant.kills * 3 +
        participant.assists * 1 -
        participant.deaths * 1 +
        (isWinner ? 5 : 0);

      return {
        ...participant,
        isWinner,
        score,
      };
    });

    const mvp = participantsWithScore.reduce((best, current) => {
      if (current.score > best.score) {
        return current;
      }

      if (current.score === best.score) {
        const currentKda =
          current.deaths === 0
            ? current.kills + current.assists
            : (current.kills + current.assists) / current.deaths;

        const bestKda =
          best.deaths === 0
            ? best.kills + best.assists
            : (best.kills + best.assists) / best.deaths;

        if (currentKda > bestKda) {
          return current;
        }
      }

      return best;
    });

    return {
      ...game,
      participants: participantsWithScore,
      mvp,
    };
  });

  return (
    <main className="page-container">
      <h1 className="page-title">{match.title}</h1>

      <div className="detail-header-card">
        <div className="detail-header-grid detail-header-grid--match">
          <div className="detail-header-label">시즌</div>
          <div className="detail-header-value">{match.season.name}</div>
          <div className="detail-header-label">날짜</div>
          <div className="detail-header-value">{formatDate(match.matchDate)}</div>
        </div>
      </div>

      <div className="card-grid">
        {gamesWithMvp.map((game) => (
          <section key={game.id} className="detail-board">
            <div className="detail-board__title">
              {game.gameNumber}세트 / 승리 팀: {getTeamLabel(game.winnerTeam)} / {game.durationMin}분
            </div>

            <div className="mvp-strip">
              MVP: {game.mvp.player.name} / {game.mvp.player.nickname}#{game.mvp.player.tag} /{" "}
              {game.mvp.champion.name} / {game.mvp.kills}/{game.mvp.deaths}/{game.mvp.assists} / 점수 {game.mvp.score}
            </div>

            <div className="match-detail-header">
              <div>팀</div>
              <div>이름</div>
              <div>닉네임#태그</div>
              <div>포지션</div>
              <div>챔피언</div>
              <div>결과</div>
              <div>KDA</div>
              <div>CS</div>
              <div>골드</div>
            </div>

            <div className="card-grid">
              {game.participants.map((participant) => (
                <div key={participant.id} className="match-detail-row">
                  <div>{participant.team}</div>
                  <div>{participant.player.name}</div>
                  <div>
                    {participant.player.nickname}#{participant.player.tag}
                  </div>
                  <div>{participant.position}</div>
                  <div>{participant.champion.name}</div>
                  <div>{participant.isWinner ? "WIN" : "LOSE"}</div>
                  <div>
                    {participant.kills}/{participant.deaths}/{participant.assists}
                  </div>
                  <div>{participant.cs}</div>
                  <div>{participant.gold}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}