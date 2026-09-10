import type {
  KakaoPlayerRecordDto,
  KakaoRankingDto,
  KakaoSeasonSnapshotDto,
} from "../kakao-assistant/domain";
import type { OperationFormType } from "../operation-forms/domain";

function fixed(value: number, digits: number) {
  return Number.isFinite(value) ? value.toFixed(digits) : digits === 2 ? "Perfect" : "0";
}

function playerUrl(publicOrigin: string, playerId: string) {
  return `${publicOrigin.replace(/\/$/u, "")}/players/${playerId}`;
}

function recentLine(match: KakaoPlayerRecordDto["recentMatches"][number]) {
  const result = match.won ? "승" : "패";
  const champion = match.championName ? ` ${match.championName}` : "";
  return `${result}${champion} ${match.kills}/${match.deaths}/${match.assists}`;
}

/** Default V40 server formatter, backed by the V2 read DTO. */
export function v1StrictPlayerRecordReply(
  body: KakaoPlayerRecordDto,
  publicOrigin = "https://k-lol-gg.vercel.app",
) {
  if (!body.player) {
    return body.mode === "RECORD"
      ? ["검색 결과가 없습니다.", "닉네임#태그를 확인해주세요.", "", `입력값: ${body.query}`].join("\n")
      : ["검색 결과가 없습니다.", "닉네임#태그를 확인해주세요.", "", "예시: 전적 sax0ph0ne#99단굵묵"].join("\n");
  }

  const title = body.player.riotId;
  const recent = body.recentMatches.slice(0, 3);
  if (body.mode === "RECENT") {
    if (recent.length === 0) return `[${title} 최근 경기]\n최근 경기 기록이 없습니다.`;
    return [
      `[${title} 최근 경기]`,
      "",
      ...recent.map((match, index) => `${index + 1}. ${match.won ? "승" : "패"} | ${match.championName || "챔피언 미입력"} | ${match.kills}/${match.deaths}/${match.assists}`),
      "",
      playerUrl(publicOrigin, body.player.playerId),
    ].join("\n");
  }

  const summary = body.summary ?? {
    totalGames: 0,
    participationCount: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    mvpCount: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    kda: 0,
  };
  const tier = [body.currentTier, body.peakTier].filter(Boolean).join(" / ") || "미입력";
  const recentText = recent.length > 0 ? recent.map(recentLine).join(" | ") : "최근 경기 없음";
  return [
    `[${title} 전적]`,
    "",
    `시즌: ${body.season?.name ?? "전체"}`,
    `티어: ${tier}`,
    `참여: ${summary.participationCount}회 / ${summary.totalGames}세트`,
    `전적: ${summary.wins}승 ${summary.losses}패 (${fixed(summary.winRate, 1)}%)`,
    `KDA: ${fixed(summary.kda, 2)} (${summary.kills}/${summary.deaths}/${summary.assists})`,
    `MVP: ${summary.mvpCount}회`,
    "",
    `최근: ${recentText}`,
    "",
    playerUrl(publicOrigin, body.player.playerId),
  ].join("\n");
}

export function v1StrictRankingReply(body: KakaoRankingDto) {
  if (body.rows.length === 0) return "랭킹 데이터가 없습니다.\n기준: 내전 참여 10회 이상";
  return [
    "🏆 K-LOL.GG 랭킹 TOP 5",
    "기준: 내전 참여 10회 이상",
    "",
    ...body.rows.slice(0, 5).map((row, index) =>
      `${index + 1}. ${row.riotId || row.displayName} | 승률 ${fixed(row.winRate, 1)}% | 참여 ${row.participationCount}회 | ${row.totalGames}세트 | KDA ${fixed(row.kda, 2)}`,
    ),
  ].join("\n");
}

export function v1StrictOperationFormReply(type: OperationFormType) {
  if (type === "friends") return "[K-LOL.GG 디스코드 초대 신청 접수 완료]";
  if (type === "suggestions") return "[K-LOL.GG 건의 접수 완료]";
  if (type === "meetups") return "[K-LOL.GG 모임 등록 접수 완료]";
  return "[K-LOL.GG 외출 신청 접수 완료]";
}

export function v1StrictSeasonReply(body: KakaoSeasonSnapshotDto, action: "STATUS" | "DETAIL" | "SYNC") {
  if (body.v1StrictLegacyReply) return body.v1StrictLegacyReply;
  if (action !== "SYNC" && body.recruitNo === null && (body.availableRecruitNos?.length ?? 0) === 0) {
    return "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
  }
  if (body.legacyReply) return body.legacyReply;
  if (action === "SYNC") {
    return [
      `[K-LOL.GG 내전 #${body.recruitNo ?? 1} 명단 변경 없음]`,
      `현재: ${body.entries.filter((entry) => entry.status !== "MATCHED_RESERVE").length}/10`,
    ].join("\n");
  }
  return "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
}
