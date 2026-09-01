export const ADMIN_ROUTE_DECISIONS = ["keep", "integrate", "redirect", "retire"] as const;

export type AdminRouteDecision = (typeof ADMIN_ROUTE_DECISIONS)[number];
export type AdminRouteAccess = "PUBLIC" | "ENROLL" | "ADMIN" | "SUPER" | "MIXED";

export type AdminRouteContract = {
  id: string;
  source: string;
  decision: AdminRouteDecision;
  target: string;
  access: AdminRouteAccess;
};

/**
 * V1 administrator page parity ledger.
 *
 * A route in this list is not automatically implemented. It records where the
 * complete V1 behavior must live in V2 and lets tests detect omissions while
 * each domain slice is implemented from a clean contract.
 */
export const ADMIN_ROUTE_CONTRACTS = [
  { id: "001", source: "/admin/login", decision: "keep", target: "/admin/login", access: "PUBLIC" },
  { id: "002", source: "/admin/security", decision: "keep", target: "/admin/security", access: "ENROLL" },
  { id: "003", source: "/admin", decision: "keep", target: "/admin", access: "MIXED" },
  { id: "004", source: "/admin/site-settings", decision: "keep", target: "/admin/site-settings", access: "SUPER" },
  { id: "005", source: "/admin/ai-requests", decision: "integrate", target: "/admin/logs?view=ai-requests", access: "SUPER" },
  { id: "006", source: "/admin/logs", decision: "keep", target: "/admin/logs", access: "SUPER" },
  { id: "007", source: "/admin/logs/stats", decision: "integrate", target: "/admin/logs?view=stats", access: "SUPER" },
  { id: "008", source: "/admin/logs/kakao", decision: "redirect", target: "/admin/kakao/recruits?tab=logs", access: "ADMIN" },
  { id: "009", source: "/admin/players", decision: "keep", target: "/admin/players", access: "ADMIN" },
  { id: "010", source: "/admin/players/new", decision: "keep", target: "/admin/players/new", access: "ADMIN" },
  { id: "011", source: "/admin/players/[playerId]", decision: "keep", target: "/admin/players/[playerId]", access: "MIXED" },
  { id: "012", source: "/admin/players/[playerId]/edit", decision: "redirect", target: "/admin/players/[playerId]?mode=edit", access: "ADMIN" },
  { id: "013", source: "/admin/players/[playerId]/balance", decision: "integrate", target: "/admin/players/[playerId]?tab=balance", access: "ADMIN" },
  { id: "014", source: "/admin/players/[playerId]/riot", decision: "integrate", target: "/admin/players/[playerId]?tab=riot", access: "MIXED" },
  { id: "015", source: "/admin/player-approvals", decision: "redirect", target: "/admin/users?status=pending", access: "ADMIN" },
  { id: "016", source: "/admin/users", decision: "keep", target: "/admin/users", access: "MIXED" },
  { id: "017", source: "/admin/users/[userAccountId]", decision: "keep", target: "/admin/users/[userAccountId]", access: "MIXED" },
  { id: "018", source: "/admin/discipline", decision: "keep", target: "/admin/discipline", access: "ADMIN" },
  { id: "019", source: "/admin/discipline/new", decision: "keep", target: "/admin/discipline/new", access: "ADMIN" },
  { id: "020", source: "/admin/discipline/[id]", decision: "keep", target: "/admin/discipline/[id]", access: "MIXED" },
  { id: "021", source: "/admin/operation-forms/warnings", decision: "redirect", target: "/admin/discipline", access: "ADMIN" },
  { id: "022", source: "/admin/matches", decision: "keep", target: "/admin/matches", access: "ADMIN" },
  { id: "023", source: "/admin/matches/new", decision: "keep", target: "/admin/matches/new", access: "ADMIN" },
  { id: "024", source: "/admin/matches/[matchId]/edit", decision: "keep", target: "/admin/matches/[matchId]/edit", access: "ADMIN" },
  { id: "025", source: "/admin/matches/submissions", decision: "integrate", target: "/admin/matches?view=submissions", access: "ADMIN" },
  { id: "026", source: "/admin/matches/[matchId]/ai-review", decision: "integrate", target: "/admin/matches/[matchId]/edit?tab=ai-review", access: "ADMIN" },
  { id: "027", source: "/admin/balance", decision: "keep", target: "/admin/balance", access: "ADMIN" },
  { id: "028", source: "/admin/balance/drafts", decision: "keep", target: "/admin/balance/drafts", access: "ADMIN" },
  { id: "029", source: "/admin/balance/drafts/[draftId]", decision: "keep", target: "/admin/balance/drafts/[draftId]", access: "ADMIN" },
  { id: "030", source: "/admin/balance/drafts/[draftId]/recommendations", decision: "redirect", target: "/admin/balance/drafts/[draftId]?tab=recommendations", access: "ADMIN" },
  { id: "031", source: "/admin/balance/recommendations", decision: "redirect", target: "/admin/balance/drafts?view=recommendations", access: "ADMIN" },
  { id: "032", source: "/admin/balance-ai", decision: "keep", target: "/admin/balance-ai", access: "ADMIN" },
  { id: "033", source: "/admin/balance-ai/players", decision: "integrate", target: "/admin/balance-ai?tab=players", access: "ADMIN" },
  { id: "034", source: "/admin/balance-ai/recalculate", decision: "integrate", target: "/admin/balance-ai?action=recalculate", access: "ADMIN" },
  { id: "035", source: "/admin/balance-ai/reviews", decision: "integrate", target: "/admin/balance-ai?tab=reviews", access: "ADMIN" },
  { id: "036", source: "/admin/balance-ai/reviews/[reviewId]", decision: "integrate", target: "/admin/balance-ai?tab=reviews&review=[reviewId]", access: "ADMIN" },
  { id: "037", source: "/admin/progress", decision: "redirect", target: "/admin/progress/event", access: "ADMIN" },
  { id: "038", source: "/admin/progress/event", decision: "keep", target: "/admin/progress/event", access: "ADMIN" },
  { id: "039", source: "/admin/progress/event/new", decision: "keep", target: "/admin/progress/event/new", access: "ADMIN" },
  { id: "040", source: "/admin/progress/event/[eventId]", decision: "keep", target: "/admin/progress/event/[eventId]", access: "ADMIN" },
  { id: "041", source: "/admin/progress/destruction", decision: "keep", target: "/admin/progress/destruction", access: "ADMIN" },
  { id: "042", source: "/admin/progress/destruction/new", decision: "keep", target: "/admin/progress/destruction/new", access: "ADMIN" },
  { id: "043", source: "/admin/progress/destruction/[tournamentId]", decision: "keep", target: "/admin/progress/destruction/[tournamentId]", access: "ADMIN" },
  { id: "044", source: "/admin/kakao", decision: "keep", target: "/admin/kakao", access: "ADMIN" },
  { id: "045", source: "/admin/kakao/recruits", decision: "keep", target: "/admin/kakao/recruits", access: "MIXED" },
  { id: "046", source: "/admin/kakao/recruits/logs", decision: "integrate", target: "/admin/kakao/recruits?tab=logs", access: "ADMIN" },
  { id: "047", source: "/admin/kakao/recruits/settings", decision: "integrate", target: "/admin/kakao/recruits?tab=health", access: "MIXED" },
  { id: "048", source: "/admin/kakao/scrims", decision: "integrate", target: "/admin/kakao?tab=scrims", access: "ADMIN" },
  { id: "049", source: "/admin/kakao/season-apply", decision: "integrate", target: "/admin/seasons?view=applications", access: "ADMIN" },
  { id: "050", source: "/admin/kakao/settings", decision: "integrate", target: "/admin/kakao?tab=settings", access: "ADMIN" },
  { id: "051", source: "/admin/kakao/stats", decision: "integrate", target: "/admin/kakao?tab=stats", access: "ADMIN" },
  { id: "052", source: "/admin/kakao/operation-forms", decision: "redirect", target: "/admin/operation-forms", access: "ADMIN" },
  { id: "053", source: "/admin/kakao/operation-forms/friends", decision: "redirect", target: "/admin/operation-forms?type=friends", access: "ADMIN" },
  { id: "054", source: "/admin/kakao/operation-forms/leaves", decision: "redirect", target: "/admin/operation-forms?type=leaves", access: "ADMIN" },
  { id: "055", source: "/admin/kakao/operation-forms/meetups", decision: "redirect", target: "/admin/operation-forms?type=meetups", access: "ADMIN" },
  { id: "056", source: "/admin/kakao/operation-forms/suggestions", decision: "redirect", target: "/admin/operation-forms?type=suggestions", access: "ADMIN" },
  { id: "057", source: "/admin/operation-forms", decision: "keep", target: "/admin/operation-forms", access: "ADMIN" },
  { id: "058", source: "/admin/operation-forms/friends", decision: "integrate", target: "/admin/operation-forms?type=friends", access: "ADMIN" },
  { id: "059", source: "/admin/operation-forms/leaves", decision: "integrate", target: "/admin/operation-forms?type=leaves", access: "ADMIN" },
  { id: "060", source: "/admin/operation-forms/meetups", decision: "integrate", target: "/admin/operation-forms?type=meetups", access: "ADMIN" },
  { id: "061", source: "/admin/operation-forms/suggestions", decision: "integrate", target: "/admin/operation-forms?type=suggestions", access: "ADMIN" },
  { id: "062", source: "/admin/operation-forms/[formType]/[id]", decision: "keep", target: "/admin/operation-forms/[formType]/[id]", access: "ADMIN" },
  { id: "063", source: "/admin/recruits", decision: "retire", target: "/admin/kakao/recruits", access: "ADMIN" },
  { id: "064", source: "/admin/champions", decision: "keep", target: "/admin/champions", access: "ADMIN" },
  { id: "065", source: "/admin/champions/new", decision: "keep", target: "/admin/champions/new", access: "ADMIN" },
  { id: "066", source: "/admin/champions/[championId]/edit", decision: "keep", target: "/admin/champions/[championId]/edit", access: "ADMIN" },
  { id: "067", source: "/admin/highlights", decision: "keep", target: "/admin/highlights", access: "ADMIN" },
  { id: "068", source: "/admin/highlights/new", decision: "keep", target: "/admin/highlights/new", access: "ADMIN" },
  { id: "069", source: "/admin/highlights/[highlightId]/edit", decision: "keep", target: "/admin/highlights/[highlightId]/edit", access: "ADMIN" },
  { id: "070", source: "/admin/images", decision: "keep", target: "/admin/images", access: "ADMIN" },
  { id: "071", source: "/admin/images/new", decision: "keep", target: "/admin/images/new", access: "ADMIN" },
  { id: "072", source: "/admin/images/[imageId]/edit", decision: "keep", target: "/admin/images/[imageId]/edit", access: "ADMIN" },
  { id: "073", source: "/admin/seasons", decision: "keep", target: "/admin/seasons", access: "ADMIN" },
  { id: "074", source: "/admin/riot", decision: "keep", target: "/admin/riot", access: "MIXED" },
  { id: "075", source: "/admin/riot/accounts", decision: "integrate", target: "/admin/riot?tab=accounts", access: "MIXED" },
  { id: "076", source: "/admin/riot/accounts/bulk-link", decision: "integrate", target: "/admin/riot?tab=accounts&action=bulk-link", access: "SUPER" },
  { id: "077", source: "/admin/riot/sync", decision: "integrate", target: "/admin/riot?tab=sync", access: "MIXED" },
  { id: "078", source: "/admin/riot/logs", decision: "integrate", target: "/admin/riot?tab=logs", access: "ADMIN" },
  { id: "079", source: "/admin/riot/application", decision: "retire", target: "/docs/operations/riot-production-application", access: "ADMIN" },
  { id: "080", source: "/admin/private-assets", decision: "keep", target: "/admin/private-assets", access: "MIXED" },
  { id: "081", source: "/admin/private-assets/[id]", decision: "keep", target: "/admin/private-assets/[id]", access: "MIXED" },
] as const satisfies readonly AdminRouteContract[];

export function getAdminRouteContract(source: string): AdminRouteContract | undefined {
  return ADMIN_ROUTE_CONTRACTS.find((contract) => contract.source === source);
}
