import type { OperationFormPayloadByType, OperationFormType } from "../operation-forms/domain";

export type KakaoV4OperationFormParseResult =
  | Readonly<{ valid: true; formType: OperationFormType; payload: OperationFormPayloadByType[OperationFormType] }>
  | Readonly<{ valid: false; formType: OperationFormType; missingFields: readonly string[] }>;

function normalizeText(value: string) {
  return value.normalize("NFKC").replace(/\r\n?/gu, "\n").replace(/[–—]/gu, "-").replace(/\n{4,}/gu, "\n\n\n");
}

function stripFieldPrefix(line: string) {
  return line.trim().replace(/^\d+\s*[.)]\s*/u, "");
}

function canonical(value: string) {
  return value.trim().replace(/\s+/gu, "").replace(/[.:()\[\]{}<>·ㆍ,/\\_-]/gu, "");
}

function startsWithLabel(line: string, label: string) {
  return canonical(stripFieldPrefix(line)).startsWith(canonical(label));
}

function readField(text: string, label: string, nextLabels: readonly string[]) {
  const lines = normalizeText(text).split("\n");
  let startIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (startsWithLabel(lines[index]!, label)) startIndex = index;
  }
  if (startIndex < 0) return "";
  const labelPattern = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s*");
  const labelRegex = new RegExp(`^\\s*${labelPattern}\\s*[:：]?\\s*`, "iu");
  const output = [stripFieldPrefix(lines[startIndex]!).replace(labelRegex, "").trim()];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = stripFieldPrefix(lines[index]!);
    if (nextLabels.some((nextLabel) => startsWithLabel(line, nextLabel))) break;
    output.push(line);
  }
  return output.join("\n").trim();
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
  const parts = cleaned ? cleaned.split(/\s*(?:\/|\||,|·)\s*/u) : [];
  const name = safeText(parts[0] ?? backup, 100) || backup.slice(0, 100);
  const nickname = safeText(parts[1] ?? parts[0] ?? backup, 64) || backup.slice(0, 64);
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
  const selectedValue = withoutChoices.trim() ? withoutChoices : normalized;
  const compact = selectedValue.replace(/\s+/gu, "");
  const selected: string[] = [];
  if (/소통방/u.test(compact)) selected.push("소통방");
  if (/구인방/u.test(compact)) selected.push("구인방");
  if (/디코|디스코드/u.test(compact)) selected.push("디코");
  return selected.length > 0 ? selected.join(", ") : cleanField(selectedValue, 160);
}

function invalid(formType: OperationFormType, missingFields: readonly string[]): KakaoV4OperationFormParseResult {
  return Object.freeze({ valid: false as const, formType, missingFields: Object.freeze([...missingFields]) });
}

export function parseKakaoV4OperationForm(input: Readonly<{
  formType: OperationFormType;
  text: string;
  senderFallback: string;
}>): KakaoV4OperationFormParseResult {
  const text = normalizeText(input.text).trim();
  if (input.formType === "friends") {
    const person = splitPerson("", input.senderFallback);
    const friendName = cleanField(readField(text, "지인 이름", ["지인 닉네임", "이용기간", "디스코드 닉네임 변경"]), 100);
    const friendNickname = cleanField(readField(text, "지인 닉네임", ["이용기간", "디스코드 닉네임 변경"]), 64);
    const usagePeriod = cleanField(readField(text, "이용기간", ["디스코드 닉네임 변경"]), 160);
    const discordNicknameChange = cleanField(readField(text, "디스코드 닉네임 변경", []), 40);
    const missing = [!friendName && "지인 이름", !friendNickname && "지인 닉네임", !usagePeriod && "이용기간"].filter(Boolean) as string[];
    if (missing.length > 0) return invalid(input.formType, missing);
    return Object.freeze({ valid: true as const, formType: input.formType, payload: Object.freeze({
      applicantName: person.name, applicantNickname: person.nickname, friendName, friendNickname,
      usagePeriod, discordNicknameChange: booleanFromText(discordNicknameChange),
    }) });
  }
  if (input.formType === "suggestions") {
    const personText = cleanField(readField(text, "본인 이름 및 닉네임", ["건의 사유", "건의 내용"]), 180);
    const person = splitPerson(personText, input.senderFallback);
    const reason = cleanField(readField(text, "건의 사유", ["건의 내용"]), 500);
    const content = cleanField(readField(text, "건의 내용", []), 4_000);
    const missing = [!reason && "건의 사유", !content && "건의 내용"].filter(Boolean) as string[];
    if (missing.length > 0) return invalid(input.formType, missing);
    return Object.freeze({ valid: true as const, formType: input.formType, payload: Object.freeze({ applicantName: person.name, applicantNickname: person.nickname, reason, content }) });
  }
  if (input.formType === "meetups") {
    const personText = cleanField(readField(text, "주최자 이름 및 닉네임", ["일자", "장소", "참여자 명단"]), 180);
    const person = splitPerson(personText, input.senderFallback);
    const legacyDateText = cleanField(readField(text, "일자", ["장소", "참여자 명단"]), 160);
    const location = cleanField(readField(text, "장소", ["참여자 명단"]), 240);
    const participants = participantsFromText(readField(text, "참여자 명단", []));
    const missing = [!legacyDateText && "일자", !location && "장소", participants.length < 1 && "참여자 명단"].filter(Boolean) as string[];
    if (missing.length > 0) return invalid(input.formType, missing);
    return Object.freeze({ valid: true as const, formType: input.formType, payload: Object.freeze({ hostName: person.name, hostNickname: person.nickname, meetupAt: null, legacyDateText, location, participants }) });
  }
  const personText = cleanField(readField(text, "이름 및 닉네임", ["외출기간", "외출사유", "외출범위"]), 180);
  const person = splitPerson(personText, input.senderFallback);
  const period = parsePeriod(readField(text, "외출기간", ["외출사유", "외출범위"]));
  const reason = cleanField(readField(text, "외출사유", ["외출범위"]), 1_000);
  const scope = scopeFromText(readField(text, "외출범위", []));
  const missing = [!period && "외출기간", !reason && "외출사유", !scope && "외출범위"].filter(Boolean) as string[];
  if (missing.length > 0) return invalid(input.formType, missing);
  return Object.freeze({ valid: true as const, formType: input.formType, payload: Object.freeze({
    applicantName: person.name, applicantNickname: person.nickname,
    periodStart: period!.periodStart, periodEnd: period!.periodEnd,
    ...(period!.legacyPeriodText ? { legacyPeriodText: period!.legacyPeriodText } : {}), reason, scope,
  }) });
}
