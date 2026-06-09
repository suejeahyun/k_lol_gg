import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

export type DiscordOperationSettings = {
  autoFinishEnabled: boolean;
  autoFinishHoldMinutes: number;
  watchAllVoiceChannels: boolean;
  watchChannelIds: string[];
  watchCategoryIds: string[];
  adminLogChannelId: string | null;
  noticeChannelId: string | null;
  recruitLogChannelId: string | null;
  approvedRoleId: string | null;
  topRoleId: string | null;
  jglRoleId: string | null;
  midRoleId: string | null;
  adcRoleId: string | null;
  supRoleId: string | null;
  heartbeatIntervalSeconds: number;
  staleHeartbeatSeconds: number;
};

export const DEFAULT_DISCORD_OPERATION_SETTINGS: DiscordOperationSettings = {
  autoFinishEnabled: true,
  autoFinishHoldMinutes: Number(process.env.DISCORD_AUTO_FINISH_HOLD_MINUTES || 10),
  watchAllVoiceChannels: process.env.DISCORD_WATCH_ALL_VOICE_CHANNELS === "true",
  watchChannelIds: splitEnv(process.env.DISCORD_WATCH_CHANNEL_IDS),
  watchCategoryIds: splitEnv(process.env.DISCORD_WATCH_CATEGORY_IDS),
  adminLogChannelId: process.env.DISCORD_ADMIN_LOG_CHANNEL_ID || null,
  noticeChannelId: process.env.DISCORD_NOTICE_CHANNEL_ID || null,
  recruitLogChannelId: process.env.DISCORD_RECRUIT_LOG_CHANNEL_ID || null,
  approvedRoleId: process.env.DISCORD_APPROVED_ROLE_ID || null,
  topRoleId: process.env.DISCORD_TOP_ROLE_ID || null,
  jglRoleId: process.env.DISCORD_JGL_ROLE_ID || null,
  midRoleId: process.env.DISCORD_MID_ROLE_ID || null,
  adcRoleId: process.env.DISCORD_ADC_ROLE_ID || null,
  supRoleId: process.env.DISCORD_SUP_ROLE_ID || null,
  heartbeatIntervalSeconds: 60,
  staleHeartbeatSeconds: 180,
};

function splitEnv(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return splitEnv(value);
  return [];
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export function normalizeDiscordOperationSettings(value: Partial<DiscordOperationSettings> | Record<string, unknown>): DiscordOperationSettings {
  return {
    autoFinishEnabled: normalizeBoolean(value.autoFinishEnabled, DEFAULT_DISCORD_OPERATION_SETTINGS.autoFinishEnabled),
    autoFinishHoldMinutes: normalizeNumber(value.autoFinishHoldMinutes, DEFAULT_DISCORD_OPERATION_SETTINGS.autoFinishHoldMinutes, 1, 120),
    watchAllVoiceChannels: normalizeBoolean(value.watchAllVoiceChannels, DEFAULT_DISCORD_OPERATION_SETTINGS.watchAllVoiceChannels),
    watchChannelIds: normalizeStringArray(value.watchChannelIds),
    watchCategoryIds: normalizeStringArray(value.watchCategoryIds),
    adminLogChannelId: normalizeNullableString(value.adminLogChannelId),
    noticeChannelId: normalizeNullableString(value.noticeChannelId),
    recruitLogChannelId: normalizeNullableString(value.recruitLogChannelId),
    approvedRoleId: normalizeNullableString(value.approvedRoleId),
    topRoleId: normalizeNullableString(value.topRoleId),
    jglRoleId: normalizeNullableString(value.jglRoleId),
    midRoleId: normalizeNullableString(value.midRoleId),
    adcRoleId: normalizeNullableString(value.adcRoleId),
    supRoleId: normalizeNullableString(value.supRoleId),
    heartbeatIntervalSeconds: normalizeNumber(value.heartbeatIntervalSeconds, DEFAULT_DISCORD_OPERATION_SETTINGS.heartbeatIntervalSeconds, 15, 600),
    staleHeartbeatSeconds: normalizeNumber(value.staleHeartbeatSeconds, DEFAULT_DISCORD_OPERATION_SETTINGS.staleHeartbeatSeconds, 30, 3600),
  };
}

export async function getDiscordOperationSettings(db: typeof prisma | Prisma.TransactionClient = prisma) {
  const record = await db.discordOperationSetting.findUnique({ where: { key: "discord.operation" } }).catch(() => null);
  if (!record) return DEFAULT_DISCORD_OPERATION_SETTINGS;
  const value = record.value && typeof record.value === "object" && !Array.isArray(record.value) ? record.value as Record<string, unknown> : {};
  return normalizeDiscordOperationSettings({ ...DEFAULT_DISCORD_OPERATION_SETTINGS, ...value });
}

export async function saveDiscordOperationSettings(params: { value: Partial<DiscordOperationSettings> | Record<string, unknown>; updatedById?: number | null }) {
  const normalized = normalizeDiscordOperationSettings({ ...DEFAULT_DISCORD_OPERATION_SETTINGS, ...params.value });
  await prisma.discordOperationSetting.upsert({
    where: { key: "discord.operation" },
    create: {
      key: "discord.operation",
      value: normalized as unknown as Prisma.InputJsonValue,
      description: "K-LOL.GG Discord 운영 시스템 설정",
      updatedById: params.updatedById ?? null,
    },
    update: {
      value: normalized as unknown as Prisma.InputJsonValue,
      updatedById: params.updatedById ?? null,
    },
  });
  return normalized;
}
