import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

export const KAKAO_FORM_TYPES = {
  DISCIPLINE: "DISCIPLINE",
  INHOUSE_RESULT: "INHOUSE_RESULT",
} as const;

export type KakaoManagedFormType = (typeof KAKAO_FORM_TYPES)[keyof typeof KAKAO_FORM_TYPES];

export type ManagedField = {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  type: "TEXT" | "DATE" | "NUMBER" | "SELECT";
  options?: string[];
};

export type ManagedTemplate = {
  id: number | null;
  formType: KakaoManagedFormType;
  version: number;
  status: string;
  title: string;
  commandAliases: string[];
  instructions: string;
  fields: ManagedField[];
};

const DEFAULT_DISCIPLINE_FIELDS: ManagedField[] = [
  { key: "targetName", label: "대상 이름", required: true, type: "TEXT" },
  { key: "targetNicknameTag", label: "대상 닉네임#태그", required: true, type: "TEXT" },
  { key: "warningCategory", label: "경고 구분", required: true, type: "SELECT", options: ["일반", "내전"] },
  { key: "issuedDate", label: "부여일", placeholder: "YYYY-MM-DD", required: true, type: "DATE" },
  { key: "evidenceImageCount", label: "경고 부여 근거 사진 수", placeholder: "0", required: true, type: "NUMBER" },
];

const DEFAULT_INHOUSE_FIELDS: ManagedField[] = [
  { key: "matchDate", label: "진행일", placeholder: "YYYY-MM-DD", required: true, type: "DATE" },
  { key: "organizer", label: "진행자", required: true, type: "TEXT" },
  { key: "gameCount", label: "세트 수", placeholder: "2/3", required: true, type: "SELECT", options: ["2", "3"] },
  { key: "seriesNumber", label: "내전 회차", required: true, type: "NUMBER" },
  { key: "teamBalanceDraftId", label: "팀 밸런스 번호", placeholder: "없음", required: false, type: "NUMBER" },
  { key: "note", label: "특이사항", placeholder: "없음", required: false, type: "TEXT" },
];

export const DEFAULT_MANAGED_TEMPLATES: Record<KakaoManagedFormType, ManagedTemplate> = {
  DISCIPLINE: {
    id: null,
    formType: "DISCIPLINE",
    version: 1,
    status: "PUBLISHED",
    title: "K-LOL.GG 경고 등록 양식",
    commandAliases: ["/경고", "경고"],
    instructions: [
      "아래 양식을 복사하여 작성한 뒤 전체 내용을 전송해주세요.",
      "※ 경고 사유는 관리자 사이트에서 비공개로 등록합니다.",
      "※ 증빙 사진은 양식 접수 후 한 장씩 보내주세요.",
      "※ 항목명과 양식 버전은 삭제하거나 변경하지 마세요.",
    ].join("\n"),
    fields: DEFAULT_DISCIPLINE_FIELDS,
  },
  INHOUSE_RESULT: {
    id: null,
    formType: "INHOUSE_RESULT",
    version: 1,
    status: "PUBLISHED",
    title: "K-LOL.GG 내전 결과 등록 양식",
    commandAliases: ["/내전등록", "내전등록"],
    instructions: [
      "종료된 내전의 결과를 등록하기 위한 양식입니다.",
      "※ 세트 수는 2 또는 3만 입력해주세요.",
      "※ 팀 밸런스 번호가 없으면 ‘없음’으로 입력해주세요.",
      "※ 양식 접수 후 결과 사진을 1세트부터 한 장씩 보내주세요.",
      "※ 항목명과 양식 버전은 삭제하거나 변경하지 마세요.",
    ].join("\n"),
    fields: DEFAULT_INHOUSE_FIELDS,
  },
};

function toTemplate(record: {
  id: number;
  formType: string;
  version: number;
  status: string;
  title: string;
  commandAliases: unknown;
  instructions: string;
  fieldsJson: unknown;
}): ManagedTemplate {
  return {
    id: record.id,
    formType: record.formType as KakaoManagedFormType,
    version: record.version,
    status: record.status,
    title: record.title,
    commandAliases: Array.isArray(record.commandAliases) ? record.commandAliases.map(String) : [],
    instructions: record.instructions,
    fields: Array.isArray(record.fieldsJson) ? record.fieldsJson as ManagedField[] : [],
  };
}

export async function getPublishedManagedTemplate(formType: KakaoManagedFormType) {
  const record = await prisma.kakaoFormTemplate.findFirst({
    where: { formType, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  return record ? toTemplate(record) : DEFAULT_MANAGED_TEMPLATES[formType];
}

export function renderManagedTemplate(template: ManagedTemplate) {
  const fieldLines = template.fields.map((field) => {
    const placeholder = field.placeholder ? ` ${field.placeholder}` : "";
    return `${field.label}:${placeholder}`;
  });
  return [
    `[${template.title} v${template.version}]`,
    "",
    ...fieldLines,
    "",
    template.instructions,
  ].join("\n");
}

function parseLines(rawText: string) {
  const result = new Map<string, string>();
  for (const rawLine of rawText.replace(/\r/g, "").split("\n")) {
    const match = rawLine.match(/^\s*([^:：]+)\s*[:：]\s*(.*?)\s*$/);
    if (match) result.set(match[1].trim(), match[2].trim());
  }
  return result;
}

export function parseManagedForm(rawText: string, template: ManagedTemplate) {
  const expectedHeader = `[${template.title} v${template.version}]`;
  if (!rawText.includes(expectedHeader)) return { ok: false as const, message: "양식 제목 또는 버전을 확인해주세요." };
  const lines = parseLines(rawText);
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const field of template.fields) {
    const value = lines.get(field.label)?.trim() ?? "";
    const numericPlaceholderIsValue = field.type === "NUMBER" && /^-?\d+(?:\.\d+)?$/.test(field.placeholder ?? "");
    const normalized = value === field.placeholder && !numericPlaceholderIsValue ? "" : value;
    values[field.key] = normalized;
    if (field.required && !normalized) missing.push(field.label);
  }
  if (missing.length > 0) return { ok: false as const, message: `필수 항목을 입력해주세요: ${missing.join(", ")}` };
  return { ok: true as const, values };
}

export function parseNicknameTag(value: string) {
  const splitAt = value.lastIndexOf("#");
  if (splitAt <= 0 || splitAt >= value.length - 1) return null;
  return { nickname: value.slice(0, splitAt).trim(), tag: value.slice(splitAt + 1).trim() };
}

export function parseKstDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  const roundTrip = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return roundTrip === value ? date : null;
}

export function makePublicCode(prefix: string) {
  return `${prefix}${randomBytes(5).toString("hex").toUpperCase()}`;
}

export function makeSourceMessageHash(kind: string, roomName: string | null, sender: string | null, rawText: string) {
  return createHash("sha256").update([kind, roomName ?? "", sender ?? "", rawText.trim()].join("\n")).digest("hex");
}

export function managedTemplateSnapshot(template: ManagedTemplate): Prisma.InputJsonValue {
  return {
    formType: template.formType,
    version: template.version,
    title: template.title,
    instructions: template.instructions,
    fields: template.fields as unknown as Prisma.InputJsonValue,
  };
}

export function isManagedFormCommand(message: string, formType: KakaoManagedFormType) {
  const normalized = message.trim();
  return DEFAULT_MANAGED_TEMPLATES[formType].commandAliases.includes(normalized);
}

export function looksLikeManagedForm(message: string, formType: KakaoManagedFormType) {
  const title = DEFAULT_MANAGED_TEMPLATES[formType].title;
  return message.includes(`[${title} v`);
}
