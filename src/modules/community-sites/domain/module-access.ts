import type { CommunityModuleId, CommunitySiteConfig } from "./site-configuration";

/** Explicit new-work boundaries. GET/history, DELETE/cancel and existing admin work stay available. */
export function communityModuleForNewAction(pathname: string, method: string): CommunityModuleId | null {
  let path: string;
  try { path = decodeURIComponent(pathname).replace(/\/+$/, "") || "/"; } catch { return null; }
  const verb = method.toUpperCase();
  if (verb === "POST") {
    if (path === "/api/recruits" || path === "/api/applications/season") return "recruiting";
    if (/^\/api\/admin\/competitions\/(events|destruction)$/.test(path)) return "competitions";
    if (["/api/me/match-submissions", "/api/admin/matches", "/api/admin/matches/import"].includes(path)) return "matches";
    if (path === "/api/team-tools/drafts" || /^\/api\/(admin\/)?team-tools\/drafts\/[^/]+\/(recommendations|reevaluate)$/.test(path)) return "teamBalance";
    if (["/api/admin/images", "/api/admin/highlights"].includes(path)) return "media";
    if (/^\/api\/(me|admin)\/riot\/(sync|link|bulk-link|bulk|retry)$/.test(path) || path === "/api/me/riot") return "riotIntegration";
  }
  if (verb === "PUT" && /^\/api\/competitions\/(events|destruction)\/[^/]+\/application$/.test(path)) return "competitions";
  // New external requests include the RSO browser redirect and scheduled workers.
  if (["GET", "POST"].includes(verb) && ["/api/me/riot/rso/start", "/api/cron/riot-sync", "/api/internal/jobs/riot-sync", "/api/internal/jobs/riot-api-probe"].includes(path)) return "riotIntegration";
  return null;
}

/** SYNC can add people or create a missing recruit through the compatibility fallback. */
export function isCommunityRecruitingNewWork(command: string): boolean {
  return ["CREATE_PARTY", "CREATE_SCRIM", "SYNC_PARTY", "SYNC_SCRIM", "PARTY_MEMBER_ADD", "ADD_SCRIM_PARTICIPANT", "JOIN_SCRIM", "REOPEN_SCRIM", "RESET_PARTY"].includes(command);
}

export function communityModuleForKakaoCommand(command: string): CommunityModuleId | null {
  if (["PARTY_CREATE", "PARTY_MEMBER_ADD", "PARTY_SNAPSHOT", "INHOUSE_CREATE", "INHOUSE_MEMBER_ADD", "INHOUSE_SNAPSHOT", "SCRIM_CREATE", "SCRIM_MEMBER_ADD", "SCRIM_SNAPSHOT", "SCRIM_LEGACY_JOIN"].includes(command)) return "recruiting";
  if (command === "OPERATIONS_INHOUSE_RESULT") return "matches";
  return null;
}

export function isCommunityModuleActionAllowed(configuration: CommunitySiteConfig, pathname: string, method: string): boolean {
  const moduleId = communityModuleForNewAction(pathname, method);
  return moduleId === null || configuration.modules[moduleId];
}

/** Used for menus, not as an authorization boundary: history URLs remain accessible. */
export function communityModuleForNavigation(href: string): CommunityModuleId | null {
  const path = href.split(/[?#]/, 1)[0];
  if (/^\/(recruits|applications)(\/|$)/.test(path)) return "recruiting";
  if (/^\/competitions(\/|$)/.test(path)) return "competitions";
  if (/^\/matches(\/|$)/.test(path)) return "matches";
  if (/^\/rankings(\/|$)/.test(path)) return "rankings";
  if (/^\/(images|highlights)(\/|$)/.test(path)) return "media";
  if (/^\/tools\/(team-balance|random-team)(\/|$)/.test(path)) return "teamBalance";
  if (path === "/help/kakao") return "kakaoHelp";
  if (path === "/help/riot" || path === "/account/riot") return "riotIntegration";
  return null;
}
