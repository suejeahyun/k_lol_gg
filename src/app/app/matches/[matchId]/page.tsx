import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ matchId: string }>;
};

const positionOrder: Record<string, number> = {
  TOP: 0,
  JGL: 1,
  MID: 2,
  ADC: 3,
  SUP: 4,
};

const formatDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function teamLabel(team: string | null | undefined) {
  if (team === "BLUE") return "블루";
  if (team === "RED") return "레드";
  return "미정";
}

export default async function AppMatchDetailPage({ params }: PageProps) {
  const { matchId } = await params;
  const id = Number(matchId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const match = await prisma.matchSeries.findUnique({
    where: { id },
    include: {
      season: { select: { name: true } },
      games: {
        orderBy: { gameNumber: "asc" },
        include: {
          participants: {
            include: {
              player: { select: { name: true, nickname: true, tag: true } },
              champion: { select: { name: true, imageUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!match) notFound();

  return (
    <AppMobileShell subtitle="내전 상세">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">MATCH DETAIL</div>
        <h1 className="klol-app-title">{match.title}</h1>
        <p className="klol-app-subtitle">{formatDate.format(match.matchDate)} · {match.season.name}</p>
        <div className="klol-app-actions klol-app-actions--keep">
          <Link className="klol-app-secondary" href="/app/matches">목록</Link>
        </div>
      </section>

      <AppSection title="세트 요약">
        {match.games.length === 0 ? (
          <AppEmpty>등록된 세트가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {match.games.map((game) => {
              const participants = [...game.participants].sort((a, b) => {
                if (a.team !== b.team) return a.team === "BLUE" ? -1 : 1;
                return (positionOrder[a.position] ?? 99) - (positionOrder[b.position] ?? 99);
              });

              return (
                <article className="klol-app-list-card" key={game.id}>
                  <div className="klol-app-list-top">
                    <div className="klol-app-list-title">
                      <strong>{game.gameNumber}세트</strong>
                      <span>승리팀 {teamLabel(game.winnerTeam)} · {game.durationMin || 0}분</span>
                    </div>
                    <span className="klol-app-badge klol-app-badge--warn">{teamLabel(game.winnerTeam)}</span>
                  </div>

                  <div className="klol-app-participant-list">
                    {participants.map((participant) => (
                      <div className="klol-app-participant-row klol-app-participant-row--champion" key={participant.id} data-team={participant.team}>
                        <span>{participant.position}</span>
                        <i
                          className="klol-app-champion-avatar"
                          style={participant.champion?.imageUrl ? { backgroundImage: `url(${participant.champion.imageUrl})` } : undefined}
                          aria-hidden="true"
                        />
                        <strong>{participant.player?.name || participant.player?.nickname || "-"}</strong>
                        <em>{participant.champion?.name || "-"}</em>
                        <b>{participant.kills}/{participant.deaths}/{participant.assists}</b>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
