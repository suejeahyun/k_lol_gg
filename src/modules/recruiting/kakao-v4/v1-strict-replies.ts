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

const INHOUSE_MODE_LABELS = { RIFT: "협곡", ARAM: "칼바람", AUGMENT_ARAM: "증바람" } as const;
const INHOUSE_POSITION_LABELS = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서폿", ALL: "전체" } as const;
export const INHOUSE_FILLED_NOTICE = "시작 시간 10분 전 내전 디스코드방에 대기해주세요~";

type InhouseEntry = KakaoSeasonSnapshotDto["entries"][number];

function activeInhouseEntries(body: KakaoSeasonSnapshotDto) {
  return body.entries.filter((entry) => entry.status !== "CANCELLED" && entry.status !== "REJECTED")
    .sort((left, right) => left.slotNo - right.slotNo);
}

function isInhouseReserve(entry: InhouseEntry) {
  return Boolean(entry.reserve || entry.status === "RESERVE" || entry.status === "MATCHED_RESERVE");
}

function inhouseDisplayName(entry: InhouseEntry) {
  return (entry.suppliedName || entry.player?.memberName || entry.player?.displayName || "이름 확인 필요")
    .replace(/[\r\n]+/gu, " ").trim();
}

function inhouseParticipantText(entry: InhouseEntry, mode: keyof typeof INHOUSE_MODE_LABELS) {
  const name = inhouseDisplayName(entry);
  if (mode !== "RIFT") return name;
  const main = INHOUSE_POSITION_LABELS[entry.mainPosition];
  const subs = [...new Set(entry.subPositions)].filter((position) => position !== entry.mainPosition && position !== "ALL");
  const secondary = subs.length === 4 ? "전체" : subs.map((position) => INHOUSE_POSITION_LABELS[position]).join(",");
  return `${name}/${main}${secondary ? `/${secondary}` : ""}`;
}

export function inhouseCopyFormReply(body: KakaoSeasonSnapshotDto) {
  const metadata = body.roundMetadata;
  const mode = metadata?.mode ?? body.mode ?? "RIFT";
  const capacity = metadata?.capacity ?? 10;
  const entries = activeInhouseEntries(body);
  const main = entries.filter((entry) => !isInhouseReserve(entry));
  const reserve = entries.filter(isInhouseReserve);
  const closed = metadata?.status === "CLOSED" || metadata?.status === "CANCELED";
  const lines = [`[내전 #${body.recruitNo ?? metadata?.recruitNo ?? 1}] ${INHOUSE_MODE_LABELS[mode]} · ${main.length}/${capacity}명`];
  if (closed) lines.push(metadata?.status === "CLOSED" ? "🔒 모집 마감 · 명단 보관" : "작성 취소된 내전입니다.");
  else if (body.formCode) lines.push(`양식코드: ${body.formCode}`);
  else if (body.saveReference) lines.push(`저장기준: ${body.operatingDate ?? body.applyDate} / ${body.saveReference}`);
  for (const [reason, label] of [["SITE", "사이트에서 수정"], ["REVIEWED", "운영진에게 수정 요청"]] as const) {
    const protectedSlots = entries.filter((entry) => entry.protectedReason === reason).map((entry) =>
      isInhouseReserve(entry) ? `예비 ${entry.slotNo - capacity}번` : `${entry.slotNo}번`);
    if (protectedSlots.length > 0) lines.push(`${label}: ${protectedSlots.join(", ")}`);
  }
  lines.push("──────────────", `시작 시간: ${metadata?.startTimeText ?? ""}`);
  if (metadata?.noticeText) lines.push(`안내: ${metadata.noticeText.replace(/[\r\n]+/gu, " ")}`);
  lines.push("");
  for (let slot = 1; slot <= capacity; slot += 1) {
    const entry = main.find((candidate) => candidate.slotNo === slot);
    lines.push(`${slot}.${entry ? ` ${inhouseParticipantText(entry, mode)}` : ""}`);
  }
  lines.push("");
  const lastReserveSlot = Math.max(capacity, ...reserve.map((entry) => entry.slotNo));
  for (let slot = capacity + 1; slot <= Math.min(capacity * 2, lastReserveSlot + (closed ? 0 : 1)); slot += 1) {
    const entry = reserve.find((candidate) => candidate.slotNo === slot);
    lines.push(`예비 ${slot - capacity}.${entry ? ` ${inhouseParticipantText(entry, mode)}` : ""}`);
  }
  if (closed && reserve.length === 0) lines.push("예비 없음");
  return lines.join("\n");
}

export function inhouseMemberLinkNotice(body: KakaoSeasonSnapshotDto, publicOrigin = "https://k-lol-gg.vercel.app") {
  const entries = activeInhouseEntries(body);
  const names = (reason: NonNullable<InhouseEntry["memberLinkStatus"]>) => [...new Set(entries.filter((entry) =>
    (entry.memberLinkStatus ?? (entry.status === "UNMATCHED" || entry.status === "AMBIGUOUS" ? entry.status : undefined)) === reason,
  ).map(inhouseDisplayName))].join(", ");
  const unmatched = names("UNMATCHED");
  const ambiguous = names("AMBIGUOUS");
  const unverified = names("UNVERIFIED");
  if (!unmatched && !ambiguous && !unverified) return "";
  const lines = ["🔎 회원 연결 안내", "참가 접수는 완료됐어요. 아래 이름을 확인해주세요."];
  if (unmatched) lines.push("", `이름 확인: ${unmatched}`, "가입했다면 사이트 등록 이름으로 수정해주세요.",
    "아직 미가입이면 가입 후 운영진에게 회원 연결을 요청해주세요.", `${publicOrigin.replace(/\/$/u, "")}/signup`);
  if (ambiguous) lines.push("", `동명이인 확인: ${ambiguous}`, "이름(닉네임)으로 구분하고 운영진에게 정확한 계정 연결을 요청해주세요.");
  if (unverified) lines.push("", `회원 연결 확인: ${unverified}`, "일치하는 회원이 있어요. 운영진 확인 후 연결됩니다.");
  return lines.join("\n");
}

export function inhouseSaveReply(body: KakaoSeasonSnapshotDto, publicOrigin?: string) {
  const changed = Boolean(body.metadataUpdated || body.registrationCreated ||
    (body.createdCount ?? 0) + (body.updatedCount ?? 0) + body.cancelledCount > 0);
  if (!changed) return ["이번 요청으로 변경된 내용은 없어요.",
    `내전상세 ${body.recruitNo ?? 1}에서 최신 명단을 확인해 주세요.`].join("\n");
  const lines = [`✅ 내전${body.registrationCreated ? "등록" : "수정"} 완료 · #${body.recruitNo ?? 1}`];
  if (body.rosterFilled) lines.push("", `🎉 내전 #${body.recruitNo ?? 1} 참가 10명이 모두 모였어요!`, INHOUSE_FILLED_NOTICE);
  const notice = inhouseMemberLinkNotice(body, publicOrigin);
  if (notice) lines.push("", notice);
  return lines.join("\n");
}

export function v1StrictSeasonReply(body: KakaoSeasonSnapshotDto, action: "STATUS" | "DETAIL" | "SYNC") {
  // Historical adapters can still return their complete reply without the current round projection.
  if (!body.rounds && !body.roundMetadata && (body.v1StrictLegacyReply || body.legacyReply)) {
    return body.v1StrictLegacyReply ?? body.legacyReply!;
  }
  if (action === "DETAIL" && (body.roundMetadata || body.entries.length > 0)) return inhouseCopyFormReply(body);
  if (action === "SYNC") return inhouseSaveReply(body);
  const rounds = body.rounds ?? (body.roundMetadata ? [{ ...body.roundMetadata,
    mainCount: activeInhouseEntries(body).filter((entry) => !isInhouseReserve(entry)).length,
    reserveCount: activeInhouseEntries(body).filter(isInhouseReserve).length,
  }] : []);
  const active = rounds.filter((round) => !round.status || round.status === "IN_PROGRESS")
    .sort((left, right) => left.recruitNo - right.recruitNo);
  if (action === "DETAIL") return "해당 내전을 찾지 못했어요. 내전현황에서 번호를 확인해주세요.";
  const lines = ["📋 현재 내전"];
  if (active.length === 0) lines.push("", "현재 모집 중인 내전이 없습니다.");
  for (const round of active) {
    lines.push("", `[내전 #${round.recruitNo}] ${INHOUSE_MODE_LABELS[round.mode]} · ${round.startTimeText || "미정"} · ${round.mainCount}/${round.capacity}명${round.reserveCount > 0 ? ` · 예비 ${round.reserveCount}명` : ""}`,
      `└ 내전상세 ${round.recruitNo}`);
    if (round.noticeText) lines.push(`안내: ${round.noticeText.replace(/[\r\n]+/gu, " ")}`);
  }
  return lines.join("\n");
}
