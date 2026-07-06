export const RIOT_FEATURE_DISABLED_MESSAGE =
  "Riot 연동 기능은 Production API 승인 전까지 비활성화되어 있습니다.";

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

export function isRiotFeatureEnabled() {
  const rawValue = process.env.RIOT_FEATURE_ENABLED ?? "false";
  return TRUE_VALUES.has(rawValue.trim().toLowerCase());
}

export function getRiotFeatureStatus() {
  return {
    enabled: isRiotFeatureEnabled(),
    message: isRiotFeatureEnabled()
      ? "Riot 연동 기능이 활성화되어 있습니다."
      : RIOT_FEATURE_DISABLED_MESSAGE,
  };
}

export function getRiotFeatureDisabledPayload() {
  return {
    message: RIOT_FEATURE_DISABLED_MESSAGE,
    code: "RIOT_FEATURE_DISABLED",
    enabled: false,
  };
}

export function assertRiotFeatureEnabled() {
  if (!isRiotFeatureEnabled()) {
    throw new Error("RIOT_FEATURE_DISABLED");
  }
}

export function getRiotPlatformRegion() {
  return (process.env.RIOT_PLATFORM || process.env.RIOT_LOL_REGION || "kr")
    .trim()
    .toLowerCase();
}

export function getRiotRegionalRoute() {
  return (process.env.RIOT_REGION || process.env.RIOT_ACCOUNT_REGION || "asia")
    .trim()
    .toLowerCase();
}

export function getRiotMatchFetchLimit() {
  const value = Number(process.env.RIOT_MATCH_FETCH_LIMIT ?? 20);

  if (!Number.isFinite(value) || value <= 0) {
    return 20;
  }

  return Math.min(Math.floor(value), 100);
}
