import type { PublicFeatureFlags, SiteSettingsPatch } from "../domain/site-settings";

const settingKeys = new Set(["brandName", "tagline", "supportUrl", "features", "aiAllowedRoles", "aiRequestsPerHour", "aiDailyCostLimitMicros", "internalMaintenanceNote"]);
const featureKeys = new Set<keyof PublicFeatureFlags>(["registrations", "matchSubmissions", "teamBalance", "kakaoHelp", "riotIntegration", "aiAssistant"]);
const roles = new Set(["USER", "ADMIN", "SUPER_ADMIN"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseSiteSettingsPatch(value: unknown): SiteSettingsPatch | null {
  const input = record(value);
  if (!input || Object.keys(input).length < 1 || Object.keys(input).some((key) => !settingKeys.has(key))) return null;
  if (input.brandName !== undefined && typeof input.brandName !== "string") return null;
  if (input.tagline !== undefined && typeof input.tagline !== "string") return null;
  if (input.supportUrl !== undefined && input.supportUrl !== null && typeof input.supportUrl !== "string") return null;
  if (input.internalMaintenanceNote !== undefined && input.internalMaintenanceNote !== null && typeof input.internalMaintenanceNote !== "string") return null;
  if (input.aiRequestsPerHour !== undefined && !Number.isSafeInteger(input.aiRequestsPerHour)) return null;
  if (input.aiDailyCostLimitMicros !== undefined && !Number.isSafeInteger(input.aiDailyCostLimitMicros)) return null;
  if (input.aiAllowedRoles !== undefined && (!Array.isArray(input.aiAllowedRoles) || input.aiAllowedRoles.some((role) => typeof role !== "string" || !roles.has(role)))) return null;
  let features: Partial<PublicFeatureFlags> | undefined;
  if (input.features !== undefined) {
    const featureInput = record(input.features);
    if (!featureInput || Object.keys(featureInput).some((key) => !featureKeys.has(key as keyof PublicFeatureFlags)) || Object.values(featureInput).some((item) => typeof item !== "boolean")) return null;
    features = featureInput as Partial<PublicFeatureFlags>;
  }
  return {
    ...(input.brandName !== undefined ? { brandName: input.brandName as string } : {}),
    ...(input.tagline !== undefined ? { tagline: input.tagline as string } : {}),
    ...(input.supportUrl !== undefined ? { supportUrl: input.supportUrl as string | null } : {}),
    ...(features !== undefined ? { features } : {}),
    ...(input.aiAllowedRoles !== undefined ? { aiAllowedRoles: input.aiAllowedRoles as SiteSettingsPatch["aiAllowedRoles"] } : {}),
    ...(input.aiRequestsPerHour !== undefined ? { aiRequestsPerHour: input.aiRequestsPerHour as number } : {}),
    ...(input.aiDailyCostLimitMicros !== undefined ? { aiDailyCostLimitMicros: input.aiDailyCostLimitMicros as number } : {}),
    ...(input.internalMaintenanceNote !== undefined ? { internalMaintenanceNote: input.internalMaintenanceNote as string | null } : {}),
  };
}

export function parseAiRequestBody(value: unknown): Readonly<{ prompt: string }> | null {
  const input = record(value);
  return input && Object.keys(input).length === 1 && typeof input.prompt === "string" ? { prompt: input.prompt } : null;
}

export function parseCleanupBody(value: unknown): Readonly<{ retentionDays: number }> | null {
  const input = record(value);
  return input && Object.keys(input).length === 1 && Number.isSafeInteger(input.retentionDays)
    ? { retentionDays: input.retentionDays as number }
    : null;
}
