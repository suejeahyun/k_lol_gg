export type KakaoOperationSettingsDto = Readonly<{
  revision: number;
  globalEnabled: boolean;
  maintenanceMode: boolean;
  playerSearchEnabled: boolean;
  seasonApplicationsEnabled: boolean;
  imageReceiveEnabled: boolean;
  recruitingEnabled: boolean;
  scheduledNoticeEnabled: boolean;
  maxMessageLength: number;
  updatedAt: string;
}>;

export type KakaoOperationSettingsPatch = Partial<Omit<KakaoOperationSettingsDto, "revision" | "updatedAt">>;
export type KakaoFeature = "playerSearchEnabled" | "seasonApplicationsEnabled" | "imageReceiveEnabled" | "recruitingEnabled" | "scheduledNoticeEnabled";

export type KakaoRuntimeConfigurationDto = Readonly<{
  currentSigningKeyConfigured: boolean;
  previousSigningKeyConfigured: boolean;
  allowedRoomsConfigured: boolean;
  allowedSendersConfigured: boolean;
  botSenderConfigured: boolean;
}>;

const keys = new Set([
  "globalEnabled", "maintenanceMode", "playerSearchEnabled", "seasonApplicationsEnabled",
  "imageReceiveEnabled", "recruitingEnabled", "scheduledNoticeEnabled", "maxMessageLength",
]);

export function parseKakaoOperationSettingsPatch(value: unknown): KakaoOperationSettingsPatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const actual = Object.keys(input);
  if (actual.length < 1 || actual.some((key) => !keys.has(key))) return null;
  for (const [key, item] of Object.entries(input)) {
    if (key === "maxMessageLength") {
      if (!Number.isSafeInteger(item) || Number(item) < 100 || Number(item) > 10_000) return null;
    } else if (typeof item !== "boolean") return null;
  }
  return Object.freeze({ ...input }) as KakaoOperationSettingsPatch;
}

export function readKakaoRuntimeConfiguration(): KakaoRuntimeConfigurationDto {
  const configured = (value: string | undefined) => Boolean(value?.trim());
  return Object.freeze({
    currentSigningKeyConfigured: configured(process.env.KAKAO_WEBHOOK_SECRET_CURRENT),
    previousSigningKeyConfigured: configured(process.env.KAKAO_WEBHOOK_SECRET_PREVIOUS),
    allowedRoomsConfigured: configured(process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS),
    allowedSendersConfigured: configured(process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS),
    botSenderConfigured: configured(process.env.KAKAO_WEBHOOK_BOT_SENDER_ID),
  });
}

export function isKakaoOperationMessageAllowed(message: string, maximumLength: number) {
  return message.normalize("NFKC").trim().length <= maximumLength;
}
