import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

function load(file, dependencies) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, { exports: result.exports, URLSearchParams, require: (name) => {
    if (name.endsWith(".module.css")) return { __esModule: true, default: {} };
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected team page dependency: ${name}`);
    return dependencies[name];
  } });
  return result.exports;
}

const queries = load("modules/team-tools/infrastructure/team-recommendation-query.ts", {});
const draftId = "11111111-1111-4111-8111-111111111111";
const drafts = [{ id: draftId, title: "합성 팀", status: "SAVED", updatedAt: "2026-10-06T00:00:00Z" }];
function harness(admin, detail) {
  const returns = [];
  const empty = () => null;
  const runtime = {
    loadRuntimeTeamBalance: async (read) => ({ state: "ready", data: await read({ listDrafts: async () => ({ items: drafts, totalPages: 3, currentPage: 2 }), getDraft: async () => ({ ...drafts[0], evaluationRound: 1, selectedCandidateSignature: "same-layout" }) }) }),
    loadRuntimeTeamBalanceRecommendations: async (read) => ({ state: "ready", data: await read({ getRecommendation: async (_viewer, id, team) => ({ draft: { id }, team }) }) }),
  };
  const dependencies = {
    "react/jsx-runtime": jsxRuntime, "next/link": "a", "next/navigation": { notFound: () => { throw new Error("synthetic not-found"); } },
    "@/components/theme/theme-icons": new Proxy({}, { get: () => empty }),
    "@/modules/seo/domain/site-seo": { createRouteMetadata: () => ({}) },
    "@/modules/auth/infrastructure/server-authorization": {
      requireApprovedAccountPage: async (next) => { returns.push(next); return { userId: "synthetic-owner" }; },
      requirePageRole: async (role, next) => { assert.equal(role, "ADMIN"); returns.push(next); return { userId: "synthetic-admin" }; },
    },
    "@/modules/operations/infrastructure/site-feature-access": { readSiteFeatureState: async () => "enabled" },
    "@/modules/team-tools/infrastructure/runtime-team-balance": runtime,
    "@/modules/team-tools/infrastructure/team-recommendation-query": queries,
  };
  for (const path of ["./team-balance-draft-workspace", "@/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace"]) dependencies[path] = { TeamBalanceDraftWorkspace: empty };
  for (const path of ["./team-balance-recommendations-panel", "../team-balance-recommendations-panel", "@/app/(public)/(tools)/tools/team-balance/drafts/team-balance-recommendations-panel"]) dependencies[path] = { TeamBalanceRecommendationsPanel: empty };
  for (const path of ["../team-balance-feature-state", "../../team-balance-feature-state", "@/app/(public)/(tools)/tools/team-balance/team-balance-feature-state"]) dependencies[path] = { TeamBalanceFeatureState: empty };
  for (const path of ["../../team-tool-nav", "../../../team-tool-nav"]) dependencies[path] = { TeamToolNav: empty };
  const prefix = admin ? "app/(admin)/admin/balance/drafts" : "app/(public)/(tools)/tools/team-balance/drafts";
  const page = load(`${prefix}${detail ? "/[draftId]" : ""}/page.tsx`, dependencies).default;
  return { render: (query) => page({ params: Promise.resolve({ draftId }), searchParams: Promise.resolve(query) }), returns };
}

function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const match = find(child, predicate); if (match) return match; }
  return null;
}

for (const admin of [false, true]) {
  const base = admin ? "/admin/balance/drafts" : "/tools/team-balance/drafts";
  test(`${admin ? "admin" : "owner"} team recommendations retain the selected tab, team and draft after authentication`, async () => {
    const detail = harness(admin, true);
    await detail.render({ tab: "recommendations", team: "BLUE" });
    assert.equal(detail.returns[0], `${base}/${draftId}?tab=recommendations&team=BLUE`);
    const list = harness(admin, false);
    await list.render({ view: "recommendations", draftId, team: "BLUE" });
    const next = new URL(list.returns[0], "https://isolated.invalid");
    assert.equal(next.pathname, base);
    assert.equal(next.searchParams.get("draftId"), draftId);
    assert.equal(next.searchParams.get("view"), "recommendations");
    assert.equal(next.searchParams.get("team"), "BLUE");
    await list.render({ view: "recommendations", draftId, team: "BLUE", next: "https://untrusted.invalid" });
    assert.equal(list.returns.at(-1), base, "unrecognized input is never copied to an authentication return URL");
    await assert.rejects(() => detail.render({ tab: "recommendations", team: ["BLUE", "RED"] }), /synthetic not-found/u);
    assert.equal(detail.returns.at(-1), `${base}/${draftId}`);
  });
  test(`${admin ? "admin" : "owner"} draft pagination and authentication preserve the applied page size`, async () => {
    const list = harness(admin, false);
    const tree = await list.render({ page: "2", pageSize: "24" });
    const next = new URL(list.returns[0], "https://isolated.invalid");
    assert.equal(next.searchParams.get("page"), "2");
    assert.equal(next.searchParams.get("pageSize"), "24");
    const pager = find(tree, (node) => node.props["aria-label"]?.includes("초안 페이지"));
    assert.ok(pager);
    const forward = find(pager, (node) => node.props.rel === "next" || (typeof node.props.href === "string" && node.props.href.includes("page=3")));
    assert.ok(forward);
    assert.equal(new URL(forward.props.href, "https://isolated.invalid").searchParams.get("pageSize"), "24");
  });
}
