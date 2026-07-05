export type KakaoOperationFormType = "suggestions" | "meetups" | "leaves";

export type ParsedKakaoOperationForm =
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
    .replace(/／/g, "/")
    .replace(/，/g, ",")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripFieldPrefix(line: string) {
  return String(line || "")
    .trim()
    .replace(/^\s*\d+\s*[.)]\s*/, "")
    .trim();
}

function canonical(value: string) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[.:：()（）\[\]{}<>·ㆍ,，/\\_-]/g, "")
    .trim();
}

function escapeRegExp(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPrefixRegex(label: string) {
  const pattern = String(label || "")
    .replace(/\s+/g, "")
    .split("")
    .map((char) => escapeRegExp(char))
    .join("\\s*");

  return new RegExp("^\\s*" + pattern + "\\s*");
}

function lineStartsWithLabel(line: string, label: string) {
  return canonical(stripFieldPrefix(line)).startsWith(canonical(label));
}

function hasAll(text: string, labels: string[]) {
  const lines = text.split("\n");
  return labels.every((label) => lines.some((line) => lineStartsWithLabel(line, label)));
}

function isNextLabelLine(line: string, labels: string[]) {
  return labels.some((label) => lineStartsWithLabel(line, label));
}

function removeLabelPrefix(line: string, label: string) {
  return stripFieldPrefix(line).replace(labelPrefixRegex(label), "").trim();
}

function readField(text: string, label: string, nextLabels: string[]) {
  const lines = text.split("\n");
  const out: string[] = [];
  let collecting = false;

  for (const sourceLine of lines) {
    const line = stripFieldPrefix(sourceLine);

    if (!collecting) {
      if (lineStartsWithLabel(line, label)) {
        out.push(removeLabelPrefix(line, label));
        collecting = true;
      }
      continue;
    }

    if (isNextLabelLine(line, nextLabels)) {
      break;
    }

    out.push(line);
  }

  return out.join("\n").trim();
}

function cleanGuideLines(value: string) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .map((line) =>
      line
        .replace(/^\s*[:：]\s*/, "")
        .replace(/^\s*[-]\s*/, "")
        .replace(/^\s*\([^)]*\)\s*/, "")
        .replace(/^\s*（[^）]*）\s*/, "")
        .replace(/^\s*[:：]\s*/, "")
        .replace(/^\s*[-]\s*/, "")
        .trim(),
    )
    .map((line) =>
      line
        .replace(/\s*\*\s*EX\)?[\s\S]*$/i, "")
        .replace(/\s*\*\s*예시[\s\S]*$/i, "")
        .replace(/\s*\*\s*선택\s*:?[\s\S]*$/i, "")
        .replace(/\s*\*\s*특별한\s*사유\s*없이는[\s\S]*$/i, "")
        .trim(),
    )
    .filter((line) => {
      if (!line) return false;
      if (/^\*\s*EX\)?/i.test(line)) return false;
      if (/^\*\s*예시/i.test(line)) return false;
      if (/^\*\s*선택\s*:?/i.test(line)) return false;
      if (/^\*\s*특별한\s*사유\s*없이는/i.test(line)) return false;
      if (/^\(?\s*게임명\s*적기\s*\)?$/.test(line)) return false;
      if (/^\(?\s*장기\s*,\s*단기\s*,\s*특정\s*게임.*\)?$/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function cleanRequiredField(value: string) {
  const text = cleanGuideLines(value);
  if (!text) return "";
  if (/^[.:：\-_/()（）\[\]{}\s]+$/.test(text)) return "";
  return text;
}


const LEAVE_SCOPE_OPTIONS = ["소통방", "구인방"] as const;

function normalizeLeaveScopeToken(value: string) {
  return value;
}

function uniqueJoin(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = normalizeLeaveScopeToken(value.trim());
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.join(", ");
}

function isAllScopeGuide(value: string) {
  const compact = canonical(value);
  return compact === "소통방구인방";
}

function extractLeaveScopeCandidates(line: string) {
  const compact = String(line || "").replace(/\s+/g, "");
  const found: string[] = [];
  if (/소통방/.test(compact)) found.push("소통방");
  if (/구인방/.test(compact)) found.push("구인방");
  return found;
}

export function cleanLeaveScopeField(value: string) {
  const source = String(value || "")
    .replace(/\r/g, "\n")
    .replace(/　/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/：/g, ":")
    .trim();

  const selected: string[] = [];
  const fallbackLines: string[] = [];

  for (const rawLine of source.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^\*\s*특별한\s*사유\s*없이는/i.test(line)) continue;
    if (/^\*\s*EX\)?/i.test(line)) continue;
    if (/^\*\s*예시/i.test(line)) continue;

    line = line
      .replace(/^\s*[:：]\s*/, "")
      .replace(/^\s*[-]\s*/, "")
      .trim();

    // 운영 기준: 제출 본문에서 외출범위 줄에 괄호 선택지만 남아 있어도
    const leadingGuide = line.match(/^\(?\s*소통방\s*,?\s*구인방\s*\)?\s*(.*)$/);
    if (leadingGuide) {
      const rest = (leadingGuide[1] || "").trim();
      if (!rest) {
        selected.push("소통방", "구인방");
        continue;
      }
      line = rest;
    }

    const parenOnly = line.match(/^\(?\s*([^()（）]+)\s*\)?$/)?.[1]?.trim() || "";
    if (parenOnly) {
      selected.push(...extractLeaveScopeCandidates(parenOnly));
    }

    selected.push(...extractLeaveScopeCandidates(line));

    const cleaned = cleanGuideLines(line);
    if (cleaned && !isAllScopeGuide(cleaned)) fallbackLines.push(cleaned);
  }

  const scope = uniqueJoin(selected);
  if (scope) return scope;

  const fallback = cleanRequiredField(fallbackLines.join("\n"));
  return fallback || "";
}

export function extractKakaoLeaveScopeFromText(input: unknown) {
  const text = normalizeKakaoOperationText(input);
  if (!text) return "";
  if (!hasAll(text, ["이름 및 닉네임", "외출기간", "외출사유", "외출범위"])) return "";
  return cleanLeaveScopeField(readField(text, "외출범위", []));
}

function parseUsage(value: string) {
  const raw = cleanRequiredField(value.replace(/\*\s*선택\s*:?/g, ""));
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

  if (hasAll(text, ["본인 이름 및 닉네임", "건의 사유", "건의 내용"])) {
    const requesterInfo = cleanRequiredField(readField(text, "본인 이름 및 닉네임", ["건의 사유", "건의 내용"]));
    const reason = cleanRequiredField(readField(text, "건의 사유", ["건의 내용"]));
    const content = cleanRequiredField(readField(text, "건의 내용", []));

    if (!requesterInfo || !reason || !content) return null;

    return {
      type: "suggestions",
      requesterInfo,
      reason,
      content,
      rawText: text,
    };
  }

  if (hasAll(text, ["주최자 이름 및 닉네임", "일자", "장소", "참여자 명단"])) {
    const hostInfo = cleanRequiredField(readField(text, "주최자 이름 및 닉네임", ["일자", "장소", "참여자 명단"]));
    const eventDateText = cleanRequiredField(readField(text, "일자", ["장소", "참여자 명단"]));
    const place = cleanRequiredField(readField(text, "장소", ["참여자 명단"]));
    const participants = cleanRequiredField(readField(text, "참여자 명단", []));

    if (!hostInfo || !eventDateText || !place || !participants) return null;

    return {
      type: "meetups",
      hostInfo,
      eventDateText,
      place,
      participants,
      rawText: text,
    };
  }

  if (hasAll(text, ["이름 및 닉네임", "외출기간", "외출사유", "외출범위"])) {
    const requesterInfo = cleanRequiredField(readField(text, "이름 및 닉네임", ["외출기간", "외출사유", "외출범위"]));
    const leavePeriod = cleanRequiredField(readField(text, "외출기간", ["외출사유", "외출범위"]));
    const reason = cleanRequiredField(readField(text, "외출사유", ["외출범위"]));
    const scope = cleanLeaveScopeField(readField(text, "외출범위", [])) || "미입력";

    if (!requesterInfo || !leavePeriod || !reason) return null;

    return {
      type: "leaves",
      requesterInfo,
      leavePeriod,
      reason,
      scope,
      rawText: text,
    };
  }

  return null;
}

export function getKakaoOperationFormReply(type: KakaoOperationFormType) {
  if (type === "friends") {
    return "[K-LOL.GG 지인 신청 접수 완료]";
  }

  if (type === "suggestions") {
    return "[K-LOL.GG 건의 접수 완료]";
  }

  if (type === "meetups") {
    return "[K-LOL.GG 모임 등록 접수 완료]";
  }

  return "[K-LOL.GG 외출 신청 접수 완료]";
}

export function isKakaoOperationFormStatus(value: unknown): value is (typeof kakaoOperationFormStatuses)[number] {
  return typeof value === "string" && kakaoOperationFormStatuses.includes(value as (typeof kakaoOperationFormStatuses)[number]);
}
