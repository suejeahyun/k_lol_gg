import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

type PlayerDetailPageProps = {
  params: Promise<{
    playerId: string;
  }>;
};

export default async function PlayerDetailPage({
  params,
}: PlayerDetailPageProps) {
  const { playerId } = await params;
  const id = Number(playerId);

  if (!Number.isInteger(id)) {
    notFound();
  }

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      participants: {
        include: {
          champion: true,
          game: {
            include: {
              series: {
                include: {
                  season: true,
                },
              },
            },
          },
        },
        orderBy: {
          id: "desc",
        },
      },
    },
  });

  if (!player) {
    notFound();
  }

  const totalGames = player.participants.length;

  const wins = player.participants.filter(
    (participant) => participant.team === participant.game.winnerTeam
  ).length;

  const losses = totalGames - wins;

  const totalKills = player.participants.reduce(
    (sum, participant) => sum + participant.kills,
    0
  );

  const totalDeaths = player.participants.reduce(
    (sum, participant) => sum + participant.deaths,
    0
  );

  const totalAssists = player.participants.reduce(
    (sum, participant) => sum + participant.assists,
    0
  );

  const totalGold = player.participants.reduce(
    (sum, participant) => sum + participant.gold,
    0
  );

  const winRate =
    totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

  const kda =
    totalDeaths === 0
      ? Number((totalKills + totalAssists).toFixed(2))
      : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

  const avgGold = totalGames > 0 ? Math.round(totalGold / totalGames) : 0;

  const recentMatches = player.participants.slice(0, 10);

  return (
    <main className="page-container">
      <div style={{ marginBottom: 16 }}>
        <Link href="/players">← 플레이어 목록으로</Link>
      </div>

      <h1 className="page-title">{player.name}</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <strong>닉네임#태그:</strong> {player.nickname}#{player.tag}
          </div>
          <div>
            <strong>최대 티어:</strong> {player.peakTier ?? "-"}
          </div>
          <div>
            <strong>현재 티어:</strong> {player.currentTier ?? "-"}
          </div>
          <div>
            <strong>총 경기:</strong> {totalGames}
          </div>
          <div>
            <strong>승 / 패:</strong> {wins}승 {losses}패
          </div>
          <div>
            <strong>승률:</strong> {winRate}%
          </div>
          <div>
            <strong>KDA:</strong> {kda}
          </div>
          <div>
            <strong>평균 골드:</strong> {avgGold}
          </div>
        </div>
      </div>

      <section>
        <h2 style={{ marginBottom: 16 }}>최근 경기</h2>

        {recentMatches.length === 0 ? (
          <div className="card">최근 경기 기록이 없습니다.</div>
        ) : (
          <div className="card-grid">
            {recentMatches.map((participant) => {
              const isWin = participant.team === participant.game.winnerTeam;

              return (
                <div key={participant.id} className="card">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {participant.game.series.title}
                  </div>
                  <div>시즌: {participant.game.series.season.name}</div>
                  <div>게임 번호: {participant.game.gameNumber}</div>
                  <div>챔피언: {participant.champion.name}</div>
                  <div>팀: {participant.team}</div>
                  <div>포지션: {participant.position}</div>
                  <div>
                    K / D / A : {participant.kills} / {participant.deaths} /{" "}
                    {participant.assists}
                  </div>
                  <div>CS: {participant.cs}</div>
                  <div>골드: {participant.gold}</div>
                  <div style={{ marginTop: 8, fontWeight: 700 }}>
                    결과: {isWin ? "승리" : "패배"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}