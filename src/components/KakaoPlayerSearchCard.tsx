type PlayerSummaryResult = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
};

type Props = {
  data: PlayerSummaryResult;
};

export default function KakaoPlayerSearchCard({ data }: Props) {
  return (
    <div className="kakao-player-card">
      <div className="kakao-player-card__header">
        <h2 className="kakao-player-card__title">
          {data.nickname}#{data.tag}
        </h2>
        <p className="kakao-player-card__subtitle">{data.name}</p>
      </div>

      <div className="kakao-player-card__stats">
        <div className="kakao-player-card__stat">
          <span className="kakao-player-card__label">총판수</span>
          <strong className="kakao-player-card__value">{data.totalGames}판</strong>
        </div>

        <div className="kakao-player-card__stat">
          <span className="kakao-player-card__label">승률</span>
          <strong className="kakao-player-card__value">{data.winRate}%</strong>
        </div>

        <div className="kakao-player-card__stat">
          <span className="kakao-player-card__label">KDA</span>
          <strong className="kakao-player-card__value">{data.kda}</strong>
        </div>

        <div className="kakao-player-card__stat">
          <span className="kakao-player-card__label">승 / 패</span>
          <strong className="kakao-player-card__value">
            {data.wins}승 {data.losses}패
          </strong>
        </div>

        <div className="kakao-player-card__stat kakao-player-card__stat--full">
          <span className="kakao-player-card__label">평균 K / D / A</span>
          <strong className="kakao-player-card__value">
            {data.avgKills} / {data.avgDeaths} / {data.avgAssists}
          </strong>
        </div>
      </div>
    </div>
  );
}