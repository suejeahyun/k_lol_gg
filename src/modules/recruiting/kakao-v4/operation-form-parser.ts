import type { OperationFormType } from "../operation-forms/domain";

export const KAKAO_V4_OPERATION_FORM_LABELS = Object.freeze({
  friends: Object.freeze(["지인 이름", "지인 닉네임", "이용기간", "디스코드 닉네임 변경"]),
  suggestions: Object.freeze(["본인 이름 및 닉네임", "건의 사유", "건의 내용"]),
  meetups: Object.freeze(["주최자 이름 및 닉네임", "일자", "장소", "참여자 명단"]),
  leaves: Object.freeze(["이름 및 닉네임", "외출기간", "외출사유", "외출범위"]),
} satisfies Readonly<Record<OperationFormType, readonly string[]>>);

export type KakaoV4OperationFormFieldMap = Readonly<{
  formType: OperationFormType;
  fields: Readonly<Record<string, readonly string[]>>;
}>;

export function normalizeKakaoV4OperationFormText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u00a0\u2007\u202f]/gu, " ")
    .replace(/[\u2028\u2029]/gu, "\n")
    .replace(/[–—]/gu, "-")
    .replace(/\n{4,}/gu, "\n\n\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function stripNumberPrefix(value: string) {
  return value.replace(/^\s*(?:\(\s*)?\d+\s*(?:\\\s*)?(?:[.)]\s*)?/u, "");
}

function labelPattern(label: string) {
  const characters = [...label.replace(/\s+/gu, "")].map(escapeRegExp);
  return new RegExp(
    `^${characters.join("[\\t ]*")}(?:[\\t ]*:[\\t ]*|[\\t ]+|(?=$)|(?=[([]))`,
    "u",
  );
}

const LABEL_PATTERNS = new Map(
  Object.values(KAKAO_V4_OPERATION_FORM_LABELS)
    .flat()
    .map((label) => [label, labelPattern(label)] as const),
);

function matchLabel(line: string, labels: readonly string[]) {
  const candidate = stripNumberPrefix(line);
  for (const label of [...labels].sort((left, right) => right.length - left.length)) {
    const match = LABEL_PATTERNS.get(label)!.exec(candidate);
    if (match) return Object.freeze({ label, remainder: candidate.slice(match[0].length) });
  }
  return null;
}

function isInstructionFooter(line: string) {
  return /^\s*(?:※|[*＊]\s*(?:EX\)?|예시|선택|특별한\s*사유\s*없이는|안내|주의)|(?:안내|주의)\s*[:：]|위\s*양식|양식\s*작성|작성\s*후|제출\s*후|감사합니다(?:[.!]|\s|$))/iu.test(line);
}

function collectedValue(lines: readonly string[]) {
  const end = lines.findIndex(isInstructionFooter);
  const content = end < 0 ? lines : lines.slice(0, end);
  return content.join("\n").trim();
}

export function parseKakaoV4OperationFormFieldMap(input: Readonly<{
  formType: OperationFormType;
  text: string;
}>): KakaoV4OperationFormFieldMap {
  const labels = KAKAO_V4_OPERATION_FORM_LABELS[input.formType];
  const mutableFields = Object.fromEntries(labels.map((label) => [label, [] as string[]])) as Record<string, string[]>;
  let currentLabel: string | null = null;
  let currentLines: string[] = [];

  const finishOccurrence = () => {
    if (currentLabel === null) return;
    mutableFields[currentLabel]!.push(collectedValue(currentLines));
  };

  for (const line of normalizeKakaoV4OperationFormText(input.text).split("\n")) {
    const match = matchLabel(line, labels);
    if (match) {
      finishOccurrence();
      currentLabel = match.label;
      currentLines = [match.remainder];
      continue;
    }
    if (currentLabel !== null) currentLines.push(line);
  }
  finishOccurrence();

  return Object.freeze({
    formType: input.formType,
    fields: Object.freeze(Object.fromEntries(labels.map((label) => [label, Object.freeze([...mutableFields[label]!] as string[])]))),
  });
}

function headerCandidate(text: string) {
  const pattern = /^\s*(?:[-*#>》•▪▶]\s*)?(?:(?:\(\s*)?\d+\s*(?:\\\s*)?[.)]\s*)?(?:<|&lt;)\s*(지인|건의|모임|정모|외출)\s*(?:>|&gt;)\s*$/iu;
  for (const line of text.split("\n")) {
    const match = pattern.exec(line);
    if (!match) continue;
    if (match[1] === "지인") return "friends";
    if (match[1] === "건의") return "suggestions";
    if (match[1] === "모임" || match[1] === "정모") return "meetups";
    return "leaves";
  }
  return null;
}

function hasFieldSyntax(line: string) {
  return /^\s*(?:\(\s*)?\d+\s*(?:\\\s*)?[.)]/u.test(line) || /[:：]/u.test(line);
}

export function detectKakaoV4OperationFormCandidate(text: string): OperationFormType | null {
  const normalized = normalizeKakaoV4OperationFormText(text);
  const header = headerCandidate(normalized);
  if (header) return header;

  const lines = normalized.split("\n");
  const scores = (Object.keys(KAKAO_V4_OPERATION_FORM_LABELS) as OperationFormType[]).map((formType) => ({
    formType,
    score: KAKAO_V4_OPERATION_FORM_LABELS[formType].filter((label) =>
      lines.some((line) => hasFieldSyntax(line) && matchLabel(line, [label]) !== null),
    ).length,
  })).sort((left, right) => right.score - left.score);
  if (!scores[0] || scores[0].score < 2 || scores[0].score === scores[1]?.score) return null;
  return scores[0].formType;
}
