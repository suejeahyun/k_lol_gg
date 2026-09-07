export const KAKAO_ADMIN_TABS = ["recruits", "scrims", "stats", "settings", "logs", "health"] as const;

export type KakaoAdminTab = (typeof KAKAO_ADMIN_TABS)[number];

export function parseKakaoAdminTabQuery(
  input: Readonly<Record<string, string | string[] | undefined>>,
): KakaoAdminTab | null {
  const keys = Object.keys(input);
  if (keys.length === 0) return "recruits";
  if (keys.length !== 1 || keys[0] !== "tab") return null;
  const value = input.tab;
  return typeof value === "string" && KAKAO_ADMIN_TABS.includes(value as KakaoAdminTab)
    ? value as KakaoAdminTab
    : null;
}
