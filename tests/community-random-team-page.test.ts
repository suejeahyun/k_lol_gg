import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import { communityModuleForNavigation, communityModuleForNewAction } from "../src/modules/community-sites/domain/module-access";

function harness(service = "community") {
  let enabled = true, unavailable = false, reads = 0, sessions = 0;
  const RandomTeamTool = () => null, TeamBalanceFeatureState = () => null;
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "@/modules/seo/domain/site-seo": { createRouteMetadata: () => ({}) },
    "@/components/theme/theme-icons": { Dices: () => null },
    "@/lib/service-brand": { SERVICE_BRAND: { id: service } },
    "@/modules/community-sites/infrastructure/module-access": { isRuntimeCommunityModuleEnabled: async (module: string) => { assert.equal(module, "teamBalance"); reads++; if (unavailable) throw new Error("private-db-error"); return enabled; } },
    "@/modules/auth/infrastructure/runtime-session": { getCurrentSession: async () => { sessions++; return null; } },
    "../team-tool-nav": { TeamToolNav: () => null },
    "./random-team-tool": { RandomTeamTool },
    "../team-balance/team-balance-feature-state": { TeamBalanceFeatureState },
    "../team-tools.module.css": { default: {} },
  };
  const output: { default?: (props: { searchParams: Promise<Record<string, string>> }) => Promise<jsx.JSX.Element>; dynamic?: string } = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/app/(public)/(tools)/tools/random-team/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Script(code).runInNewContext({ exports: output, require: (key: string) => { assert.ok(Object.hasOwn(dependencies, key), key); return dependencies[key]; } });
  return { render: (mode: string) => output.default!({ searchParams: Promise.resolve({ mode }) }), setEnabled(value: boolean) { enabled = value; }, fail() { unavailable = true; }, reads: () => reads, sessions: () => sessions, RandomTeamTool, TeamBalanceFeatureState, dynamic: output.dynamic };
}

function containsComponent(element: unknown, component: unknown): boolean {
  if (!element || typeof element !== "object") return false;
  if (Array.isArray(element)) return element.some((child) => containsComponent(child, component));
  const node = element as { type?: unknown; props?: { children?: unknown } };
  return node.type === component || containsComponent(node.props?.children, component);
}

test("managed direct random/tier URL cannot mount its client calculator while disabled or unavailable", async () => {
  const app = harness(); assert.equal(app.dynamic, "force-dynamic");
  assert.equal(containsComponent(await app.render("random"), app.RandomTeamTool), true);
  app.setEnabled(false);
  for (const mode of ["random", "tier"]) {
    const page = await app.render(mode);
    assert.equal(page.type, app.TeamBalanceFeatureState);
    assert.equal(page.props.state, "disabled");
    assert.equal(containsComponent(page, app.RandomTeamTool), false);
  }
  app.setEnabled(true); assert.equal(containsComponent(await app.render("tier"), app.RandomTeamTool), true);
  app.fail(); assert.equal((await app.render("tier")).props.state, "unavailable");
  assert.equal(app.reads(), 5); assert.equal(app.sessions(), 2);
});

test("existing services and saved drafts remain available; coin toss is outside the teamBalance catalog", async () => {
  for (const service of ["klol", "nexus"]) {
    const app = harness(service); app.fail();
    assert.equal(containsComponent(await app.render("random"), app.RandomTeamTool), true);
    assert.equal(app.reads(), 0);
  }
  assert.equal(communityModuleForNavigation("/tools/random-team?mode=tier"), "teamBalance");
  assert.equal(communityModuleForNavigation("/tools/coin-toss"), null);
  assert.equal(communityModuleForNewAction("/api/team-tools/drafts/kept", "GET"), null);
  assert.equal(communityModuleForNewAction("/api/team-tools/drafts/kept/save", "POST"), null);
});
