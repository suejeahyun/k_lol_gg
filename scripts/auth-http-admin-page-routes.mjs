import { readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ADMIN_LOGIN_PAGE_ROUTE = "/admin/login";

export const ADMIN_SECURITY_PAGE_CASE = Object.freeze({
  canonicalRoute: "/admin/security",
  requestPath: "/admin/security",
});

const defaultAppRoot = fileURLToPath(new URL("../src/app", import.meta.url));
const NON_CANONICAL_ADMIN_PAGE_ROUTES = new Set([
  "/admin/ai-requests",
  "/admin/kakao/operation-forms",
  "/admin/kakao/operation-forms/[formType]",
  "/admin/operation-forms/[formType]",
  "/admin/operation-forms/warnings",
  "/admin/recruits",
]);

const REQUEST_SEGMENT_FIXTURES = Object.freeze({
  championId: "Ahri",
  draftId: "00000000-0000-4000-8000-000000000003",
  eventId: "00000000-0000-4000-8000-000000000004",
  formType: "friends",
  highlightId: "00000000-0000-4000-8000-000000000005",
  id: "00000000-0000-4000-8000-000000000006",
  imageId: "00000000-0000-4000-8000-000000000007",
  matchId: "00000000-0000-4000-8000-000000000008",
  playerId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000009",
  submissionId: "00000000-0000-4000-8000-000000000010",
  tournamentId: "00000000-0000-4000-8000-000000000011",
  userAccountId: "00000000-0000-4000-8000-000000000002",
});

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

function requestPathForCanonicalRoute(canonicalRoute) {
  return canonicalRoute.replace(/\[([^/]+)\]/g, (_, parameter) => {
    const fixture = REQUEST_SEGMENT_FIXTURES[parameter];
    if (!fixture) throw new Error(`Missing administrator auth fixture for [${parameter}].`);
    return fixture;
  });
}

function collectPagePathsSync(directory, pagePaths = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectPagePathsSync(entryPath, pagePaths);
    else if (entry.isFile() && entry.name === "page.tsx") pagePaths.push(entryPath);
  }
  return pagePaths;
}

function discoverCanonicalAdminPageRoutesSync(appRoot = defaultAppRoot) {
  return [...new Set(
    collectPagePathsSync(appRoot)
      .map((pagePath) => canonicalRouteForPage(appRoot, pagePath))
      .filter((route) => (route === "/admin" || route?.startsWith("/admin/")) && !NON_CANONICAL_ADMIN_PAGE_ROUTES.has(route)),
  )].sort();
}

export async function discoverCanonicalAdminPageRoutes(appRoot = defaultAppRoot) {
  const pagePaths = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && entry.name === "page.tsx") pagePaths.push(entryPath);
    }
  }

  await visit(appRoot);
  return [...new Set(
    pagePaths
      .map((pagePath) => canonicalRouteForPage(appRoot, pagePath))
      .filter((route) => (route === "/admin" || route?.startsWith("/admin/")) && !NON_CANONICAL_ADMIN_PAGE_ROUTES.has(route)),
  )].sort();
}

export const PROTECTED_ADMIN_PAGE_CASES = Object.freeze(
  discoverCanonicalAdminPageRoutesSync()
    .filter((canonicalRoute) => ![ADMIN_LOGIN_PAGE_ROUTE, ADMIN_SECURITY_PAGE_CASE.canonicalRoute].includes(canonicalRoute))
    .map((canonicalRoute) => Object.freeze({
      canonicalRoute,
      requestPath: requestPathForCanonicalRoute(canonicalRoute),
    })),
);
