export const KAKAO_ADMIN_TABS = ["recruits", "scrims", "stats", "settings", "logs", "health"] as const;

export type KakaoAdminTab = (typeof KAKAO_ADMIN_TABS)[number];

const SUPER_ADMIN_TABS: ReadonlySet<KakaoAdminTab> = new Set(["settings", "logs", "health"]);

export function kakaoAdminRequiredRole(tab: KakaoAdminTab): "ADMIN" | "SUPER_ADMIN" {
  return SUPER_ADMIN_TABS.has(tab) ? "SUPER_ADMIN" : "ADMIN";
}

export function parseKakaoAdminTabQuery(
  input: Readonly<Record<string, string | string[] | undefined>>,
): KakaoAdminTab | null {
  const keys = Object.keys(input);
  if (keys.length === 0) return "recruits";
  const value = input.tab;
  if (typeof value !== "string" || !KAKAO_ADMIN_TABS.includes(value as KakaoAdminTab)) return null;
  const tab = value as KakaoAdminTab;
  const allowedKeys = tab === "stats" ? new Set(["tab", "q"]) : new Set(["tab"]);
  if (keys.some((key) => !allowedKeys.has(key))) return null;
  if (input.q !== undefined && typeof input.q !== "string") return null;
  return tab;
}
