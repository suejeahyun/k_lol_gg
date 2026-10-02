const listPaths = new Set([
  "/players", "/matches", "/matches/submissions", "/rankings", "/rankings/mmr", "/competitions", "/competitions/events", "/competitions/destruction", "/images", "/highlights", "/tools/team-balance/drafts",
  "/admin/players", "/admin/users", "/admin/matches", "/admin/seasons/kakao-pending", "/admin/balance/drafts", "/admin/progress/event", "/admin/progress/destruction", "/admin/discipline", "/admin/champions", "/admin/highlights", "/admin/images", "/admin/private-assets", "/admin/operation-forms",
]);
export function isRememberedList(pathname: string) {
  return listPaths.has(pathname) || /^\/admin\/operation-forms\/(friends|leaves|meetups|suggestions)$/.test(pathname);
}
export function safeListReturn(saved: string | null, fallback: string): string {
  if (!saved || !saved.startsWith("/") || saved.startsWith("//") || saved.includes("\\")) return fallback;
  try {
    const target = new URL(saved, "https://navigation.invalid");
    const expected = new URL(fallback, "https://navigation.invalid");
    if (target.origin !== expected.origin || target.pathname !== expected.pathname || !isRememberedList(target.pathname)) return fallback;
    // Explicit task tabs in the fallback must not be replaced with a sibling list.
    for (const key of ["view", "type", "tab"]) if (expected.searchParams.has(key) && target.searchParams.get(key) !== expected.searchParams.get(key)) return fallback;
    return target.pathname + target.search;
  } catch { return fallback; }
}
