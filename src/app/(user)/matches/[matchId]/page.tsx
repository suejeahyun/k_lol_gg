import { notFound } from "next/navigation";
import MatchDetailSlider, {
  MatchDetailSlide,
} from "@/components/matches/MatchDetailSlider";
import { prisma } from "@/lib/prisma/client";

type MatchDetailPageProps = {
  params: Promise<{
    matchId: string;
  }>;
};

const positionOrder: Record<string, number> = {
  TOP: 0,
  JGL: 1,
  MID: 2,
  ADC: 3,
  SUP: 4,
};

function formatDate(date: Date) {
  return new Date(date).toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getWinnerLabel(team: "BLUE" | "RED" | null) {
  if (team === "BLUE") return "블루";
  if (team === "RED") return "레드";
  return "미정";
}

/**
 * 기존에 따로 MVP 점수 계산 로직이 있다면
 * 이 함수만 기존 로직으로 교체하면 됩니다.
 */
function calculateMvpScore({
  kills,
  deaths,
  assists,
  isWinner,
}: {
  kills: number;
  deaths: number;
  assists: number;
  isWinner: boolean;
}) {
  const base = kills * 3 + assists * 2 - deaths;
  return Math.max(0, base + (isWinner ? 10 : 0));
}

export default async function MatchDetailPage({
  params,
}: MatchDetailPageProps) {
  const { matchId } = await params;
  const id = Number(matchId);

  if (Number.isNaN(id)) {
    notFound();
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
    notFound();
  }

  const slides: MatchDetailSlide[] = match.games.map((game) => {
    const sortedParticipants = [...game.participants].sort((a, b) => {
      if (a.team !== b.team) {
        return a.team === "BLUE" ? -1 : 1;
      }

      return (
        (positionOrder[a.position] ?? 999) - (positionOrder[b.position] ?? 999)
      );
    });

    const mappedParticipants = sortedParticipants.map((participant) => {
      const playerName = participant.player?.name ?? "-";

      const nicknameTag = participant.player
        ? `${participant.player.nickname}#${participant.player.tag}`
        : "-";

      const championName = participant.champion?.name ?? "-";

      return {
        id: participant.id,
        team: participant.team,
        position: participant.position,
        name: playerName,
        nicknameTag,
        championName,
        championImageUrl: participant.champion?.imageUrl ?? null,
        kdaText: `${participant.kills}/${participant.deaths}/${participant.assists}`,
        resultText:
          participant.team === game.winnerTeam
            ? ("WIN" as const)
            : ("LOSE" as const),
      };
    });

    const mvpParticipant = [...game.participants]
      .map((participant) => {
        const score = calculateMvpScore({
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          isWinner: participant.team === game.winnerTeam,
        });

        return {
          participant,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)[0];

    const mvp = mvpParticipant
      ? {
          name: mvpParticipant.participant.player?.name ?? "-",
          nicknameTag: mvpParticipant.participant.player
            ? `${mvpParticipant.participant.player.nickname}#${mvpParticipant.participant.player.tag}`
            : "-",
          championName: mvpParticipant.participant.champion?.name ?? "-",
          kdaText: `${mvpParticipant.participant.kills}/${mvpParticipant.participant.deaths}/${mvpParticipant.participant.assists}`,
          score: mvpParticipant.score,
        }
      : null;

    return {
      id: game.id,
      gameNumber: game.gameNumber,
      winnerTeam: game.winnerTeam ?? "미정",
      winnerLabel: getWinnerLabel(game.winnerTeam),
      mvp,
      participants: mappedParticipants,
    };
  });

  return (
    <main className="page-container">
      <section className="card">
        <div className="match-series-detail">
          <h1 className="match-series-detail__title">{match.title}</h1>

          <div className="match-series-detail__meta">
            <div className="match-series-detail__meta-row">
              <span>시즌</span>
              <strong>{match.season.name}</strong>
            </div>

            <div className="match-series-detail__meta-row">
              <span>날짜</span>
              <strong>{formatDate(match.matchDate)}</strong>
            </div>
          </div>

          <MatchDetailSlider slides={slides} />
        </div>
      </section>
    </main>
  );
}