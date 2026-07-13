import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

export const SITE_SETTINGS_CACHE_KEY = "site.settings";

export type SiteFeatureKey =
  | "kakao"
  | "recruit"
  | "balanceAi"
  | "randomTeam"
  | "riot"
  | "aiAssistant";

export type SitePlanStatus = "ACTIVE" | "LOCKED";
export type SiteThemePreset = "dark-modern" | "neon-cyber" | "black-gold";

export type SiteSettings = {
  siteName: string;
  roomName: string | null;
  siteLogoUrl: string | null;
  homeBackgroundUrl: string | null;
  themePreset: SiteThemePreset;
  planStatus: SitePlanStatus;
  kakaoEnabled: boolean;
  recruitEnabled: boolean;
  balanceAiEnabled: boolean;
  randomTeamEnabled: boolean;
  riotEnabled: boolean;
  aiAssistantEnabled: boolean;
  billingOwner: string | null;
  trialEndsAt: string | null;
  premiumMemo: string | null;
  premiumNoticeTitle: string;
  premiumNoticeMessage: string;
  supportContact: string | null;
  updatedAt?: string | null;
};

export type PublicSiteSettings = Pick<
  SiteSettings,
  | "siteName"
  | "roomName"
  | "siteLogoUrl"
  | "homeBackgroundUrl"
  | "themePreset"
  | "planStatus"
  | "kakaoEnabled"
  | "recruitEnabled"
  | "balanceAiEnabled"
  | "randomTeamEnabled"
  | "riotEnabled"
  | "aiAssistantEnabled"
>;

function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || "K-LOL.GG",
  roomName: process.env.NEXT_PUBLIC_ROOM_NAME || null,
  siteLogoUrl: process.env.NEXT_PUBLIC_SITE_LOGO_URL || null,
  homeBackgroundUrl:
    process.env.NEXT_PUBLIC_SITE_BACKGROUND_URL ||
    "/images/theme/dark-modern/klol-global-stage-v1.png",
  themePreset: "dark-modern",
  planStatus: envBoolean("SITE_PREMIUM_ACCESS_DEFAULT", true) ? "ACTIVE" : "LOCKED",
  kakaoEnabled: envBoolean("SITE_FEATURE_KAKAO_DEFAULT", true),
  recruitEnabled: envBoolean("SITE_FEATURE_RECRUIT_DEFAULT", true),
  balanceAiEnabled: envBoolean("SITE_FEATURE_BALANCE_AI_DEFAULT", true),
  randomTeamEnabled: envBoolean("SITE_FEATURE_RANDOM_TEAM_DEFAULT", false),
  riotEnabled: envBoolean("SITE_FEATURE_RIOT_DEFAULT", false),
  aiAssistantEnabled: envBoolean("SITE_FEATURE_AI_ASSISTANT_DEFAULT", false),
  billingOwner: null,
  trialEndsAt: null,
  premiumMemo: null,
  premiumNoticeTitle: "프리미엄 기능입니다.",
  premiumNoticeMessage:
    "이 기능은 카카오톡 오픈채팅방 운영 자동화와 K-LOL 랭킹 고급 기능을 포함합니다. 이용을 원하면 방 운영자 또는 슈퍼어드민에게 문의하세요.",
  supportContact: null,
  updatedAt: null,
};

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  if (typeof value === "number") return value === 1;
  return fallback;
}

function normalizeString(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeUrl(value: unknown) {
  const text = normalizeNullableString(value);
  if (!text) return null;
  if (text.startsWith("/") || text.startsWith("https://") || text.startsWith("http://")) {
    return text;
  }
  return null;
}

function normalizePlanStatus(value: unknown, fallback: SitePlanStatus): SitePlanStatus {
  return value === "LOCKED" || value === "ACTIVE" ? value : fallback;
}

function normalizeThemePreset(value: unknown, fallback: SiteThemePreset): SiteThemePreset {
  if (value === "dark-modern" || value === "neon-cyber" || value === "black-gold") return value;
  return fallback;
}

export function normalizeSiteSettings(value: unknown, updatedAt?: Date | string | null): SiteSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    siteName: normalizeString(raw.siteName, DEFAULT_SITE_SETTINGS.siteName),
    roomName: normalizeNullableString(raw.roomName),
    siteLogoUrl: normalizeUrl(raw.siteLogoUrl) ?? DEFAULT_SITE_SETTINGS.siteLogoUrl,
    homeBackgroundUrl: normalizeUrl(raw.homeBackgroundUrl) ?? DEFAULT_SITE_SETTINGS.homeBackgroundUrl,
    themePreset: normalizeThemePreset(raw.themePreset, DEFAULT_SITE_SETTINGS.themePreset),
    planStatus: normalizePlanStatus(raw.planStatus, DEFAULT_SITE_SETTINGS.planStatus),
    kakaoEnabled: normalizeBoolean(raw.kakaoEnabled, DEFAULT_SITE_SETTINGS.kakaoEnabled),
    recruitEnabled: normalizeBoolean(raw.recruitEnabled, DEFAULT_SITE_SETTINGS.recruitEnabled),
    balanceAiEnabled: normalizeBoolean(raw.balanceAiEnabled, DEFAULT_SITE_SETTINGS.balanceAiEnabled),
    randomTeamEnabled: normalizeBoolean(raw.randomTeamEnabled, DEFAULT_SITE_SETTINGS.randomTeamEnabled),
    riotEnabled: normalizeBoolean(raw.riotEnabled, DEFAULT_SITE_SETTINGS.riotEnabled),
    aiAssistantEnabled: normalizeBoolean(raw.aiAssistantEnabled, DEFAULT_SITE_SETTINGS.aiAssistantEnabled),
    billingOwner: normalizeNullableString(raw.billingOwner),
    trialEndsAt: normalizeNullableString(raw.trialEndsAt),
    premiumMemo: normalizeNullableString(raw.premiumMemo),
    premiumNoticeTitle: normalizeString(raw.premiumNoticeTitle, DEFAULT_SITE_SETTINGS.premiumNoticeTitle),
    premiumNoticeMessage: normalizeString(raw.premiumNoticeMessage, DEFAULT_SITE_SETTINGS.premiumNoticeMessage),
    supportContact: normalizeNullableString(raw.supportContact),
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  };
}

export async function getSiteSettings() {
  const record = await prisma.appDataCache
    .findUnique({ where: { key: SITE_SETTINGS_CACHE_KEY } })
    .catch(() => null);

  if (!record) return DEFAULT_SITE_SETTINGS;
  return normalizeSiteSettings(record.value, record.updatedAt);
}

export function getPublicSiteSettings(settings: SiteSettings): PublicSiteSettings {
  return {
    siteName: settings.siteName,
    roomName: settings.roomName,
    siteLogoUrl: settings.siteLogoUrl,
    homeBackgroundUrl: settings.homeBackgroundUrl,
    themePreset: settings.themePreset,
    planStatus: settings.planStatus,
    kakaoEnabled: settings.kakaoEnabled,
    recruitEnabled: settings.recruitEnabled,
    balanceAiEnabled: settings.balanceAiEnabled,
    randomTeamEnabled: settings.randomTeamEnabled,
    riotEnabled: settings.riotEnabled,
    aiAssistantEnabled: settings.aiAssistantEnabled,
  };
}

export function isSitePremiumActive(settings: SiteSettings) {
  return settings.planStatus === "ACTIVE";
}

export function isSiteFeatureEnabled(settings: SiteSettings, feature: SiteFeatureKey) {
  if (!isSitePremiumActive(settings)) return false;
  if (feature === "kakao") return settings.kakaoEnabled;
  if (feature === "recruit") return settings.kakaoEnabled && settings.recruitEnabled;
  if (feature === "balanceAi") return settings.balanceAiEnabled;
  if (feature === "randomTeam") return settings.randomTeamEnabled;
  if (feature === "riot") return settings.riotEnabled;
  return settings.aiAssistantEnabled;
}

export function getSiteFeatureLabel(feature: SiteFeatureKey) {
  if (feature === "kakao") return "카카오톡 운영";
  if (feature === "recruit") return "구인현황";
  if (feature === "balanceAi") return "K-LOL 랭킹";
  if (feature === "randomTeam") return "랜덤 팀 나누기";
  if (feature === "riot") return "Riot 연동";
  return "AI 운영 비서";
}

export async function saveSiteSettings(input: Partial<SiteSettings>) {
  const current = await getSiteSettings();
  const next = normalizeSiteSettings({
    ...current,
    ...input,
  });

  const saved = await prisma.appDataCache.upsert({
    where: { key: SITE_SETTINGS_CACHE_KEY },
    create: {
      key: SITE_SETTINGS_CACHE_KEY,
      value: next as unknown as Prisma.InputJsonValue,
      version: 1,
    },
    update: {
      value: next as unknown as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });

  return normalizeSiteSettings(saved.value, saved.updatedAt);
}
