import { getNavigationCatalog, getNavigationHref, type NavigationMode } from "../src/lib/navigation/catalog";

const requiredRoutes: Record<NavigationMode, string[]> = {
  user: [
    "/",
    "/recruit",
    "/matches",
    "/rankings",
    "/players",
    "/ai-balance",
    "/players/balance",
    "/players/balance/recommendations",
    "/random-team",
    "/progress",
    "/participation",
    "/coin-toss",
    "/highlights",
    "/images",
    "/me/riot",
    "/account",
    "/install",
    "/kakao",
    "/recruit-helper",
  ],
  admin: [
    "/admin",
    "/admin/matches/new",
    "/admin/matches",
    "/admin/kakao/recruits",
    "/admin/kakao/scrims",
    "/admin/progress",
    "/admin/kakao/season-apply",
    "/admin/players",
    "/admin/users",
    "/admin/discipline",
    "/admin/discipline/new",
    "/admin/kakao/operation-forms",
    "/admin/kakao",
    "/admin/logs/kakao",
    "/admin/riot",
    "/admin/balance-ai",
    "/admin/balance/drafts",
    "/admin/highlights",
    "/admin/images",
    "/admin/site-settings",
    "/admin/kakao/settings",
    "/admin/security",
    "/admin/seasons",
    "/admin/champions",
    "/admin/logs",
  ],
};

const errors: string[] = [];

for (const mode of ["user", "admin"] as const) {
  const catalog = getNavigationCatalog(mode);
  const hrefs = new Set<string>();

  for (const item of catalog) {
    if (hrefs.has(item.href)) errors.push(`${mode}: 중복 메뉴 경로 ${item.href}`);
    hrefs.add(item.href);

    if (!item.label.trim()) errors.push(`${mode}: ${item.href} 메뉴 이름 누락`);
    if (!item.description.trim()) errors.push(`${mode}: ${item.href} 설명 누락`);
    if (!item.section.trim()) errors.push(`${mode}: ${item.href} 분류 누락`);
    if (item.keywords.length === 0) errors.push(`${mode}: ${item.href} 검색어 누락`);

    for (const surface of ["web", "app"] as const) {
      const target = getNavigationHref(item, surface);
      if (!target.startsWith("/")) errors.push(`${mode}: ${item.href} ${surface} 이동 경로 오류 (${target})`);
    }
  }

  for (const route of requiredRoutes[mode]) {
    if (!hrefs.has(route)) errors.push(`${mode}: 필수 메뉴 누락 ${route}`);
  }
}

if (errors.length > 0) {
  console.error("전체 메뉴 카탈로그 점검 실패:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("전체 메뉴 카탈로그 점검 완료");
