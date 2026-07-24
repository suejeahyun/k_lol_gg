import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type KakaoOperationSettingDelegate = {
  findUnique?: (args: unknown) => Promise<{ value?: unknown } | null>;
  upsert?: (args: unknown) => Promise<unknown>;
};

type KakaoOperationSettingReadDelegate = KakaoOperationSettingDelegate & {
  findUnique: (args: unknown) => Promise<{ value?: unknown } | null>;
};

type KakaoOperationSettingDatabase = {
  kakaoOperationSetting?: KakaoOperationSettingDelegate;
};

export type KakaoOperationSettings = {
  globalEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;

  allowedRoomNames: string[];
  blockedRoomNames: string[];
  blockedSenders: string[];
  ignoreBotSender: boolean;
  botSenderPatterns: string[];

  recruitCommandEnabled: boolean;
  recruitHelpCommandEnabled: boolean;
  recruitCreateCommandEnabled: boolean;
  recruitJoinCommandEnabled: boolean;
  recruitFinishCommandEnabled: boolean;
  recruitStatusCommandEnabled: boolean;

  playerRecordSearchEnabled: boolean;
  recordCommandEnabled: boolean;
  recentCommandEnabled: boolean;
  rankingCommandEnabled: boolean;

  seasonApplyCommandEnabled: boolean;
  seasonSnapshotForwardEnabled: boolean;
  seasonStatusCommandEnabled: boolean;

  operationFormsEnabled: boolean;
  friendApplicationEnabled: boolean;
  leaveRequestEnabled: boolean;
  meetupRecordEnabled: boolean;
  suggestionRequestEnabled: boolean;

  helpCommandEnabled: boolean;
  unknownCommandResponseEnabled: boolean;
  aiNoticeRedirectEnabled: boolean;

  commandCooldownSeconds: number;
  openchatRateLimitPerMinute: number;
  openchatRateLimitWindowSeconds: number;
  recruitStatusMaxVisible: number;
  rankingLimit: number;
  recentGamesLimit: number;
  maxMessageLength: number;

  responsePrefix: string | null;
  disabledFeatureMessage: string;
  blockedRoomMessage: string;
  unknownCommandMessage: string | null;
  notFoundMessage: string;
  errorMessage: string;
  helperLinkTitle: string;
  recruitHelperPath: string;
  recruitPagePath: string;

  defaultRoomName: string | null;
  adminMemo: string | null;
  logRawMessageEnabled: boolean;
  debugReplyEnabled: boolean;
};

export const DEFAULT_KAKAO_OPERATION_SETTINGS: KakaoOperationSettings = {
  globalEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: "[K-LOL.GG]\n현재 카카오톡 봇 기능을 점검 중입니다. 잠시 후 다시 이용해주세요.",

  allowedRoomNames: [],
  blockedRoomNames: [],
  blockedSenders: [],
  ignoreBotSender: true,
  botSenderPatterns: ["K-LOL", "구인구직 도우미", "구인도우미", "오픈채팅봇", "봇"],

  recruitCommandEnabled: true,
  recruitHelpCommandEnabled: true,
  recruitCreateCommandEnabled: true,
  recruitJoinCommandEnabled: true,
  recruitFinishCommandEnabled: true,
  recruitStatusCommandEnabled: true,

  playerRecordSearchEnabled: true,
  recordCommandEnabled: true,
  recentCommandEnabled: true,
  rankingCommandEnabled: true,

  seasonApplyCommandEnabled: true,
  seasonSnapshotForwardEnabled: true,
  seasonStatusCommandEnabled: true,

  operationFormsEnabled: true,
  friendApplicationEnabled: true,
  leaveRequestEnabled: true,
  meetupRecordEnabled: true,
  suggestionRequestEnabled: true,

  helpCommandEnabled: true,
  unknownCommandResponseEnabled: true,
  aiNoticeRedirectEnabled: true,

  commandCooldownSeconds: 0,
  openchatRateLimitPerMinute: 60,
  openchatRateLimitWindowSeconds: 60,
  recruitStatusMaxVisible: 5,
  rankingLimit: 5,
  recentGamesLimit: 5,
  maxMessageLength: 4000,

  responsePrefix: null,
  disabledFeatureMessage: "[K-LOL.GG]\n현재 해당 카카오톡 기능이 관리자 설정에서 중지되어 있습니다.",
  blockedRoomMessage: "[K-LOL.GG]\n현재 이 카카오톡 방에서는 봇 기능을 사용할 수 없습니다.",
  unknownCommandMessage: null,
  notFoundMessage: "검색 결과가 없습니다.\n닉네임#태그를 확인해주세요.",
  errorMessage: "처리 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.",
  helperLinkTitle: "[K-LOL.GG 구인도우미]",
  recruitHelperPath: "/recruit-helper",
  recruitPagePath: "/recruit",

  defaultRoomName: null,
  adminMemo: null,
  logRawMessageEnabled: false,
  debugReplyEnabled: false,
};

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1" || value.toLowerCase() === "on";
  if (typeof value === "number") return value === 1;
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

function normalizeString(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function normalizePath(value: unknown, fallback: string) {
  const text = normalizeString(value, fallback);
  return text.startsWith("/") ? text : `/${text}`;
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return fallback;
}

export function normalizeKakaoOperationSettings(value: Partial<KakaoOperationSettings> | Record<string, unknown>): KakaoOperationSettings {
  const merged = { ...DEFAULT_KAKAO_OPERATION_SETTINGS, ...value } as Record<string, unknown>;

  return {
    globalEnabled: normalizeBoolean(merged.globalEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.globalEnabled),
    maintenanceMode: normalizeBoolean(merged.maintenanceMode, DEFAULT_KAKAO_OPERATION_SETTINGS.maintenanceMode),
    maintenanceMessage: normalizeString(merged.maintenanceMessage, DEFAULT_KAKAO_OPERATION_SETTINGS.maintenanceMessage),

    allowedRoomNames: normalizeStringArray(merged.allowedRoomNames, DEFAULT_KAKAO_OPERATION_SETTINGS.allowedRoomNames),
    blockedRoomNames: normalizeStringArray(merged.blockedRoomNames, DEFAULT_KAKAO_OPERATION_SETTINGS.blockedRoomNames),
    blockedSenders: normalizeStringArray(merged.blockedSenders, DEFAULT_KAKAO_OPERATION_SETTINGS.blockedSenders),
    ignoreBotSender: normalizeBoolean(merged.ignoreBotSender, DEFAULT_KAKAO_OPERATION_SETTINGS.ignoreBotSender),
    botSenderPatterns: normalizeStringArray(merged.botSenderPatterns, DEFAULT_KAKAO_OPERATION_SETTINGS.botSenderPatterns),

    recruitCommandEnabled: normalizeBoolean(merged.recruitCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitCommandEnabled),
    recruitHelpCommandEnabled: normalizeBoolean(merged.recruitHelpCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitHelpCommandEnabled),
    recruitCreateCommandEnabled: normalizeBoolean(merged.recruitCreateCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitCreateCommandEnabled),
    recruitJoinCommandEnabled: normalizeBoolean(merged.recruitJoinCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitJoinCommandEnabled),
    recruitFinishCommandEnabled: normalizeBoolean(merged.recruitFinishCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitFinishCommandEnabled),
    recruitStatusCommandEnabled: normalizeBoolean(merged.recruitStatusCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitStatusCommandEnabled),

    playerRecordSearchEnabled: normalizeBoolean(merged.playerRecordSearchEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.playerRecordSearchEnabled),
    recordCommandEnabled: normalizeBoolean(merged.recordCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.recordCommandEnabled),
    recentCommandEnabled: normalizeBoolean(merged.recentCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.recentCommandEnabled),
    rankingCommandEnabled: normalizeBoolean(merged.rankingCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.rankingCommandEnabled),

    seasonApplyCommandEnabled: normalizeBoolean(merged.seasonApplyCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.seasonApplyCommandEnabled),
    seasonSnapshotForwardEnabled: normalizeBoolean(merged.seasonSnapshotForwardEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.seasonSnapshotForwardEnabled),
    seasonStatusCommandEnabled: normalizeBoolean(merged.seasonStatusCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.seasonStatusCommandEnabled),

    operationFormsEnabled: normalizeBoolean(merged.operationFormsEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.operationFormsEnabled),
    friendApplicationEnabled: normalizeBoolean(merged.friendApplicationEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.friendApplicationEnabled),
    leaveRequestEnabled: normalizeBoolean(merged.leaveRequestEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.leaveRequestEnabled),
    meetupRecordEnabled: normalizeBoolean(merged.meetupRecordEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.meetupRecordEnabled),
    suggestionRequestEnabled: normalizeBoolean(merged.suggestionRequestEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.suggestionRequestEnabled),

    helpCommandEnabled: normalizeBoolean(merged.helpCommandEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.helpCommandEnabled),
    unknownCommandResponseEnabled: normalizeBoolean(merged.unknownCommandResponseEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.unknownCommandResponseEnabled),
    aiNoticeRedirectEnabled: normalizeBoolean(merged.aiNoticeRedirectEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.aiNoticeRedirectEnabled),

    commandCooldownSeconds: normalizeNumber(merged.commandCooldownSeconds, DEFAULT_KAKAO_OPERATION_SETTINGS.commandCooldownSeconds, 0, 300),
    openchatRateLimitPerMinute: normalizeNumber(merged.openchatRateLimitPerMinute, DEFAULT_KAKAO_OPERATION_SETTINGS.openchatRateLimitPerMinute, 1, 300),
    openchatRateLimitWindowSeconds: normalizeNumber(merged.openchatRateLimitWindowSeconds, DEFAULT_KAKAO_OPERATION_SETTINGS.openchatRateLimitWindowSeconds, 10, 3600),
    recruitStatusMaxVisible: normalizeNumber(merged.recruitStatusMaxVisible, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitStatusMaxVisible, 1, 50),
    rankingLimit: normalizeNumber(merged.rankingLimit, DEFAULT_KAKAO_OPERATION_SETTINGS.rankingLimit, 1, 20),
    recentGamesLimit: normalizeNumber(merged.recentGamesLimit, DEFAULT_KAKAO_OPERATION_SETTINGS.recentGamesLimit, 1, 20),
    maxMessageLength: normalizeNumber(merged.maxMessageLength, DEFAULT_KAKAO_OPERATION_SETTINGS.maxMessageLength, 100, 10000),

    responsePrefix: normalizeNullableString(merged.responsePrefix),
    disabledFeatureMessage: normalizeString(merged.disabledFeatureMessage, DEFAULT_KAKAO_OPERATION_SETTINGS.disabledFeatureMessage),
    blockedRoomMessage: normalizeString(merged.blockedRoomMessage, DEFAULT_KAKAO_OPERATION_SETTINGS.blockedRoomMessage),
    unknownCommandMessage: normalizeNullableString(merged.unknownCommandMessage),
    notFoundMessage: normalizeString(merged.notFoundMessage, DEFAULT_KAKAO_OPERATION_SETTINGS.notFoundMessage),
    errorMessage: normalizeString(merged.errorMessage, DEFAULT_KAKAO_OPERATION_SETTINGS.errorMessage),
    helperLinkTitle: normalizeString(merged.helperLinkTitle, DEFAULT_KAKAO_OPERATION_SETTINGS.helperLinkTitle),
    recruitHelperPath: normalizePath(merged.recruitHelperPath, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitHelperPath),
    recruitPagePath: normalizePath(merged.recruitPagePath, DEFAULT_KAKAO_OPERATION_SETTINGS.recruitPagePath),

    defaultRoomName: normalizeNullableString(merged.defaultRoomName),
    adminMemo: normalizeNullableString(merged.adminMemo),
    logRawMessageEnabled: normalizeBoolean(merged.logRawMessageEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.logRawMessageEnabled),
    debugReplyEnabled: normalizeBoolean(merged.debugReplyEnabled, DEFAULT_KAKAO_OPERATION_SETTINGS.debugReplyEnabled),
  };
}

function getDelegate(db: typeof prisma | Prisma.TransactionClient): KakaoOperationSettingReadDelegate | null {
  const delegate = (db as unknown as KakaoOperationSettingDatabase).kakaoOperationSetting;
  if (!delegate || typeof delegate.findUnique !== "function") return null;
  return delegate as KakaoOperationSettingReadDelegate;
}

export async function getKakaoOperationSettings(db: typeof prisma | Prisma.TransactionClient = prisma) {
  const delegate = getDelegate(db);
  if (!delegate) return DEFAULT_KAKAO_OPERATION_SETTINGS;

  const record = await delegate.findUnique({ where: { key: "kakao.operation" } }).catch(() => null);
  if (!record) return DEFAULT_KAKAO_OPERATION_SETTINGS;

  const value = record.value && typeof record.value === "object" && !Array.isArray(record.value) ? record.value as Record<string, unknown> : {};
  return normalizeKakaoOperationSettings(value);
}

export async function saveKakaoOperationSettings(params: {
  value: Partial<KakaoOperationSettings> | Record<string, unknown>;
  updatedById?: number | null;
}) {
  const normalized = normalizeKakaoOperationSettings(params.value);
  const delegate = (prisma as unknown as KakaoOperationSettingDatabase).kakaoOperationSetting;

  if (!delegate || typeof delegate.upsert !== "function") {
    return normalized;
  }
  const upsert = delegate.upsert;

  await upsert({
    where: { key: "kakao.operation" },
    create: {
      key: "kakao.operation",
      value: normalized as unknown as Prisma.InputJsonValue,
      description: "K-LOL.GG KakaoTalk 세부 운영 설정",
      updatedById: params.updatedById ?? null,
    },
    update: {
      value: normalized as unknown as Prisma.InputJsonValue,
      updatedById: params.updatedById ?? null,
    },
  });

  return normalized;
}
