type MobileRouteRule = {
  match: "exact" | "prefix" | "numeric" | "numeric-suffix";
  from: string;
  to: string;
  suffix?: string;
};

export const MOBILE_APP_MEDIA_QUERY = "(max-width: 820px)";
export const MOBILE_PC_VIEW_SESSION_KEY = "klol-mobile-pc-view";

export const MOBILE_STANDALONE_EXACT_PATHS = [
  "/install",
  "/discipline",
  "/discipline/evidence",
  "/matches/submit",
  "/recruit-helper",
  "/signup",
  "/forgot-password",
  "/privacy",
  "/terms",
] as const;

export const MOBILE_STANDALONE_PREFIX_PATHS = [
  "/install/",
  "/discipline/evidence/",
  "/matches/submit/",
] as const;

const MOBILE_ROUTE_RULES: readonly MobileRouteRule[] = [
  { match: "exact", from: "/", to: "/app" },
  { match: "exact", from: "", to: "/app" },
  { match: "prefix", from: "/admin", to: "/app/admin" },
  { match: "prefix", from: "/players/balance", to: "/app" },
  { match: "prefix", from: "/balance", to: "/app" },
  { match: "prefix", from: "/random-team", to: "/app/random-team" },
  { match: "prefix", from: "/coin-toss", to: "/app/coin-toss" },
  { match: "numeric", from: "/players", to: "/app/players" },
  { match: "exact", from: "/players", to: "/app/players" },
  { match: "prefix", from: "/players/", to: "/app/players" },
  { match: "numeric", from: "/matches", to: "/app/matches" },
  { match: "exact", from: "/matches", to: "/app/matches" },
  { match: "prefix", from: "/matches/", to: "/app/matches" },
  { match: "exact", from: "/rankings", to: "/app/rankings" },
  { match: "prefix", from: "/ai-balance", to: "/app/rankings" },
  { match: "numeric", from: "/progress/event", to: "/app/progress/event" },
  { match: "numeric", from: "/participation/event", to: "/app/progress/event" },
  { match: "numeric-suffix", from: "/progress/destruction", to: "/app/progress/destruction", suffix: "/mvp-vote" },
  { match: "numeric", from: "/progress/destruction", to: "/app/progress/destruction" },
  { match: "numeric", from: "/participation/destruction", to: "/app/progress/destruction" },
  { match: "exact", from: "/recruit", to: "/app/recruits" },
  { match: "prefix", from: "/recruit/", to: "/app/recruits" },
  { match: "prefix", from: "/kakao", to: "/app/recruits" },
  { match: "prefix", from: "/progress", to: "/app/matches?tab=events" },
  { match: "prefix", from: "/participation", to: "/app/matches?tab=events" },
  { match: "prefix", from: "/riot-api", to: "/app/me" },
  { match: "prefix", from: "/account", to: "/app/me" },
  { match: "prefix", from: "/me", to: "/app/me" },
  { match: "prefix", from: "/login", to: "/app/login" },
];

function appendSearch(target: string, search?: string) {
  const normalized = search?.replace(/^\?/, "") ?? "";
  if (!normalized) return target;
  return target.includes("?") ? `${target}&${normalized}` : `${target}?${normalized}`;
}

export function isMobileStandalonePath(pathname: string) {
  return (
    MOBILE_STANDALONE_EXACT_PATHS.includes(
      pathname as (typeof MOBILE_STANDALONE_EXACT_PATHS)[number],
    ) || MOBILE_STANDALONE_PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix))
  );
}

function resolveMobileRoute(pathname: string) {
  if (pathname.startsWith("/app")) return pathname;

  for (const rule of MOBILE_ROUTE_RULES) {
    if (rule.match === "exact" && pathname === rule.from) return rule.to;
    if (rule.match === "prefix" && pathname.startsWith(rule.from)) return rule.to;
    if (rule.match === "numeric") {
      const escapedPrefix = rule.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const detail = pathname.match(new RegExp(`^${escapedPrefix}/(\\d+)(?:/|$)`));
      if (detail) return `${rule.to}/${detail[1]}`;
    }
    if (rule.match === "numeric-suffix" && rule.suffix) {
      const escapedPrefix = rule.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedSuffix = rule.suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const detail = pathname.match(new RegExp(`^${escapedPrefix}/(\\d+)${escapedSuffix}(?:/|$)`));
      if (detail) return `${rule.to}/${detail[1]}${rule.suffix}`;
    }
  }

  return "/app";
}

export function toMobileAppPath(pathname: string, search?: string) {
  if (isMobileStandalonePath(pathname)) return appendSearch(pathname, search);
  return appendSearch(resolveMobileRoute(pathname), search);
}

export function createMobileAppBootScript() {
  const exactPaths = JSON.stringify(MOBILE_STANDALONE_EXACT_PATHS);
  const prefixPaths = JSON.stringify(MOBILE_STANDALONE_PREFIX_PATHS);
  const routeRules = JSON.stringify(MOBILE_ROUTE_RULES);

  return `
(() => {
  try {
    const pathname = window.location.pathname || "/";
    if (pathname.startsWith("/app")) return;
    const standaloneExact = ${exactPaths};
    const standalonePrefixes = ${prefixPaths};
    if (standaloneExact.includes(pathname) || standalonePrefixes.some((prefix) => pathname.startsWith(prefix))) return;
    if (!window.matchMedia(${JSON.stringify(MOBILE_APP_MEDIA_QUERY)}).matches) return;
    if (window.sessionStorage.getItem(${JSON.stringify(MOBILE_PC_VIEW_SESSION_KEY)}) === "1") return;

    const rules = ${routeRules};
    let target = "/app";
    for (const rule of rules) {
      if (rule.match === "exact" && pathname === rule.from) {
        target = rule.to;
        break;
      }
      if (rule.match === "prefix" && pathname.startsWith(rule.from)) {
        target = rule.to;
        break;
      }
      if (rule.match === "numeric") {
        const rest = pathname.slice(rule.from.length);
        const detail = rest.match(/^\\/(\\d+)(?:\\/|$)/);
        if (detail) {
          target = rule.to + "/" + detail[1];
          break;
        }
      }
      if (rule.match === "numeric-suffix" && rule.suffix) {
        const rest = pathname.slice(rule.from.length);
        const detail = rest.match(/^\\/(\\d+)(\\/[^?#]*)/);
        if (detail && detail[2] === rule.suffix) {
          target = rule.to + "/" + detail[1] + rule.suffix;
          break;
        }
      }
    }

    const search = window.location.search.slice(1);
    if (search) target += target.includes("?") ? "&" + search : "?" + search;
    window.location.replace(target);
  } catch {
    if (!window.location.pathname.startsWith("/app")) window.location.replace("/app");
  }
})();
`;
}
