export type KakaoRecentGameSummary = {
  title: string | null;
  gameNumber: number | null;
  result: "WIN" | "LOSE" | "UNKNOWN";
  kills: number;
  deaths: number;
  assists: number;
  championName: string | null;
};

export type KakaoPlayerRecordSummary = {
  playerId: number;
  name: string | null;
  nickname: string;
  tag: string;
  currentTier: string | null;
  peakTier: string | null;
  seasonName: string | null;
  totalGames: number;
  participationCount: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  mvpCount: number;
  recentGames: KakaoRecentGameSummary[];
  baseUrl: string;
};

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function formatKda(value: number) {
  if (!Number.isFinite(value)) return "Perfect";
  return value.toFixed(2);
}

export function formatPlayerRecordMessage(record: KakaoPlayerRecordSummary) {
  const playerLabel = `${record.nickname}#${record.tag}`;
  const tierLabel = [record.currentTier, record.peakTier]
    .filter(Boolean)
    .join(" / ") || "미입력";
  const recentLabel = record.recentGames.length
    ? record.recentGames
        .map((game) => {
          const result = game.result === "WIN" ? "승" : game.result === "LOSE" ? "패" : "-";
          const champion = game.championName ? ` ${game.championName}` : "";
          return `${result}${champion} ${game.kills}/${game.deaths}/${game.assists}`;
        })
        .join(" | ")
    : "최근 경기 없음";

  return [
    `[${playerLabel} 전적]`,
    "",
    `시즌: ${record.seasonName ?? "전체"}`,
    `티어: ${tierLabel}`,
    `참여: ${record.participationCount}회 / ${record.totalGames}세트`,
    `전적: ${record.wins}승 ${record.losses}패 (${formatNumber(record.winRate)}%)`,
    `KDA: ${formatKda(record.kda)} (${record.kills}/${record.deaths}/${record.assists})`,
    `MVP: ${record.mvpCount}회`,
    "",
    `최근: ${recentLabel}`,
    "",
    `${record.baseUrl}/players/${record.playerId}`,
  ].join("\n");
}

export function formatRecentGamesMessage(record: KakaoPlayerRecordSummary) {
  const playerLabel = `${record.nickname}#${record.tag}`;

  if (!record.recentGames.length) {
    return `[${playerLabel} 최근 경기]\n최근 경기 기록이 없습니다.`;
  }

  const lines = record.recentGames.map((game, index) => {
    const result = game.result === "WIN" ? "승" : game.result === "LOSE" ? "패" : "-";
    const champion = game.championName ?? "챔피언 미입력";
    return `${index + 1}. ${result} | ${champion} | ${game.kills}/${game.deaths}/${game.assists}`;
  });

  return [`[${playerLabel} 최근 경기]`, "", ...lines, "", `${record.baseUrl}/players/${record.playerId}`].join("\n");
}

export function formatRankingMessage(rows: Array<{ nickname: string; tag: string; winRate: number; totalGames: number; participationCount: number; kda: number }>) {
  if (!rows.length) {
    return "랭킹 데이터가 없습니다.\n기준: 내전 참여 10회 이상";
  }

  return [
    "🏆 K-LOL.GG 랭킹 TOP 5",
    "기준: 내전 참여 10회 이상",
    "",
    ...rows.slice(0, 5).map((row, index) => {
      return `${index + 1}. ${row.nickname}#${row.tag} | 승률 ${formatNumber(row.winRate)}% | 참여 ${row.participationCount}회 | ${row.totalGames}세트 | KDA ${formatKda(row.kda)}`;
    }),
  ].join("\n");
}
