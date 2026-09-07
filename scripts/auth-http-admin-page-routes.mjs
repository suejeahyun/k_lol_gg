import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ADMIN_LOGIN_PAGE_ROUTE = "/admin/login";

export const ADMIN_SECURITY_PAGE_CASE = Object.freeze({
  canonicalRoute: "/admin/security",
  requestPath: "/admin/security",
});

export const PROTECTED_ADMIN_PAGE_CASES = Object.freeze([
  { canonicalRoute: "/admin", requestPath: "/admin" },
  { canonicalRoute: "/admin/balance", requestPath: "/admin/balance" },
  { canonicalRoute: "/admin/champions", requestPath: "/admin/champions" },
  { canonicalRoute: "/admin/discipline", requestPath: "/admin/discipline" },
  { canonicalRoute: "/admin/kakao", requestPath: "/admin/kakao" },
  { canonicalRoute: "/admin/matches", requestPath: "/admin/matches" },
  { canonicalRoute: "/admin/players", requestPath: "/admin/players" },
  {
    canonicalRoute: "/admin/players/[playerId]",
    requestPath: "/admin/players/00000000-0000-4000-8000-000000000001",
  },
  { canonicalRoute: "/admin/players/new", requestPath: "/admin/players/new" },
  { canonicalRoute: "/admin/progress/event", requestPath: "/admin/progress/event" },
  { canonicalRoute: "/admin/riot", requestPath: "/admin/riot" },
  { canonicalRoute: "/admin/search", requestPath: "/admin/search" },
  { canonicalRoute: "/admin/seasons", requestPath: "/admin/seasons" },
  { canonicalRoute: "/admin/users", requestPath: "/admin/users" },
  {
    canonicalRoute: "/admin/users/[userAccountId]",
    requestPath: "/admin/users/00000000-0000-4000-8000-000000000002",
  },
]);

const defaultAppRoot = fileURLToPath(new URL("../src/app", import.meta.url));

function isRouteGroup(segment) {
  return segment.startsWith("(") && segment.endsWith(")");
}

function canonicalRouteForPage(appRoot, pagePath) {
  const relativePagePath = path.relative(appRoot, pagePath);
  const segments = relativePagePath.split(path.sep).slice(0, -1);
  if (segments.some((segment) => segment.startsWith("_"))) return null;

  const routeSegments = segments.filter(
    (segment) => !isRouteGroup(segment) && !segment.startsWith("@"),
  );
  return `/${routeSegments.join("/")}`;
}

export async function discoverCanonicalAdminPageRoutes(appRoot = defaultAppRoot) {
  const pagePaths = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name === "page.tsx") {
        pagePaths.push(entryPath);
      }
    }
  }

  await visit(appRoot);
  return [...new Set(
    pagePaths
      .map((pagePath) => canonicalRouteForPage(appRoot, pagePath))
      .filter((route) => route === "/admin" || route?.startsWith("/admin/")),
  )].sort();
}

