export type PublicFeatureFlags = Readonly<{
  registrations: boolean;
  matchSubmissions: boolean;
  teamBalance: boolean;
  kakaoHelp: boolean;
  riotIntegration: boolean;
  aiAssistant: boolean;
}>;

export type SiteSettings = Readonly<{
  revision: number;
  brandName: string;
  tagline: string;
  supportUrl: string | null;
  features: PublicFeatureFlags;
  aiAllowedRoles: readonly ("USER" | "ADMIN" | "SUPER_ADMIN")[];
  internalMaintenanceNote: string | null;
}>;

export type PublicSiteSettingsDto = Readonly<{
  brandName: string;
  tagline: string;
  supportUrl: string | null;
  features: PublicFeatureFlags;
}>;

function cleanText(value: string, code: string, maximum: number): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function safeSupportUrl(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("INVALID_SUPPORT_URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.href.length > 500) {
    throw new Error("INVALID_SUPPORT_URL");
  }
  return url.href;
}

export function updateSiteSettings(input: Readonly<{
  current: SiteSettings;
  expectedRevision: number;
  patch: Readonly<{
    brandName?: string;
    tagline?: string;
    supportUrl?: string | null;
    features?: Partial<PublicFeatureFlags>;
    aiAllowedRoles?: readonly ("USER" | "ADMIN" | "SUPER_ADMIN")[];
    internalMaintenanceNote?: string | null;
  }>;
}>): SiteSettings {
  if (!Number.isSafeInteger(input.expectedRevision) || input.current.revision !== input.expectedRevision) {
    throw new Error("STALE_SITE_SETTINGS_REVISION");
  }
  const roles = input.patch.aiAllowedRoles
    ? [...new Set(input.patch.aiAllowedRoles)].sort()
    : [...input.current.aiAllowedRoles];
  if (roles.some((role) => !["USER", "ADMIN", "SUPER_ADMIN"].includes(role))) {
    throw new Error("INVALID_AI_ROLE");
  }
  const note = input.patch.internalMaintenanceNote === undefined
    ? input.current.internalMaintenanceNote
    : input.patch.internalMaintenanceNote?.normalize("NFKC").trim() || null;
  if (note && note.length > 2_000) throw new Error("INVALID_MAINTENANCE_NOTE");
  return {
    revision: input.current.revision + 1,
    brandName: input.patch.brandName === undefined
      ? input.current.brandName
      : cleanText(input.patch.brandName, "INVALID_BRAND_NAME", 80),
    tagline: input.patch.tagline === undefined
      ? input.current.tagline
      : cleanText(input.patch.tagline, "INVALID_TAGLINE", 160),
    supportUrl: input.patch.supportUrl === undefined
      ? input.current.supportUrl
      : safeSupportUrl(input.patch.supportUrl),
    features: { ...input.current.features, ...(input.patch.features ?? {}) },
    aiAllowedRoles: roles,
    internalMaintenanceNote: note,
  };
}

/** Explicit public allowlist excludes AI role policy and internal operations notes. */
export function toPublicSiteSettingsDto(settings: SiteSettings): PublicSiteSettingsDto {
  return {
    brandName: settings.brandName,
    tagline: settings.tagline,
    supportUrl: settings.supportUrl,
    features: { ...settings.features },
  };
}

export function authorizeAiRequest(input: Readonly<{
  settings: SiteSettings;
  accountStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | "DELETED";
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  prompt: string;
  usedInWindow: number;
  maximumInWindow: number;
}>): Readonly<{ allowed: true; normalizedPrompt: string }> | Readonly<{ allowed: false; code: string }> {
  if (!input.settings.features.aiAssistant) return { allowed: false, code: "AI_DISABLED" };
  if (input.accountStatus !== "APPROVED") return { allowed: false, code: "ACCOUNT_NOT_APPROVED" };
  if (!input.settings.aiAllowedRoles.includes(input.role)) return { allowed: false, code: "AI_ROLE_FORBIDDEN" };
  if (!Number.isSafeInteger(input.maximumInWindow) || input.maximumInWindow < 1 || input.maximumInWindow > 1_000) {
    return { allowed: false, code: "AI_POLICY_INVALID" };
  }
  if (!Number.isSafeInteger(input.usedInWindow) || input.usedInWindow < 0 || input.usedInWindow >= input.maximumInWindow) {
    return { allowed: false, code: "AI_RATE_LIMITED" };
  }
  const normalizedPrompt = input.prompt.normalize("NFKC").trim();
  if (!normalizedPrompt || normalizedPrompt.length > 2_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalizedPrompt)) {
    return { allowed: false, code: "AI_PROMPT_INVALID" };
  }
  return { allowed: true, normalizedPrompt };
}
