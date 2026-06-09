export type KakaoOperationFormType = "friends" | "suggestions" | "meetups" | "leaves";

export type ParsedKakaoOperationForm =
  | {
      type: "friends";
      friendName: string;
      friendNickname: string;
      usageType: string;
      gameName: string | null;
      discordNicknameChange: string | null;
      rawText: string;
    }
  | {
      type: "suggestions";
      requesterInfo: string;
      reason: string;
      content: string;
      rawText: string;
    }
  | {
      type: "meetups";
      hostInfo: string;
      eventDateText: string;
      place: string;
      participants: string;
      rawText: string;
    }
  | {
      type: "leaves";
      requesterInfo: string;
      leavePeriod: string;
      reason: string;
      scope: string;
      rawText: string;
    };

export const kakaoOperationFormLabels: Record<KakaoOperationFormType, string> = {
  friends: "지인 신청",
  suggestions: "건의",
  meetups: "오프라인 모임",
  leaves: "외출 신청",
};

export const kakaoOperationFormStatusLabels: Record<string, string> = {
  PENDING: "대기",
  CHECKED: "확인",
  APPROVED: "승인",
  REJECTED: "반려",
  DONE: "완료",
  CONFIRMED: "확정",
  CANCELLED: "취소",
};

export const kakaoOperationFormStatuses = [
  "PENDING",
  "CHECKED",
  "APPROVED",
  "REJECTED",
  "DONE",
  "CONFIRMED",
  "CANCELLED",
] as const;

export function normalizeKakaoOperationText(value: unknown) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/　/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/：/g, ":")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLabel(label: string) {
  return label
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s*");
}

function readField(text: string, label: string, nextLabels: string[]) {
  const escapedLabel = normalizeLabel(label);
  const escapedNext = nextLabels.map(normalizeLabel).join("|");
  const pattern = escapedNext
    ? new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.\\s*)?${escapedLabel}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\d+\\.\\s*)?(?:${escapedNext})\\s*:?|$)`, "i")
    : new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.\\s*)?${escapedLabel}\\s*:?\\s*([\\s\\S]*)$`, "i");

  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function hasAll(text: string, labels: string[]) {
  return labels.every((label) => new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.\\s*)?${normalizeLabel(label)}\\s*:?`, "i").test(text));
}

function parseUsage(value: string) {
  const raw = value.replace(/\*\s*선택\s*:?/g, "").trim();
  const gameMatch = raw.match(/특정\s*게임\s*[(:：]?\s*([^\n)）]+)?/);

  if (/장기/.test(raw)) {
    return { usageType: "장기", gameName: null };
  }

  if (/단기/.test(raw)) {
    return { usageType: "단기", gameName: null };
  }

  if (/특정\s*게임/.test(raw)) {
    const gameName = gameMatch?.[1]?.replace(/게임명\s*적기/g, "").trim() || null;
    return { usageType: "특정 게임", gameName };
  }

  return { usageType: raw || "미입력", gameName: null };
}

export function parseKakaoOperationForm(input: unknown): ParsedKakaoOperationForm | null {
  const text = normalizeKakaoOperationText(input);

  if (!text) return null;

  if (hasAll(text, ["지인 이름", "지인 닉네임", "이용기간", "디스코드 닉네임 변경"])) {
    const usage = parseUsage(readField(text, "이용기간", ["디스코드 닉네임 변경"]));
    return {
      type: "friends",
      friendName: readField(text, "지인 이름", ["지인 닉네임", "이용기간", "디스코드 닉네임 변경"]),
      friendNickname: readField(text, "지인 닉네임", ["이용기간", "디스코드 닉네임 변경"]),
      usageType: usage.usageType,
      gameName: usage.gameName,
      discordNicknameChange: readField(text, "디스코드 닉네임 변경", []) || null,
      rawText: text,
    };
  }

  if (hasAll(text, ["본인 이름 및 닉네임", "건의 사유", "건의 내용"])) {
    return {
      type: "suggestions",
      requesterInfo: readField(text, "본인 이름 및 닉네임", ["건의 사유", "건의 내용"]),
      reason: readField(text, "건의 사유", ["건의 내용"]),
      content: readField(text, "건의 내용", []),
      rawText: text,
    };
  }

  if (hasAll(text, ["주최자 이름 및 닉네임", "일자", "장소", "참여자 명단"])) {
    return {
      type: "meetups",
      hostInfo: readField(text, "주최자 이름 및 닉네임", ["일자", "장소", "참여자 명단"]),
      eventDateText: readField(text, "일자", ["장소", "참여자 명단"]),
      place: readField(text, "장소", ["참여자 명단"]),
      participants: readField(text, "참여자 명단", []),
      rawText: text,
    };
  }

  if (hasAll(text, ["이름 및 닉네임", "외출기간", "외출사유", "외출범위"])) {
    return {
      type: "leaves",
      requesterInfo: readField(text, "이름 및 닉네임", ["외출기간", "외출사유", "외출범위"]),
      leavePeriod: readField(text, "외출기간", ["외출사유", "외출범위"]),
      reason: readField(text, "외출사유", ["외출범위"]),
      scope: readField(text, "외출범위", []),
      rawText: text,
    };
  }

  return null;
}

export function getKakaoOperationFormReply(type: KakaoOperationFormType) {
  if (type === "friends") {
    return "[K-LOL.GG 지인 신청 접수 완료]\n\n지인 신청이 운영진에게 전달되었습니다.\n운영진 확인 후 안내됩니다.";
  }

  if (type === "suggestions") {
    return "[K-LOL.GG 건의 접수 완료]\n\n건의 내용이 운영진에게 전달되었습니다.\n확인 후 필요 시 답변드리겠습니다.";
  }

  if (type === "meetups") {
    return "[K-LOL.GG 모임 등록 접수 완료]\n\n오프라인 모임 정보가 운영진에게 전달되었습니다.\n운영진 확인 후 관리됩니다.";
  }

  return "[K-LOL.GG 외출 신청 접수 완료]\n\n외출 신청이 운영진에게 전달되었습니다.\n특별한 사유 없이는 구인방, 디스코드 외출은 제한될 수 있습니다.";
}

export function isKakaoOperationFormStatus(value: unknown): value is (typeof kakaoOperationFormStatuses)[number] {
  return typeof value === "string" && kakaoOperationFormStatuses.includes(value as (typeof kakaoOperationFormStatuses)[number]);
}
