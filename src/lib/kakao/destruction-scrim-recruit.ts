import { getKakaoRecruitDateKey } from "@/lib/kakao/party-recruit";

export type ScrimAction = "CREATE" | "STATUS" | "JOIN" | "CONFIRM" | "FINISH" | "CANCEL" | "DETAIL";

export type ScrimCreateCommand = {
  tournamentId: number | null;
  requesterTeamName: string | null;
  startTimeText: string | null;
  scheduledAt: Date | null;
  gameCount: number | null;
  memo: string | null;
};

export type ScrimNumberCommand = {
  scrimNo: number;
  teamName?: string | null;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function normalizeScrimText(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/　/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/／/g, "/")
    .replace(/：/g, ":")
    .replace(/，/g, ",")
    .replace(/–|—/g, "-")
    .replace(/０/g, "0")
    .replace(/１/g, "1")
    .replace(/２/g, "2")
    .replace(/３/g, "3")
    .replace(/４/g, "4")
    .replace(/５/g, "5")
    .replace(/６/g, "6")
    .replace(/７/g, "7")
    .replace(/８/g, "8")
    .replace(/９/g, "9")
    .replace(/\s+/g, " ")
    .trim();
}

export function getScrimRecruitDateKey(now = new Date()) {
  return getKakaoRecruitDateKey(now);
}

function toUtcFromKst(params: { month: number; day: number; hour: number; minute: number; base?: Date }) {
  const base = params.base ?? new Date();
  const kst = new Date(base.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  return new Date(Date.UTC(year, params.month - 1, params.day, params.hour, params.minute, 0, 0) - KST_OFFSET_MS);
}

export function parseScrimScheduledAt(text: string, base = new Date()) {
  const normalized = normalizeScrimText(text);
  const full = normalized.match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s+(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2}))?/);
  if (full) {
    let hour = Number(full[4]);
    const minute = full[5] ? Number(full[5]) : 0;
    if (full[3] === "오후" && hour < 12) hour += 12;
    if (full[3] === "오전" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        text: `${Number(full[1])}/${Number(full[2])} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        date: toUtcFromKst({ month: Number(full[1]), day: Number(full[2]), hour, minute, base }),
      };
    }
  }

  const timeOnly = normalized.match(/(?:^|\s)(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2}))?\s*(?:분)?(?:\s|$)/);
  if (!timeOnly) return { text: null, date: null };

  let hour = Number(timeOnly[2]);
  const minute = timeOnly[3] ? Number(timeOnly[3]) : 0;
  if (timeOnly[1] === "오후" && hour < 12) hour += 12;
  if (timeOnly[1] === "오전" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { text: null, date: null };

  const kst = new Date(base.getTime() + KST_OFFSET_MS);
  const date = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hour, minute, 0, 0) - KST_OFFSET_MS);
  return { text: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, date };
}

export function parseScrimAction(message: string): ScrimAction | null {
  const text = normalizeScrimText(message).replace(/^\//, "");
  const compact = text.replace(/\s+/g, "");

  if (/^(스크림구인|스크림모집|멸망전스크림구인|멸망전스크림모집)/.test(compact)) return "CREATE";
  if (/^(스크림현황|스크림목록|멸망전스크림현황|멸망전스크림목록)/.test(compact)) return "STATUS";
  if (/^(스크림상세|멸망전스크림상세)/.test(compact)) return "DETAIL";
  if (/^(스크림참가|스크림신청|멸망전스크림참가|멸망전스크림신청)/.test(compact)) return "JOIN";
  if (/^(스크림확정|멸망전스크림확정)/.test(compact)) return "CONFIRM";
  if (/^(스크림완료|스크림마감|멸망전스크림완료|멸망전스크림마감)/.test(compact)) return "FINISH";
  if (/^(스크림취소|멸망전스크림취소)/.test(compact)) return "CANCEL";

  return null;
}

export function parseScrimCreateCommand(message: string): ScrimCreateCommand | null {
  let text = normalizeScrimText(message).replace(/^\//, "");
  text = text.replace(/^(스크림구인|스크림모집|멸망전스크림구인|멸망전스크림모집)\s*/, "").trim();

  if (!text) return null;

  let tournamentId: number | null = null;
  const firstNumber = text.match(/^(\d{1,4})(?:\s+|$)/);
  if (firstNumber) {
    tournamentId = Number(firstNumber[1]);
    text = text.slice(firstNumber[0].length).trim();
  }

  const gameMatch = text.match(/(\d{1,2})\s*(?:판|게임|세트)/);
  const gameCount = gameMatch ? Number(gameMatch[1]) : null;

  const schedule = parseScrimScheduledAt(text);
  let cleaned = text;
  if (gameMatch) cleaned = cleaned.replace(gameMatch[0], " ").trim();
  if (schedule.text) {
    cleaned = cleaned
      .replace(/\d{1,2}\s*[\/.-]\s*\d{1,2}\s+(오전|오후)?\s*\d{1,2}(?:\s*[:시]\s*\d{1,2})?/, " ")
      .replace(/(?:오전|오후)?\s*\d{1,2}(?:\s*[:시]\s*\d{1,2})?\s*(?:분)?/, " ")
      .trim();
  }

  const requesterTeamName = cleaned.split(/\s+/).filter(Boolean)[0] || null;

  return {
    tournamentId,
    requesterTeamName,
    startTimeText: schedule.text,
    scheduledAt: schedule.date,
    gameCount: Number.isInteger(gameCount) && gameCount! > 0 && gameCount! <= 20 ? gameCount : null,
    memo: text || null,
  };
}

export function parseScrimNumberCommand(message: string): ScrimNumberCommand | null {
  let text = normalizeScrimText(message).replace(/^\//, "");
  text = text.replace(/^(스크림상세|스크림참가|스크림신청|스크림확정|스크림완료|스크림마감|스크림취소|멸망전스크림상세|멸망전스크림참가|멸망전스크림신청|멸망전스크림확정|멸망전스크림완료|멸망전스크림마감|멸망전스크림취소)\s*/, "").trim();

  const match = text.match(/^#?\s*(\d{1,3})(?:\s+(.+))?$/);
  if (!match) return null;

  const scrimNo = Number(match[1]);
  if (!Number.isInteger(scrimNo) || scrimNo < 1 || scrimNo > 999) return null;

  return {
    scrimNo,
    teamName: match[2]?.trim() || null,
  };
}

export function formatScrimTime(value: Date | string | null | undefined, fallback?: string | null) {
  if (!value) return fallback || "미정";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback || "미정";
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

export function getScrimStatusLabel(status: string) {
  if (status === "RECRUITING") return "모집중";
  if (status === "MATCHED") return "상대 신청";
  if (status === "CONFIRMED") return "확정";
  if (status === "COMPLETED") return "완료";
  if (status === "CANCELED") return "취소";
  return status;
}

export function formatScrimLine(scrim: {
  scrimNo: number;
  title: string;
  status: string;
  startTimeText: string | null;
  scheduledAt: Date | string | null;
  gameCount: number | null;
  requesterTeamName: string | null;
  opponentTeamName: string | null;
}) {
  const teams = `${scrim.requesterTeamName || "요청팀 미정"} vs ${scrim.opponentTeamName || "상대구함"}`;
  const gameText = scrim.gameCount ? `${scrim.gameCount}판` : "판수 미정";
  return `#${scrim.scrimNo} ${teams} / ${formatScrimTime(scrim.scheduledAt, scrim.startTimeText)} / ${gameText} / ${getScrimStatusLabel(scrim.status)}`;
}

export function buildScrimStatusReply(scrims: Array<Parameters<typeof formatScrimLine>[0]>) {
  if (scrims.length === 0) {
    return [
      "[K-LOL.GG 멸망전 스크림 현황]",
      "",
      "현재 모집중/확정된 스크림이 없습니다.",
      "",
      "등록: /스크림구인 팀명 7/6 21:00 5판",
    ].join("\n");
  }

  return [
    "[K-LOL.GG 멸망전 스크림 현황]",
    "",
    ...scrims.map(formatScrimLine),
    "",
    "참가: /스크림참가 번호 팀명",
    "확정: /스크림확정 번호",
    "완료: /스크림완료 번호",
  ].join("\n");
}
