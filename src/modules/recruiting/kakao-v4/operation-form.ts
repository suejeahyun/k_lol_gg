import type { OperationFormPayloadByType, OperationFormType } from "../operation-forms/domain";
import { normalizeKakaoV4OperationFormText, parseKakaoV4OperationFormFieldMap } from "./operation-form-parser";

export type KakaoV4OperationFormDiagnostic = Readonly<{
  code: "CONFLICTING_DUPLICATE_FIELD";
  fieldLabel: string;
  occurrenceCount: number;
}>;

export type KakaoV4OperationFormParseResult =
  | Readonly<{ valid: true; formType: OperationFormType; payload: OperationFormPayloadByType[OperationFormType] }>
  | Readonly<{
      valid: false;
      formType: OperationFormType;
      missingFields: readonly string[];
      diagnostics?: readonly KakaoV4OperationFormDiagnostic[];
    }>;

function normalizeText(value: string) {
  return normalizeKakaoV4OperationFormText(value);
}

function canonical(value: string) {
  return value.trim().replace(/\s+/gu, "").replace(/[.:()\[\]{}<>·ㆍ,/\\_-]/gu, "");
}

function cleanField(value: string, maximum: number) {
  const output = normalizeText(value).split("\n").flatMap((rawLine) => {
    let line = rawLine.trim().replace(/^\s*:\s*/u, "").replace(/^\s*-\s*/u, "").replace(/^\s*[（(][^）)]*[）)]\s*/u, "");
    line = line.replace(/\s*\*\s*(?:EX\)?|예시|선택\s*:|특별한\s*사유\s*없이는)[\s\S]*$/iu, "").trim();
    if (!line || /^\(?\s*(?:소통방\s*,\s*구인방\s*,?\s*디코?|게임명\s*적기|장기\s*,\s*단기\s*,\s*특정\s*게임.*)\s*\)?$/u.test(line)) return [];
    return [line];
  }).join("\n").trim();
  return output.length > 0 && output.length <= maximum && !/^[.:\-_/()\[\]{}\s]+$/u.test(output) ? output : "";
}

function safeText(value: string, maximum: number) {
  const normalized = normalizeText(value).trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= maximum ? normalized : "";
}

function splitPerson(value: string, fallback: string) {
  const cleaned = cleanField(value, 180);
  const backup = safeText(fallback, 100) || "카카오 사용자";
  const separatorIndex = cleaned.search(/[\/|]/u);
  const explicitName = separatorIndex >= 0 ? cleaned.slice(0, separatorIndex) : cleaned;
  const explicitNickname = separatorIndex >= 0 ? cleaned.slice(separatorIndex + 1) : cleaned;
  const name = safeText(explicitName || backup, 100) || backup.slice(0, 100);
  const nickname = safeText(explicitNickname || explicitName || backup, 64) || backup.slice(0, 64);
  return { name, nickname };
}

function booleanFromText(value: string) {
  const compact = canonical(value).toLocaleLowerCase("ko-KR");
  if (/^(?:x|아니오|아니요|안함|변경안함|없음|no|false)$/u.test(compact)) return false;
  return /(?:o|예|네|변경|yes|true)/u.test(compact);
}

function participantsFromText(value: string) {
  const participants: string[] = [];
  for (const raw of normalizeText(value).split(/\n|,/u)) {
    const name = safeText(raw.replace(/^\s*[-*]?\s*\d*\s*[.)]?\s*/u, ""), 100);
    if (!name || participants.includes(name)) continue;
    participants.push(name);
    if (participants.length > 30) return [];
  }
  return Object.freeze(participants);
}

function calendarDate(value: string) {
  const match = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parsePeriod(value: string) {
  const text = cleanField(value, 160);
  const dates = text.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/gu) ?? [];
  const first = dates[0] ? calendarDate(dates[0]) : null;
  const second = dates[1] ? calendarDate(dates[1]) : first;
  if (first && second && second >= first) return { periodStart: first, periodEnd: second, legacyPeriodText: null };
  return text ? { periodStart: null, periodEnd: null, legacyPeriodText: text } : null;
}

function scopeFromText(value: string) {
  const normalized = normalizeText(value);
  const withoutChoices = normalized.replace(/^\s*[（(][^）)]*[）)]\s*/u, "");
  const cleanedSelection = cleanField(withoutChoices, 160);
  const selectedValue = cleanedSelection || (withoutChoices.trim() ? withoutChoices : normalized);
  const compact = selectedValue.replace(/\s+/gu, "");
  const selected: string[] = [];
  if (/소통방/u.test(compact)) selected.push("소통방");
  if (/구인방/u.test(compact)) selected.push("구인방");
  if (/디코|디스코드/u.test(compact)) selected.push("디코");
  return selected.length > 0 ? selected.join(", ") : cleanField(selectedValue, 160);
}

function invalid(
  formType: OperationFormType,
  missingFields: readonly string[],
  diagnostics: readonly KakaoV4OperationFormDiagnostic[],
): KakaoV4OperationFormParseResult {
  return Object.freeze({
    valid: false as const,
    formType,
    missingFields: Object.freeze([...new Set([...missingFields, ...diagnostics.map((item) => item.fieldLabel)])]),
    ...(diagnostics.length > 0 ? { diagnostics: Object.freeze([...diagnostics]) } : {}),
  });
}

export function parseKakaoV4OperationForm(input: Readonly<{
  formType: OperationFormType;
  text: string;
  senderFallback: string;
}>): KakaoV4OperationFormParseResult {
  const text = normalizeText(input.text).trim();
  const fieldMap = parseKakaoV4OperationFormFieldMap({ formType: input.formType, text });
  const diagnostics: KakaoV4OperationFormDiagnostic[] = [];
  const readField = (label: string, maximum: number) => {
    const occurrences = (fieldMap.fields[label] ?? []).map((value) => cleanField(value, maximum));
    const unique = [...new Set(occurrences)];
    if (unique.length > 1) diagnostics.push(Object.freeze({
      code: "CONFLICTING_DUPLICATE_FIELD" as const,
      fieldLabel: label,
      occurrenceCount: occurrences.length,
    }));
    return unique.length === 1 ? unique[0]! : "";
  };
  const readRawField = (label: string) => {
    const occurrences = (fieldMap.fields[label] ?? []).map((value) => normalizeText(value).trim());
    const unique = [...new Set(occurrences)];
    if (unique.length > 1) diagnostics.push(Object.freeze({
      code: "CONFLICTING_DUPLICATE_FIELD" as const,
      fieldLabel: label,
      occurrenceCount: occurrences.length,
    }));
    return unique.length === 1 ? unique[0]! : "";
  };
  if (input.formType === "friends") {
    const person = splitPerson("", input.senderFallback);
    const friendName = readField("지인 이름", 100);
    const friendNickname = readField("지인 닉네임", 64);
    const usagePeriod = readField("이용기간", 160);
    const discordNicknameChange = readField("디스코드 닉네임 변경", 40);
    const missing = [!friendName && "지인 이름", !friendNickname && "지인 닉네임", !usagePeriod && "이용기간"].filter(Boolean) as string[];
    if (missing.length > 0 || diagnostics.length > 0) return invalid(input.formType, missing, diagnostics);
    return Object.freeze({ valid: true as const, formType: input.formType, payload: Object.freeze({
      applicantName: person.name, applicantNickname: person.nickname, friendName, friendNickname,
      usagePeriod, discordNicknameChange: booleanFromText(discordNicknameChange),
    }) });
  }
  if (input.formType === "suggestions") {
    const personText = readField("본인 이름 및 닉네임", 180);
    const person = splitPerson(personText, input.senderFallback);
    const reason = readField("건의 사유", 500);
    const content = readField("건의 내용", 4_000);
    const missing = [!personText && "본인 이름 및 닉네임", !reason && "건의 사유", !content && "건의 내용"].filter(Boolean) as string[];
    if (missing.length > 0 || diagnostics.length > 0) return invalid(input.formType, missing, diagnostics);
    return Object.freeze({ valid: true as const, formType: input.formType, payload: Object.freeze({ applicantName: person.name, applicantNickname: person.nickname, reason, content }) });
  }
  if (input.formType === "meetups") {
    const personText = readField("주최자 이름 및 닉네임", 180);
    const person = splitPerson(personText, input.senderFallback);
    const legacyDateText = readField("일자", 160);
    const location = readField("장소", 240);
    const participants = participantsFromText(readField("참여자 명단", 4_000));
    const missing = [!personText && "주최자 이름 및 닉네임", !legacyDateText && "일자", !location && "장소", participants.length < 1 && "참여자 명단"].filter(Boolean) as string[];
    if (missing.length > 0 || diagnostics.length > 0) return invalid(input.formType, missing, diagnostics);
    return Object.freeze({ valid: true as const, formType: input.formType, payload: Object.freeze({ hostName: person.name, hostNickname: person.nickname, meetupAt: null, legacyDateText, location, participants }) });
  }
  const personText = readField("이름 및 닉네임", 180);
  const person = splitPerson(personText, input.senderFallback);
  const period = parsePeriod(readField("외출기간", 160));
  const reason = readField("외출사유", 1_000);
  const scope = scopeFromText(readRawField("외출범위"));
  const missing = [!personText && "이름 및 닉네임", !period && "외출기간", !reason && "외출사유", !scope && "외출범위"].filter(Boolean) as string[];
  if (missing.length > 0 || diagnostics.length > 0) return invalid(input.formType, missing, diagnostics);
  return Object.freeze({ valid: true as const, formType: input.formType, payload: Object.freeze({
    applicantName: person.name, applicantNickname: person.nickname,
    periodStart: period!.periodStart, periodEnd: period!.periodEnd,
    ...(period!.legacyPeriodText ? { legacyPeriodText: period!.legacyPeriodText } : {}), reason, scope,
  }) });
}
