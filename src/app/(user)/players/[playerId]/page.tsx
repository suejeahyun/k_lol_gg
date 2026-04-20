import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getQueueLabel, getRiotPlayerOverview } from "@/lib/riot";

type PlayerDetailPageProps = {
  params: Promise<{
    playerId: string;
  }>;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}분 ${String(sec).padStart(2, "0")}초`;
}

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

  const riotOverview = await getRiotPlayerOverview(player.nickname, player.tag, 20);

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

      <section style={{ marginBottom: 32 }}>
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

      <section className="riot-section">
        <div className="riot-section__head">
          <div>
            <h2 className="riot-section__title">Riot 최근 20게임</h2>
            <p className="riot-section__desc">
              Riot 공식 API 기준 최근 전적입니다.
            </p>
          </div>

          {riotOverview?.opggUrl ? (
            <a
              href={riotOverview.opggUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="chip-button"
            >
              OP.GG 보기
            </a>
          ) : null}
        </div>

        {!riotOverview ? (
          <div className="card">
            Riot 전적 정보를 불러오지 못했습니다.
            <br />
            Riot API 키가 없거나, 닉네임/태그가 실제 Riot ID와 다를 수 있습니다.
          </div>
        ) : (
          <div className="riot-board">
            <div className="riot-summary-grid">
              <div className="riot-summary-card">
                <div className="riot-summary-card__label">Riot ID</div>
                <div className="riot-summary-card__value">{riotOverview.riotId}</div>
              </div>

              <div className="riot-summary-card">
                <div className="riot-summary-card__label">소환사 레벨</div>
                <div className="riot-summary-card__value">
                  {riotOverview.summonerLevel}
                </div>
              </div>

              <div className="riot-summary-card">
                <div className="riot-summary-card__label">솔로랭크</div>
                <div className="riot-summary-card__value">
                  {riotOverview.soloRank
                    ? `${riotOverview.soloRank.tier} · ${riotOverview.soloRank.leaguePoints}LP`
                    : "배치 전 / 정보 없음"}
                </div>
                {riotOverview.soloRank ? (
                  <div className="riot-summary-card__sub">
                    {riotOverview.soloRank.wins}승 {riotOverview.soloRank.losses}패 ·{" "}
                    {riotOverview.soloRank.winRate}%
                  </div>
                ) : null}
              </div>

              <div className="riot-summary-card">
                <div className="riot-summary-card__label">자유랭크</div>
                <div className="riot-summary-card__value">
                  {riotOverview.flexRank
                    ? `${riotOverview.flexRank.tier} · ${riotOverview.flexRank.leaguePoints}LP`
                    : "배치 전 / 정보 없음"}
                </div>
                {riotOverview.flexRank ? (
                  <div className="riot-summary-card__sub">
                    {riotOverview.flexRank.wins}승 {riotOverview.flexRank.losses}패 ·{" "}
                    {riotOverview.flexRank.winRate}%
                  </div>
                ) : null}
              </div>

              <div className="riot-summary-card">
                <div className="riot-summary-card__label">최근 20게임 전적</div>
                <div className="riot-summary-card__value">
                  {riotOverview.recentSummary.wins}승{" "}
                  {riotOverview.recentSummary.losses}패
                </div>
                <div className="riot-summary-card__sub">
                  승률 {riotOverview.recentSummary.winRate}%
                </div>
              </div>

              <div className="riot-summary-card">
                <div className="riot-summary-card__label">최근 20게임 평균 KDA</div>
                <div className="riot-summary-card__value">
                  {riotOverview.recentSummary.avgKda}
                </div>
                <div className="riot-summary-card__sub">
                  평균 CS {riotOverview.recentSummary.avgCs} / 평균 골드{" "}
                  {riotOverview.recentSummary.avgGold}
                </div>
              </div>
            </div>

            {riotOverview.recentMatches.length === 0 ? (
              <div className="card">최근 20게임 정보가 없습니다.</div>
            ) : (
              <div className="riot-match-list">
                {riotOverview.recentMatches.map((match) => (
                  <div key={match.matchId} className="riot-match-card">
                    <div className="riot-match-card__top">
                      <div className="riot-match-card__left">
                        <div className="riot-match-card__champion">
                          {match.championName}
                        </div>
                        <div className="riot-match-card__meta">
                          {getQueueLabel(match.queueId)} · {match.position} ·{" "}
                          {formatDateTime(match.playedAt)}
                        </div>
                      </div>

                      <div
                        className={
                          match.result === "승리"
                            ? "riot-result riot-result--win"
                            : "riot-result riot-result--lose"
                        }
                      >
                        {match.result}
                      </div>
                    </div>

                    <div className="riot-match-card__stats">
                      <div>
                        <span className="riot-stat-label">KDA</span>
                        <span className="riot-stat-value">
                          {match.kills} / {match.deaths} / {match.assists} (
                          {match.kda})
                        </span>
                      </div>
                      <div>
                        <span className="riot-stat-label">CS</span>
                        <span className="riot-stat-value">{match.cs}</span>
                      </div>
                      <div>
                        <span className="riot-stat-label">골드</span>
                        <span className="riot-stat-value">{match.gold}</span>
                      </div>
                      <div>
                        <span className="riot-stat-label">챔피언 피해량</span>
                        <span className="riot-stat-value">{match.damage}</span>
                      </div>
                      <div>
                        <span className="riot-stat-label">게임 시간</span>
                        <span className="riot-stat-value">
                          {formatDuration(match.durationSec)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}