import { containsUnsafeText } from "../../../platform/security/input-safety";
import { parseCommunityImageUrl } from "../../community-sites/domain/site-configuration";

export type CommunityIntroduction = Readonly<{
  published: boolean;
  summary: string;
  introduction: string;
  activities: string;
  activityHours: string;
  joiningInfo: string;
  contactUrl: string | null;
  bannerUrl: string | null;
}>;

export type CommunityIntroductionSnapshot = Readonly<{
  revision: number;
  updatedAt: string | null;
  profile: CommunityIntroduction;
}>;

export type PublicCommunityIntroductionDto = Readonly<{
  version: 1;
  origin: string;
  profile: Omit<CommunityIntroduction, "published">;
  updatedAt: string;
}>;

export class CommunityIntroductionValidationError extends Error {
  constructor(readonly field: string, readonly reason: string) {
    super("INVALID_COMMUNITY_INTRODUCTION");
  }
}

const fields = ["published", "summary", "introduction", "activities", "activityHours", "joiningInfo", "contactUrl", "bannerUrl"] as const;
const publicFields = fields.filter((field) => field !== "published");

function objectWithKeys(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new CommunityIntroductionValidationError(field, "필수 항목과 허용된 항목만 입력해 주세요.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, limit: number, multiline = false): string {
  if (typeof value !== "string") throw new CommunityIntroductionValidationError(field, "문자열을 입력해 주세요.");
  const lines = value.normalize("NFC").replaceAll("\r\n", "\n");
  const normalized = lines.trim();
  // Plain text is rendered as text, never as HTML. Preserve intentional line breaks.
  if (normalized.length > limit || containsUnsafeText(multiline ? lines.replaceAll("\n", "") : lines)) {
    throw new CommunityIntroductionValidationError(field, `${limit}자 이내의 올바른 텍스트를 입력해 주세요.`);
  }
  return normalized;
}

function httpsUrl(value: unknown, field: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 500 || /[\s\u0000-\u001f\u007f]/u.test(value)) {
    throw new CommunityIntroductionValidationError(field, "500자 이내의 HTTPS 주소를 입력해 주세요.");
  }
  try {
    // Reuse the public-host boundary for both browser images and contact links.
    const url = parseCommunityImageUrl(value, field);
    if (!url || url.length > 500) throw new Error("INVALID_URL");
    return url;
  } catch { throw new CommunityIntroductionValidationError(field, "로그인 정보나 별도 포트가 없는 공개 HTTPS 주소를 입력해 주세요."); }
}

function canonicalOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) throw new CommunityIntroductionValidationError("origin", "사이트 주소가 올바르지 않습니다.");
  let url: URL;
  try { url = new URL(value); } catch { throw new CommunityIntroductionValidationError("origin", "사이트 주소가 올바르지 않습니다."); }
  if (!["https:", "http:"].includes(url.protocol) || url.origin !== value) {
    throw new CommunityIntroductionValidationError("origin", "사이트의 원본 주소가 필요합니다.");
  }
  return url.origin;
}

export function createDefaultCommunityIntroduction(): CommunityIntroduction {
  return { published: false, summary: "", introduction: "", activities: "", activityHours: "", joiningInfo: "", contactUrl: null, bannerUrl: null };
}

export function validateCommunityIntroduction(value: unknown): CommunityIntroduction {
  const record = objectWithKeys(value, fields, "profile");
  if (typeof record.published !== "boolean") throw new CommunityIntroductionValidationError("published", "공개 여부를 선택해 주세요.");
  const profile: CommunityIntroduction = {
    published: record.published,
    summary: text(record.summary, "summary", 160),
    introduction: text(record.introduction, "introduction", 3_000, true),
    activities: text(record.activities, "activities", 600, true),
    activityHours: text(record.activityHours, "activityHours", 160),
    joiningInfo: text(record.joiningInfo, "joiningInfo", 1_000, true),
    contactUrl: httpsUrl(record.contactUrl, "contactUrl"),
    bannerUrl: httpsUrl(record.bannerUrl, "bannerUrl"),
  };
  if (profile.published && (!profile.summary || !profile.introduction)) {
    throw new CommunityIntroductionValidationError(!profile.summary ? "summary" : "introduction", "공개하려면 한 줄 소개와 상세 소개를 입력해 주세요.");
  }
  return profile;
}

export function parsePublicCommunityIntroductionDto(value: unknown, expectedOrigin?: string): PublicCommunityIntroductionDto {
  const record = objectWithKeys(value, ["version", "origin", "profile", "updatedAt"], "publicProfile");
  if (record.version !== 1) throw new CommunityIntroductionValidationError("version", "지원하지 않는 소개 형식입니다.");
  const origin = canonicalOrigin(record.origin);
  if (expectedOrigin !== undefined && origin !== canonicalOrigin(expectedOrigin)) {
    throw new CommunityIntroductionValidationError("origin", "요청한 사이트와 소개의 출처가 다릅니다.");
  }
  const rawProfile = objectWithKeys(record.profile, publicFields, "profile");
  const profile = validateCommunityIntroduction({ ...rawProfile, published: true });
  if (typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))
    || new Date(record.updatedAt).toISOString() !== record.updatedAt) {
    throw new CommunityIntroductionValidationError("updatedAt", "갱신 시각이 올바르지 않습니다.");
  }
  return {
    version: 1, origin, updatedAt: record.updatedAt,
    profile: { summary: profile.summary, introduction: profile.introduction, activities: profile.activities,
      activityHours: profile.activityHours, joiningInfo: profile.joiningInfo, contactUrl: profile.contactUrl, bannerUrl: profile.bannerUrl },
  };
}

export function toPublicCommunityIntroductionDto(snapshot: CommunityIntroductionSnapshot, origin: string): PublicCommunityIntroductionDto | null {
  if (!snapshot.profile.published || snapshot.updatedAt === null) return null;
  const profile = snapshot.profile;
  return parsePublicCommunityIntroductionDto({ version: 1, origin, updatedAt: snapshot.updatedAt,
    profile: { summary: profile.summary, introduction: profile.introduction, activities: profile.activities,
      activityHours: profile.activityHours, joiningInfo: profile.joiningInfo, contactUrl: profile.contactUrl, bannerUrl: profile.bannerUrl } });
}
