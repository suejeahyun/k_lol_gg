import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

type PlayerDetailPageProps = {
  params: Promise<{
    playerId: string;
  }>;
};

type PlayerApiResponse = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  createdAt: string;
  participants: Array<{
    id: number;
    gameId: number;
    playerId: number;
    championId: number;
    team: "BLUE" | "RED";
    position: string;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    gold: number;
    champion: {
      id: number;
      name: string;
      imageUrl: string;
      createdAt: string;
    };
    game: {
      id: number;
      seriesId: number;
      gameNumber: number;
      durationMin: number;
      winnerTeam: "BLUE" | "RED";
      series: {
        id: number;
        title: string;
        matchDate: string;
        seasonId: number;
        createdAt: string;
        season: {
          id: number;
          name: string;
          isActive: boolean;
          createdAt: string;
        };
      };
    };
  }>;
  riotOverview: {
    success: boolean;
    message?: string;
    account?: {
      puuid: string;
      gameName: string;
      tagLine: string;
    };
    summoner?: {
      id?: string;
      level: number;
    };
    soloRank?: {
      tier: string;
      rank: string;
      leaguePoints: number;
      wins: number;
      losses: number;
      winRate: number;
    } | null;
    flexRank?: {
      tier: string;
      rank: string;
      leaguePoints: number;
      wins: number;
      losses: number;
      winRate: number;
    } | null;
    championSummary?: Array<{
      championKey: string;
      championName: string;
      championImageUrl: string | null;
      games: number;
      wins: number;
      losses: number;
      winRate: number;
      totalKills: number;
      totalDeaths: number;
      totalAssists: number;
      avgKills: number;
      avgDeaths: number;
      avgAssists: number;
      kda: string;
      avgDamageDealtToChampions: number;
      avgDamageTaken: number;
    }>;
    totalAnalyzedMatches?: number;
  };
};

function formatDateTime(value: string | number) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatWinRate(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

function getBaseUrl() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

export default async function PlayerDetailPage({
  params,
}: PlayerDetailPageProps) {
  const { playerId } = await params;
  const id = Number(playerId);

  if (!Number.isInteger(id)) {
    notFound();
  }

  const response = await fetch(`${getBaseUrl()}/api/players/${id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    notFound();
  }

  const player = (await response.json()) as PlayerApiResponse;
  const riotOverview = player.riotOverview;
  const championSummary = riotOverview?.championSummary ?? [];

  const totalGames = player.participants.length;
  const wins = player.participants.filter(
    (participant) => participant.game.winnerTeam === participant.team
  ).length;
  const losses = totalGames - wins;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

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

  const avgKda =
    totalGames > 0
      ? totalDeaths === 0
        ? "Perfect"
        : ((totalKills + totalAssists) / totalDeaths).toFixed(2)
      : "0.00";

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">플레이어 상세</p>
          <h1 className="page-title">
            {player.name} ({player.nickname}#{player.tag})
          </h1>
          <p className="page-description">
            등록일: {formatDateTime(player.createdAt)}
          </p>
        </div>

        <div className="page-actions">
          <Link href="/players" className="btn btn-ghost">
            목록으로
          </Link>
        </div>
      </div>

      <section className="card-grid">
        <article className="stat-card">
          <span className="stat-card__label">총 경기</span>
          <strong className="stat-card__value">{totalGames}</strong>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">승 / 패</span>
          <strong className="stat-card__value">
            {wins}승 {losses}패
          </strong>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">승률</span>
          <strong className="stat-card__value">{winRate}%</strong>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">평균 KDA</span>
          <strong className="stat-card__value">{avgKda}</strong>
        </article>
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>기본 정보</h2>
        </div>

        <div className="info-grid">
          <div className="info-card">
            <span className="info-card__label">이름</span>
            <strong className="info-card__value">{player.name}</strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">닉네임</span>
            <strong className="info-card__value">{player.nickname}</strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">태그</span>
            <strong className="info-card__value">{player.tag}</strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">최대 티어</span>
            <strong className="info-card__value">
              {player.peakTier ?? "-"}
            </strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">현재 티어</span>
            <strong className="info-card__value">
              {player.currentTier ?? "-"}
            </strong>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>Riot 정보</h2>
        </div>

        {riotOverview?.success ? (
          <>
            <div className="info-grid">
              <div className="info-card">
                <span className="info-card__label">Riot ID</span>
                <strong className="info-card__value">
                  {riotOverview.account?.gameName}#
                  {riotOverview.account?.tagLine}
                </strong>
              </div>

              <div className="info-card">
                <span className="info-card__label">소환사 레벨</span>
                <strong className="info-card__value">
                  {riotOverview.summoner?.level ?? "-"}
                </strong>
              </div>

              <div className="info-card">
                <span className="info-card__label">분석 경기 수</span>
                <strong className="info-card__value">
                  {riotOverview.totalAnalyzedMatches ?? 0}
                </strong>
              </div>
            </div>

            <div className="card-grid" style={{ marginTop: 16 }}>
              <article className="stat-card">
                <span className="stat-card__label">솔로랭크</span>
                <strong className="stat-card__value">
                  {riotOverview.soloRank
                    ? `${riotOverview.soloRank.tier} ${riotOverview.soloRank.rank} ${riotOverview.soloRank.leaguePoints}LP`
                    : "기록 없음"}
                </strong>
                {riotOverview.soloRank ? (
                  <span className="stat-card__sub">
                    {riotOverview.soloRank.wins}승 {riotOverview.soloRank.losses}패 ·{" "}
                    {formatWinRate(
                      riotOverview.soloRank.wins,
                      riotOverview.soloRank.losses
                    )}
                    %
                  </span>
                ) : null}
              </article>

              <article className="stat-card">
                <span className="stat-card__label">자유랭크</span>
                <strong className="stat-card__value">
                  {riotOverview.flexRank
                    ? `${riotOverview.flexRank.tier} ${riotOverview.flexRank.rank} ${riotOverview.flexRank.leaguePoints}LP`
                    : "기록 없음"}
                </strong>
                {riotOverview.flexRank ? (
                  <span className="stat-card__sub">
                    {riotOverview.flexRank.wins}승 {riotOverview.flexRank.losses}패 ·{" "}
                    {formatWinRate(
                      riotOverview.flexRank.wins,
                      riotOverview.flexRank.losses
                    )}
                    %
                  </span>
                ) : null}
              </article>
            </div>
          </>
        ) : (
          <div className="empty-box">
            {riotOverview?.message ?? "Riot 정보를 불러오지 못했습니다."}
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>Riot 챔피언 집계</h2>
        </div>

        {riotOverview?.success && championSummary.length > 0 ? (
          <div className="champion-summary-list">
            <div className="champion-summary-list__head">
              <span>챔피언</span>
              <span>승률</span>
              <span>KDA</span>
              <span>판수</span>
            </div>

            {championSummary.map((champion) => (
              <article key={champion.championKey} className="champion-summary-row">
                <div className="champion-summary-row__champion">
                  {champion.championImageUrl ? (
                    <Image
                      src={champion.championImageUrl}
                      alt={champion.championName}
                      width={40}
                      height={40}
                      className="champion-summary-row__image"
                    />
                  ) : (
                    <div className="champion-summary-row__fallback" />
                  )}
                  <strong>{champion.championName}</strong>
                </div>

                <div className="champion-summary-row__metric">
                  {champion.winRate}%
                </div>

                <div className="champion-summary-row__metric">
                  {champion.kda}
                </div>

                <div className="champion-summary-row__metric">
                  {champion.games}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-box">
            {riotOverview?.message ?? "Riot 챔피언 집계 정보를 불러오지 못했습니다."}
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>내전 최근 기록</h2>
        </div>

        {player.participants.length === 0 ? (
          <div className="empty-box">등록된 내전 기록이 없습니다.</div>
        ) : (
          <div className="match-list">
            {player.participants.map((participant) => {
              const isWin = participant.game.winnerTeam === participant.team;

              return (
                <article
                  key={participant.id}
                  className={`match-card ${
                    isWin ? "match-card--win" : "match-card--loss"
                  }`}
                >
                  <div className="match-card__top">
                    <div>
                      <strong className="match-card__queue">
                        {participant.game.series.title}
                      </strong>
                      <p className="match-card__date">
                        {formatDateTime(participant.game.series.matchDate)}
                      </p>
                    </div>

                    <div className="match-card__result">
                      <span>{isWin ? "승리" : "패배"}</span>
                      <span>세트 {participant.game.gameNumber}</span>
                    </div>
                  </div>

                  <div className="match-card__body">
                    <div className="match-card__champion">
                      <strong>{participant.champion.name}</strong>
                      <span>{participant.position}</span>
                    </div>

                    <div className="match-card__score">
                      <strong>
                        {participant.kills} / {participant.deaths} / {participant.assists}
                      </strong>
                      <span>팀 {participant.team}</span>
                    </div>

                    <div className="match-card__damage">
                      <span>시즌 {participant.game.series.season.name}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}