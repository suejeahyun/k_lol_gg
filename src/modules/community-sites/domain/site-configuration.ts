import { containsUnsafeText } from "../../../platform/security/input-safety";
import type { PublicFeatureFlags } from "../../operations/domain/site-settings";

export const COMMUNITY_MODULE_IDS = [
  "members", "recruiting", "matches", "teamBalance", "rankings", "competitions", "media", "riotIntegration", "kakaoHelp",
] as const;
export type CommunityModuleId = (typeof COMMUNITY_MODULE_IDS)[number];
export const COMMUNITY_HOME_SECTION_IDS = [
  "introduction", "recruiting", "competitions", "matches", "rankings", "media", "members",
] as const;
export type CommunityHomeSectionId = (typeof COMMUNITY_HOME_SECTION_IDS)[number];
export type CommunityTemplateId = "arena" | "lounge" | "club";

export type CommunitySiteConfig = Readonly<{
  name: string;
  slug: string;
  description: string;
  templateId: CommunityTemplateId;
  primaryColor: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  modules: Readonly<Record<CommunityModuleId, boolean>>;
  homeSections: readonly CommunityHomeSectionId[];
}>;

export type CommunityModuleDefinition = Readonly<{
  id: CommunityModuleId;
  label: string;
  description: string;
  required: boolean;
  dependencies: readonly CommunityModuleId[];
  disableImpact: string;
  setupNote?: string;
}>;

/** Only features with an existing implementation belong in this catalog. */
export const COMMUNITY_MODULE_CATALOG: readonly CommunityModuleDefinition[] = [
  { id: "members", label: "회원·선수", description: "회원 가입과 선수 등록, 커뮤니티별 권한 관리", required: true, dependencies: [], disableImpact: "사이트 운영에 필요한 기본 기능입니다." },
  { id: "recruiting", label: "모집", description: "우리 커뮤니티의 모집과 참가 신청", required: false, dependencies: ["members"], disableImpact: "새 모집·참가 접수와 메뉴를 중지합니다. 기존 신청 취소와 운영진의 모집 마무리는 가능합니다." },
  { id: "matches", label: "경기 기록", description: "경기 결과 제출과 기록 조회", required: false, dependencies: ["members"], disableImpact: "새 결과 접수와 메뉴를 중지합니다. 팀 밸런스·랭킹도 함께 꺼집니다. 기존 기록과 운영진의 결과 마무리는 유지됩니다." },
  { id: "teamBalance", label: "팀 밸런스", description: "등록된 선수와 경기 자료를 활용한 팀 편성", required: false, dependencies: ["matches"], disableImpact: "새 팀 편성을 닫습니다. 저장된 편성안은 유지됩니다." },
  { id: "rankings", label: "랭킹", description: "우리 커뮤니티의 경기 통계와 순위", required: false, dependencies: ["matches"], disableImpact: "랭킹 화면을 숨깁니다. 경기 기록과 MMR은 삭제하거나 초기화하지 않습니다." },
  { id: "competitions", label: "커뮤니티 대회", description: "이벤트·멸망전 대회 운영", required: false, dependencies: ["members"], disableImpact: "새 대회·참가 접수와 메뉴를 중지합니다. 기존 대회 기록과 운영진의 진행·결과 마무리는 유지됩니다." },
  { id: "media", label: "갤러리·하이라이트", description: "이미지와 경기 하이라이트 게시", required: false, dependencies: ["members"], disableImpact: "새 게시와 메뉴를 중지합니다. 기존 게시물·파일과 운영진의 관리 권한은 유지됩니다." },
  { id: "riotIntegration", label: "Riot 전적 연동", description: "Riot 계정과 외부 전적 조회", required: false, dependencies: ["members"], disableImpact: "새 Riot 조회를 중단합니다. 저장된 경기·선수 자료는 유지됩니다.", setupNote: "사이트별 유효한 API 키와 이용 자격 확인 후 사용할 수 있습니다. 켜기만으로 연결되지는 않습니다." },
  { id: "kakaoHelp", label: "카카오톡 이용 안내", description: "카카오톡 봇 명령어와 사용 안내", required: false, dependencies: ["members"], disableImpact: "카카오톡 안내 메뉴를 숨깁니다. 휴대폰 봇의 작동·방 연결은 별도로 관리합니다.", setupNote: "이 설정은 안내 화면입니다. 실제 봇은 휴대폰 설치와 채팅방 연결이 필요합니다." },
];

export const COMMUNITY_HOME_SECTIONS: readonly Readonly<{
  id: CommunityHomeSectionId;
  label: string;
  module: CommunityModuleId | null;
  emptyText: string;
}>[] = [
  { id: "introduction", label: "커뮤니티 소개", module: null, emptyText: "우리 커뮤니티를 소개해 주세요." },
  { id: "recruiting", label: "함께할 멤버 모집", module: "recruiting", emptyText: "아직 등록된 모집이 없습니다. 첫 모집을 시작해 보세요." },
  { id: "competitions", label: "커뮤니티 대회", module: "competitions", emptyText: "아직 열린 대회가 없습니다." },
  { id: "matches", label: "최근 경기", module: "matches", emptyText: "첫 경기를 마치면 기록이 여기에 쌓입니다." },
  { id: "rankings", label: "우리 커뮤니티 랭킹", module: "rankings", emptyText: "경기 기록이 쌓이면 순위를 확인할 수 있습니다." },
  { id: "media", label: "함께한 순간", module: "media", emptyText: "아직 등록된 이미지나 하이라이트가 없습니다." },
  { id: "members", label: "커뮤니티 멤버", module: "members", emptyText: "새 커뮤니티는 빈 회원 목록으로 시작합니다." },
];

export const COMMUNITY_TEMPLATES: readonly Readonly<{
  id: CommunityTemplateId;
  name: string;
  subtitle: string;
  description: string;
  defaultColor: string;
  homeSections: readonly CommunityHomeSectionId[];
}>[] = [
  { id: "arena", name: "Arena", subtitle: "경기와 모집을 한눈에", description: "모집·대회·경기 기록이 앞에 오는 선명한 경기 중심 구성", defaultColor: "#536DFE", homeSections: ["introduction", "recruiting", "competitions", "matches", "rankings", "members"] },
  { id: "lounge", name: "Lounge", subtitle: "우리만의 분위기", description: "넓은 배너와 이미지, 소개를 중심으로 함께한 순간을 보여주는 구성", defaultColor: "#AD57D3", homeSections: ["introduction", "media", "recruiting", "members", "competitions", "matches"] },
  { id: "club", name: "Club", subtitle: "차분하고 편한 모임", description: "소개와 모집, 멤버 정보를 읽기 편하게 정리한 정보 중심 구성", defaultColor: "#16816D", homeSections: ["introduction", "recruiting", "members", "competitions", "matches", "rankings"] },
];

export class CommunitySiteConfigurationError extends Error {
  constructor(readonly field: string, readonly reason: string) {
    super("INVALID_COMMUNITY_SITE_CONFIG");
    this.name = "CommunitySiteConfigurationError";
  }
}

function invalid(field: string, reason: string): never {
  throw new CommunitySiteConfigurationError(field, reason);
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field, "올바른 설정 형식이 아닙니다.");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], field: string) {
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) {
    invalid(field, "지원하지 않거나 누락된 설정 항목이 있습니다.");
  }
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") invalid(field, "문자로 입력해 주세요.");
  const result = value.normalize("NFKC").trim();
  if (result.length < min || result.length > max || containsUnsafeText(result)) invalid(field, `${min}~${max}자 이내의 일반 문자로 입력해 주세요.`);
  return result;
}

/** Public HTTPS image URLs are used directly by the browser, never fetched by the server. */
export function parseCommunityImageUrl(value: unknown, field = "imageUrl"): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") invalid(field, "HTTPS 이미지 주소를 입력해 주세요.");
  if (!value.trim()) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return invalid(field, "올바른 HTTPS 이미지 주소를 입력해 주세요."); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // Reject numeric/local hosts, credentials and non-standard ports even in drafts.
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.href.length > 2_000
    || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")
    || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) {
    invalid(field, "로그인 정보가 없는 공개 HTTPS 이미지 주소를 사용해 주세요.");
  }
  return url.href;
}

export function validateCommunitySiteConfig(value: unknown): CommunitySiteConfig {
  const input = object(value, "configuration");
  exactKeys(input, ["name", "slug", "description", "templateId", "primaryColor", "logoUrl", "bannerUrl", "modules", "homeSections"], "configuration");
  const name = text(input.name, "name", 2, 80);
  const slug = text(input.slug, "slug", 3, 40).toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) || ["admin", "api", "hub", "www", "login", "signup", "account", "sites", "new"].includes(slug)) {
    invalid("slug", "영문 소문자로 시작하는 3~40자의 영문·숫자·하이픈을 사용해 주세요. 예약된 주소는 사용할 수 없습니다.");
  }
  const description = text(input.description, "description", 0, 300);
  const template = COMMUNITY_TEMPLATES.find((item) => item.id === input.templateId);
  if (!template) invalid("templateId", "세 가지 기본 테마 중 하나를 선택해 주세요.");
  if (typeof input.primaryColor !== "string" || !/^#[\da-f]{6}$/i.test(input.primaryColor)) invalid("primaryColor", "#으로 시작하는 6자리 색상을 입력해 주세요.");
  const rawModules = object(input.modules, "modules");
  if (Object.keys(rawModules).some((key) => !(COMMUNITY_MODULE_IDS as readonly string[]).includes(key))) {
    invalid("modules", "지원하지 않는 기능 설정이 있습니다.");
  }
  const modules = {} as Record<CommunityModuleId, boolean>;
  for (const definition of COMMUNITY_MODULE_CATALOG) {
    const present = Object.hasOwn(rawModules, definition.id);
    if (!present && definition.required) invalid(`modules.${definition.id}`, `${definition.label} 기본 기능 설정이 필요합니다.`);
    // Older saved configurations do not know newly released optional modules.
    // Missing means off, never the new-site wizard's default or automatic opt-in.
    const enabled = present ? rawModules[definition.id] : false;
    if (typeof enabled !== "boolean") invalid(`modules.${definition.id}`, "기능 사용 여부를 선택해 주세요.");
    modules[definition.id] = enabled;
  }
  for (const definition of COMMUNITY_MODULE_CATALOG) {
    if (definition.required && !modules[definition.id]) invalid(`modules.${definition.id}`, `${definition.label}은 기본 기능이라 끌 수 없습니다.`);
    if (modules[definition.id] && definition.dependencies.some((id) => !modules[id])) invalid(`modules.${definition.id}`, `${definition.label}에 필요한 기능을 먼저 켜 주세요.`);
  }
  if (!Array.isArray(input.homeSections) || input.homeSections.length === 0
    || input.homeSections.some((id) => !COMMUNITY_HOME_SECTION_IDS.includes(id))
    || new Set(input.homeSections).size !== input.homeSections.length
    || !input.homeSections.includes("introduction")) invalid("homeSections", "소개를 포함한 홈 구성을 중복 없이 선택해 주세요.");
  return {
    name, slug, description, templateId: template.id, primaryColor: input.primaryColor.toUpperCase(),
    logoUrl: parseCommunityImageUrl(input.logoUrl, "logoUrl"), bannerUrl: parseCommunityImageUrl(input.bannerUrl, "bannerUrl"),
    modules, homeSections: [...input.homeSections] as CommunityHomeSectionId[],
  };
}

export function createDefaultCommunitySiteConfig(templateId: CommunityTemplateId = "arena"): CommunitySiteConfig {
  const template = COMMUNITY_TEMPLATES.find((item) => item.id === templateId);
  if (!template) invalid("templateId", "지원하지 않는 테마입니다.");
  return {
    name: "새 커뮤니티", slug: "new-community", description: "함께 게임하고 즐거운 순간을 나누는 커뮤니티입니다.",
    templateId, primaryColor: template.defaultColor, logoUrl: null, bannerUrl: null,
    modules: { members: true, recruiting: true, matches: true, teamBalance: true, rankings: true, competitions: true, media: true, riotIntegration: false, kakaoHelp: false },
    homeSections: [...template.homeSections],
  };
}

/** Only settings change here. Business records and the saved home order are untouched. */
export function setCommunitySiteModule(configuration: CommunitySiteConfig, id: CommunityModuleId, enabled: boolean): CommunitySiteConfig {
  const target = COMMUNITY_MODULE_CATALOG.find((item) => item.id === id);
  if (!target || typeof enabled !== "boolean") invalid("modules", "지원하지 않는 기능 설정입니다.");
  if (target.required && !enabled) invalid(`modules.${id}`, `${target.label}은 기본 기능이라 끌 수 없습니다.`);
  const modules = { ...configuration.modules };
  function change(moduleId: CommunityModuleId, next: boolean) {
    modules[moduleId] = next;
    if (next) {
      for (const dependency of COMMUNITY_MODULE_CATALOG.find((item) => item.id === moduleId)!.dependencies) change(dependency, true);
    } else {
      for (const dependent of COMMUNITY_MODULE_CATALOG.filter((item) => item.dependencies.includes(moduleId))) change(dependent.id, false);
    }
  }
  change(id, enabled);
  return { ...configuration, modules };
}

export function applyCommunityTemplate(configuration: CommunitySiteConfig, templateId: CommunityTemplateId): CommunitySiteConfig {
  const template = COMMUNITY_TEMPLATES.find((item) => item.id === templateId);
  if (!template) invalid("templateId", "지원하지 않는 테마입니다.");
  return { ...configuration, templateId, homeSections: [...template.homeSections] };
}

export function getVisibleCommunityHomeSections(configuration: CommunitySiteConfig) {
  return configuration.homeSections.flatMap((id) => {
    const section = COMMUNITY_HOME_SECTIONS.find((item) => item.id === id);
    return section && (!section.module || configuration.modules[section.module]) ? [section] : [];
  });
}

export function toCommunityPublicFeatureFlags(configuration: CommunitySiteConfig): PublicFeatureFlags {
  return {
    registrations: configuration.modules.members, matchSubmissions: configuration.modules.matches,
    teamBalance: configuration.modules.teamBalance, kakaoHelp: configuration.modules.kakaoHelp,
    riotIntegration: configuration.modules.riotIntegration, aiAssistant: false,
  };
}

/** Choose a readable foreground for accent buttons; body text does not use the accent. */
export function communityAccentForeground(color: string): "#101828" | "#000000" | "#FFFFFF" {
  if (!/^#[\da-f]{6}$/i.test(color)) return "#FFFFFF";
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  if (1.05 / (luminance + 0.05) >= 4.5) return "#FFFFFF";
  // Near the middle of the luminance range, tinted dark text can fail AA too.
  // Pure black guarantees a readable fallback whenever white is below 4.5:1.
  const darkChannels = [16, 24, 40].map((value) => ((value / 255 + 0.055) / 1.055) ** 2.4);
  const darkLuminance = darkChannels[0] * 0.2126 + darkChannels[1] * 0.7152 + darkChannels[2] * 0.0722;
  return (luminance + 0.05) / (darkLuminance + 0.05) >= 4.5 ? "#101828" : "#000000";
}
