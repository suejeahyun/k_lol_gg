import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  buildCapturePlan,
  classifyRoute,
  discoverAppPages,
  dynamicParameters,
  main,
  pageFileToRoute,
  resolveDynamicRoute,
} from "../scripts/build-page-capture-plan.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const appDirectory = resolve(projectRoot, "src/app");
const uuidFixture = "11111111-1111-4111-8111-111111111111";

async function syntheticPage(root, relativePath, source = "export default function Page() { return <main />; }") {
  const file = join(root, ...relativePath.split("/"));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source);
  return file;
}

test("route groups are removed while concrete and dynamic segments become canonical URLs", async () => {
  const root = await mkdtemp(join(tmpdir(), "klol-capture-plan-"));
  try {
    const playerPage = await syntheticPage(root, "(public)/(registry)/players/[playerId]/page.tsx");
    await syntheticPage(root, "(admin)/admin/page.tsx");
    await syntheticPage(root, "_private/hidden/page.tsx");
    assert.equal(pageFileToRoute(playerPage, root), "/players/[playerId]");
    assert.deepEqual((await discoverAppPages(root)).map((page) => page.route), ["/admin", "/players/[playerId]"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("route fixtures override parameter fixtures and every missing dynamic fixture fails immediately", () => {
  const fixtures = {
    parameters: { playerId: "global-player" },
    routes: { "/players/[playerId]": { playerId: "route-player" } },
  };
  assert.equal(resolveDynamicRoute("/players/[playerId]", fixtures), "/players/route-player");
  assert.equal(resolveDynamicRoute("/admin/players/[playerId]", fixtures), "/admin/players/global-player");
  assert.deepEqual(dynamicParameters("/docs/[...slug]"), [{ name: "slug", segment: "[...slug]", catchAll: true }]);
  assert.equal(resolveDynamicRoute("/docs/[...slug]", { parameters: { slug: ["one", "two"] } }), "/docs/one/two");
  assert.throws(
    () => resolveDynamicRoute("/matches/[matchId]", fixtures),
    /Missing fixture for dynamic route \/matches\/\[matchId\]/u,
  );
  assert.throws(
    () => resolveDynamicRoute("/matches/[matchId]", { parameters: { matchId: "{{MATCH_ID}}" } }),
    /not a concrete path value/u,
  );
});

test("capture sessions are isolated by authentication boundary", () => {
  assert.deepEqual(classifyRoute("/admin/login"), { group: "admin-auth", session: "anonymous" });
  assert.deepEqual(classifyRoute("/admin/security"), { group: "admin-auth", session: "setup" });
  assert.deepEqual(classifyRoute("/admin/players"), { group: "admin", session: "admin" });
  assert.deepEqual(classifyRoute("/account/riot"), { group: "account", session: "account" });
  for (const route of ["/applications", "/matches/submit", "/matches/submissions", "/tools/team-balance", "/tools/team-balance/drafts/example"]) {
    assert.equal(classifyRoute(route).session, "account", route);
  }
  assert.deepEqual(classifyRoute("/matches"), { group: "public", session: "anonymous" });
});

test("the CLI contract reads a fixtures JSON file and creates its output directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "klol-capture-cli-"));
  try {
    const syntheticApp = join(root, "app");
    const fixturesFile = join(root, "fixtures.json");
    const outputFile = join(root, "nested", "capture-plan.json");
    await syntheticPage(syntheticApp, "(public)/players/[playerId]/page.tsx");
    await writeFile(fixturesFile, JSON.stringify({ parameters: { playerId: "actual-player" } }));
    const result = await main(["--app-dir", syntheticApp, "--fixtures", fixturesFile, "--output", outputFile]);
    assert.equal(result[0].path, "/players/actual-player");
    assert.deepEqual(JSON.parse(await readFile(outputFile, "utf8")), result);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the repository plan covers every page once, resolves IDs and adds reviewed variants", async () => {
  const pages = await discoverAppPages(appDirectory);
  const parameterNames = new Set(pages.flatMap((page) => dynamicParameters(page.route).map((parameter) => parameter.name)));
  const fixtures = {
    parameters: Object.fromEntries([...parameterNames].map((parameter) => [parameter, parameter === "championId" ? "ahri" : uuidFixture])),
  };
  const plan = buildCapturePlan(pages, fixtures);
  const canonical = plan.filter((entry) => entry.captureKind === "canonical");
  const aliases = plan.filter((entry) => entry.captureKind === "alias-redirect");

  assert.equal(canonical.length, pages.filter((page) => !page.expectedRedirect).length);
  assert.deepEqual(
    [...canonical, ...aliases].map((entry) => entry.sourcePage).sort(),
    pages.map((page) => page.sourcePage).sort(),
    "every discovered page.tsx must own one canonical capture or alias redirect contract",
  );
  assert.equal(plan.some((entry) => /\[[^\]]+\]|\{\{[^}]+\}\}/u.test(entry.path)), false);

  for (const mobile of [false, true]) {
    const paths = plan.filter((entry) => entry.viewport.mobile === mobile).map((entry) => entry.path);
    assert.equal(new Set(paths).size, paths.length, `${mobile ? "mobile" : "desktop"} capture paths must be unique`);
  }
  assert.equal(new Set(plan.map((entry) => entry.id)).size, plan.length, "capture IDs must be globally unique");

  const requiredVariants = [
    "/account?tab=player",
    "/admin/balance-ai?tab=players",
    "/admin/balance-ai?tab=reviews",
    "/admin/discipline?tab=tasks",
    "/admin/kakao?tab=logs",
    "/admin/kakao?tab=health",
    "/admin/logs?view=stats",
    "/admin/logs?view=ai-requests",
    `/admin/matches/${uuidFixture}?tab=ai-review`,
    `/admin/players/${uuidFixture}?tab=riot`,
    "/admin/riot?tab=sync",
    "/admin/riot?tab=logs",
    `/players/${uuidFixture}?tab=riot`,
  ];
  for (const path of requiredVariants) assert.ok(plan.some((entry) => entry.path === path), path);

  const aliasesByRoute = new Map(aliases.map((entry) => [entry.routeTemplate, entry]));
  assert.equal(aliasesByRoute.get("/admin/ai-requests")?.expectedRedirect.destination, "/admin/logs?view=ai-requests");
  assert.equal(
    aliasesByRoute.get("/admin/kakao/operation-forms/[formType]")?.expectedRedirect.destination,
    `/admin/operation-forms?type=${uuidFixture}`,
  );
  assert.equal(aliasesByRoute.get("/admin/recruits")?.expectedRedirect.status, 308);
  assert.deepEqual(aliasesByRoute.get("/app")?.expectedRedirect, { status: 308, destination: "/" });
  assert.deepEqual(aliasesByRoute.get("/app/players")?.expectedRedirect, { status: 308, destination: "/players" });
  assert.equal(canonical.some((entry) => entry.routeTemplate === "/admin/ai-requests"), false);
  assert.equal(canonical.some((entry) => entry.routeTemplate === "/admin/recruits"), false);

  assert.ok(plan.some((entry) => entry.captureKind === "key-mobile" && entry.path === "/"));
  assert.ok(plan.some((entry) => entry.captureKind === "key-mobile" && entry.path === "/admin/riot"));
  assert.ok(plan.some((entry) => entry.captureKind === "key-mobile" && entry.path === "/tools/team-balance"));
});
