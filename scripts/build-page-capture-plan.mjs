import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DESKTOP_VIEWPORT = Object.freeze({
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

export const MOBILE_VIEWPORT = Object.freeze({
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});

const QUERY_VARIANTS = Object.freeze({
  "/account": [
    { label: "player", query: { tab: "player" } },
  ],
  "/admin/balance-ai": [
    { label: "players", query: { tab: "players" } },
    { label: "reviews", query: { tab: "reviews" } },
  ],
  "/admin/discipline": [
    { label: "tasks", query: { tab: "tasks" } },
    { label: "reviews", query: { tab: "reviews" } },
  ],
  "/admin/kakao": [
    { label: "scrims", query: { tab: "scrims" } },
    { label: "stats", query: { tab: "stats" } },
    { label: "settings", query: { tab: "settings" } },
    { label: "logs", query: { tab: "logs" } },
    { label: "health", query: { tab: "health" } },
  ],
  "/admin/logs": [
    { label: "stats", query: { view: "stats" } },
    { label: "ai-requests", query: { view: "ai-requests" } },
  ],
  "/admin/matches": [
    { label: "submissions", query: { view: "submissions" } },
  ],
  "/admin/matches/[matchId]": [
    { label: "ai-review", query: { tab: "ai-review" } },
  ],
  "/admin/operation-forms": [
    { label: "friends", query: { type: "friends" } },
    { label: "leaves", query: { type: "leaves" } },
    { label: "meetups", query: { type: "meetups" } },
    { label: "suggestions", query: { type: "suggestions" } },
  ],
  "/admin/private-assets": [
    { label: "ready", query: { status: "READY" } },
    { label: "cleanup", query: { status: "DELETE_PENDING" } },
  ],
  "/admin/players/[playerId]": [
    { label: "edit", query: { mode: "edit" } },
    { label: "balance", query: { tab: "balance" } },
    { label: "riot", query: { tab: "riot" } },
  ],
  "/admin/riot": [
    { label: "sync", query: { tab: "sync" } },
    { label: "logs", query: { tab: "logs" } },
  ],
  "/players/[playerId]": [
    { label: "riot", query: { tab: "riot" } },
  ],
  "/tools/random-team": [
    { label: "tier", query: { mode: "tier" } },
  ],
});

const KEY_MOBILE_ROUTES = new Set([
  "/",
  "/account",
  "/admin",
  "/admin/balance-ai",
  "/admin/kakao",
  "/admin/matches",
  "/admin/operation-forms",
  "/admin/players",
  "/admin/private-assets",
  "/admin/progress/destruction",
  "/admin/progress/event",
  "/admin/riot",
  "/applications",
  "/competitions",
  "/competitions/destruction/[tournamentId]",
  "/competitions/events/[eventId]",
  "/highlights",
  "/images",
  "/matches",
  "/matches/[matchId]",
  "/players",
  "/players/[playerId]",
  "/rankings",
  "/tools/coin-toss",
  "/tools/random-team",
  "/tools/team-balance",
]);

const REDIRECT_DESTINATION_FALLBACKS = Object.freeze({
  "/app": "/",
  "/app/players": "/players",
});

function isRouteGroup(segment) {
  return segment.startsWith("(") && segment.endsWith(")");
}

function isPrivateTree(segments) {
  return segments.some((segment) => segment.startsWith("_") || segment.startsWith("@"));
}

export function pageFileToRoute(pageFile, appDirectory) {
  const relativeFile = relative(resolve(appDirectory), resolve(pageFile));
  if (relativeFile.startsWith("..") || relativeFile === "") {
    throw new Error(`Page file is outside the App Router directory: ${pageFile}`);
  }
  const segments = relativeFile.split(sep);
  if (segments.at(-1) !== "page.tsx") {
    throw new Error(`Expected an App Router page.tsx file: ${pageFile}`);
  }
  segments.pop();
  if (isPrivateTree(segments)) return null;
  const routeSegments = segments.filter((segment) => !isRouteGroup(segment));
  return routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else if (entry.isFile() && entry.name === "page.tsx") files.push(entryPath);
  }
  return files;
}

function redirectExpectation(source, route) {
  const hasRedirect = /\b(?:permanentRedirect|redirect)\s*\(/u.test(source);
  const hasJsx = /\breturn\s*(?:\(\s*)?<\w/u.test(source);
  if (!hasRedirect || hasJsx) return null;
  const literal = source.match(/\b(?:permanentRedirect|redirect)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/u);
  return {
    status: /\bpermanentRedirect\s*\(/u.test(source) ? 308 : 307,
    destination: literal?.[1] ?? REDIRECT_DESTINATION_FALLBACKS[route] ?? null,
  };
}

export async function discoverAppPages(appDirectory) {
  const appRoot = resolve(appDirectory);
  const pageFiles = await walk(appRoot);
  const pages = [];
  for (const pageFile of pageFiles) {
    const route = pageFileToRoute(pageFile, appRoot);
    if (route === null) continue;
    const sourcePage = relative(appRoot, pageFile).split(sep).join("/");
    const source = await readFile(pageFile, "utf8");
    pages.push({ route, sourcePage, expectedRedirect: redirectExpectation(source, route) });
  }
  pages.sort((left, right) => left.route.localeCompare(right.route, "en"));
  const routeOwners = new Map();
  for (const page of pages) {
    const prior = routeOwners.get(page.route);
    if (prior) throw new Error(`Canonical route collision at ${page.route}: ${prior}, ${page.sourcePage}`);
    routeOwners.set(page.route, page.sourcePage);
  }
  return pages;
}

export function dynamicParameters(route) {
  const parameters = [];
  for (const segment of route.split("/")) {
    const optionalCatchAll = segment.match(/^\[\[\.\.\.([^\]]+)\]\]$/u);
    const catchAll = segment.match(/^\[\.\.\.([^\]]+)\]$/u);
    const single = segment.match(/^\[([^\]]+)\]$/u);
    const name = optionalCatchAll?.[1] ?? catchAll?.[1] ?? single?.[1];
    if (!name) continue;
    parameters.push({ name, segment, catchAll: Boolean(optionalCatchAll || catchAll) });
  }
  return parameters;
}

function fixtureValue(fixtures, route, parameter) {
  const routeFixtures = fixtures.routes?.[route];
  if (routeFixtures !== undefined && (typeof routeFixtures !== "object" || routeFixtures === null || Array.isArray(routeFixtures))) {
    throw new Error(`Fixture routes[${JSON.stringify(route)}] must be an object keyed by parameter name.`);
  }
  return routeFixtures?.[parameter] ?? fixtures.parameters?.[parameter] ?? fixtures[parameter];
}

function encodeFixture(value, route, parameter, catchAll) {
  const values = Array.isArray(value) ? value : catchAll && typeof value === "string" ? value.split("/") : [value];
  if (values.length === 0 || values.some((item) => typeof item !== "string" && typeof item !== "number")) {
    throw new Error(`Fixture for ${route} parameter ${parameter} must be a non-empty string, number, or catch-all array.`);
  }
  const normalized = values.map((item) => String(item));
  if (normalized.some((item) => item.length === 0 || /\{\{|\}\}|\[|\]|[?#]/u.test(item))) {
    throw new Error(`Fixture for ${route} parameter ${parameter} is not a concrete path value.`);
  }
  if (!catchAll && normalized.some((item) => item.includes("/"))) {
    throw new Error(`Fixture for ${route} parameter ${parameter} cannot contain a slash.`);
  }
  return normalized.map(encodeURIComponent).join("/");
}

export function resolveDynamicRoute(route, fixtures) {
  let resolvedRoute = route;
  for (const { name, segment, catchAll } of dynamicParameters(route)) {
    const value = fixtureValue(fixtures, route, name);
    if (value === undefined || value === null) {
      throw new Error(`Missing fixture for dynamic route ${route}: provide routes[${JSON.stringify(route)}].${name} or parameters.${name}.`);
    }
    resolvedRoute = resolvedRoute.replace(segment, encodeFixture(value, route, name, catchAll));
  }
  if (/\[[^\]]+\]|\{\{[^}]+\}\}/u.test(resolvedRoute)) {
    throw new Error(`Dynamic placeholder remains after resolving ${route}: ${resolvedRoute}`);
  }
  return resolvedRoute;
}

export function classifyRoute(route) {
  if (route === "/admin/login") return { group: "admin-auth", session: "anonymous" };
  if (route === "/admin/security") return { group: "admin-auth", session: "setup" };
  if (route === "/admin" || route.startsWith("/admin/")) return { group: "admin", session: "admin" };
  if (route === "/account" || route.startsWith("/account/")) return { group: "account", session: "account" };
  if (
    route === "/applications" ||
    route === "/matches/submit" ||
    route === "/matches/submissions" ||
    route === "/tools/team-balance" ||
    route.startsWith("/tools/team-balance/")
  ) return { group: "account", session: "account" };
  return { group: "public", session: "anonymous" };
}

function withQuery(path, query) {
  const url = new URL(path, "https://capture-plan.invalid");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function planEntry({ page, path, label, viewportName, viewport, captureKind }) {
  const access = classifyRoute(page.route);
  const routeKind = page.expectedRedirect ? "redirect" : "page";
  return {
    id: `${viewportName}:${path}`,
    name: `${viewportName} ${page.route}${label ? ` · ${label}` : ""}`,
    path,
    group: access.group,
    session: access.session,
    captureKind,
    routeKind,
    routeTemplate: page.route,
    ...(page.expectedRedirect ? {} : { canonicalRoute: page.route }),
    sourcePage: page.sourcePage,
    ...(page.expectedRedirect ? { expectedRedirect: page.expectedRedirect } : {}),
    viewport,
  };
}

export function buildCapturePlan(pages, fixtures) {
  if (!fixtures || typeof fixtures !== "object" || Array.isArray(fixtures)) {
    throw new Error("Fixtures must be a JSON object.");
  }
  const resolvedPaths = new Map();
  for (const page of pages) resolvedPaths.set(page.route, resolveDynamicRoute(page.route, fixtures));

  const canonicalPages = pages.filter((page) => !page.expectedRedirect);
  const aliasPages = pages.filter((page) => page.expectedRedirect);
  const desktopPages = canonicalPages.map((page) => planEntry({
    page,
    path: resolvedPaths.get(page.route),
    label: null,
    viewportName: "desktop",
    viewport: DESKTOP_VIEWPORT,
    captureKind: "canonical",
  }));

  const queryVariants = [];
  for (const page of canonicalPages) {
    for (const variant of QUERY_VARIANTS[page.route] ?? []) {
      queryVariants.push(planEntry({
        page,
        path: withQuery(resolvedPaths.get(page.route), variant.query),
        label: variant.label,
        viewportName: "desktop",
        viewport: DESKTOP_VIEWPORT,
        captureKind: "query-variant",
      }));
    }
  }

  const aliasRedirects = aliasPages.map((page) => planEntry({
    page,
    path: resolvedPaths.get(page.route),
    label: "redirect contract",
    viewportName: "desktop",
    viewport: DESKTOP_VIEWPORT,
    captureKind: "alias-redirect",
  }));

  const mobilePages = canonicalPages
    .filter((page) => KEY_MOBILE_ROUTES.has(page.route))
    .map((page) => planEntry({
      page,
      path: resolvedPaths.get(page.route),
      label: null,
      viewportName: "mobile",
      viewport: MOBILE_VIEWPORT,
      captureKind: "key-mobile",
    }));

  const plan = [...desktopPages, ...queryVariants, ...aliasRedirects, ...mobilePages];
  const seen = new Set();
  for (const entry of plan) {
    const targetKey = `${entry.viewport.mobile ? "mobile" : "desktop"}:${entry.path}`;
    if (seen.has(targetKey)) throw new Error(`Duplicate capture target: ${targetKey}`);
    seen.add(targetKey);
  }
  return plan;
}

function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    values.set(key.slice(2), value);
    index += 1;
  }
  return values;
}

async function readFixtures(argument) {
  if (!argument) throw new Error("--fixtures <json-file-or-object> is required.");
  const source = argument.trim().startsWith("{") ? argument : await readFile(resolve(argument), "utf8");
  const fixtures = JSON.parse(source);
  if (!fixtures || typeof fixtures !== "object" || Array.isArray(fixtures)) throw new Error("Fixtures JSON must be an object.");
  return fixtures;
}

export async function main(argv = process.argv.slice(2)) {
  const args = readArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDirectory, "..");
  const appDirectory = resolve(args.get("app-dir") ?? resolve(projectRoot, "src/app"));
  const output = resolve(args.get("output") ?? resolve(projectRoot, "docs/qa-evidence/capture-plan.json"));
  const fixtures = await readFixtures(args.get("fixtures"));
  const pages = await discoverAppPages(appDirectory);
  const plan = buildCapturePlan(pages, fixtures);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`);
  process.stdout.write(`[capture-plan] ${pages.length} page files -> ${plan.length} capture targets at ${output}\n`);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
