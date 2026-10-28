import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as http from "../src/platform/http";
import * as input from "../src/modules/operations/infrastructure/operations-input";
import * as config from "../src/modules/community-sites/domain/site-configuration";

function load(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Script(code, { filename: path }).runInNewContext({ exports, Response, Request, URL, require(id: string) {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`); return dependencies[id];
  } });
  return exports;
}

function settingsApi(brand: string) {
  const writes: unknown[] = [];
  const route = load("src/app/api/admin/site-settings/route.ts", {
    "@/lib/service-brand": { SERVICE_BRAND: { id: brand } }, "@/platform/http": http,
    "@/modules/operations/infrastructure/operations-input": input,
    "@/modules/operations/infrastructure/runtime-operations": { getRuntimeOperationsRepository: () => ({ updateSettings: async (value: { patch: unknown }) => {
      writes.push(value.patch); return { settings: { revision: 2 } };
    } }) },
    "@/modules/operations/infrastructure/operations-http": {
      requireOperationsApiSession: async () => ({ ok: true, session: {} }),
      prepareOperationsMutation: async (request: Request) => ({ ok: true, body: await request.json(), traceId: undefined, metadata: { expectedRevision: 1 } }),
      operationsActor: () => ({}), operationsMutationResponse: (body: unknown) => Response.json(body),
      operationsErrorResponse: () => Response.json({ code: "INVALID_INPUT" }, { status: 400 }),
      operationsUnavailableResponse: () => Response.json({ code: "UNAVAILABLE" }, { status: 503 }),
    },
  });
  const put = route.PUT as (request: Request) => Promise<Response>;
  return { writes, put: (body: unknown) => put(new Request("https://site.example/api/admin/site-settings", { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })) };
}

test("managed child settings reject every authoritative field before writing, including mixed local patches", async () => {
  const h = settingsApi("community");
  for (const patch of [{ brandName: "ignored rename" }, { tagline: "ignored intro" }, { features: { registrations: false } },
    { aiAllowedRoles: ["USER"] }, { aiRequestsPerHour: 25 }, { aiDailyCostLimitMicros: 1 },
    { supportUrl: "https://support.example", features: { teamBalance: false } }]) {
    const response = await h.put(patch);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "COMMUNITY_SETTINGS_MANAGED_BY_HUB");
  }
  assert.equal(h.writes.length, 0);
});

test("managed child keeps independent support and private maintenance settings editable", async () => {
  const h = settingsApi("community");
  const patch = { supportUrl: "https://support.example", internalMaintenanceNote: "Local operations note" };
  assert.equal((await h.put(patch)).status, 200);
  assert.deepEqual(h.writes, [patch]);
});

test("KLOL and NEXUS retain the existing brand and feature settings API", async () => {
  for (const brand of ["klol", "nexus"]) {
    const h = settingsApi(brand);
    const patch = { brandName: "Existing community", features: { teamBalance: false, registrations: false } };
    assert.equal((await h.put(patch)).status, 200);
    assert.deepEqual(h.writes, [patch]);
  }
});

test("managed navigation exposes enabled players, highlights and Kakao help and removes optional entries when disabled", async () => {
  let configuration = config.createDefaultCommunitySiteConfig();
  const source = load("src/components/community-sites/managed-community-shell.tsx", {
    "react/jsx-runtime": jsx,
    "next/link": { default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) },
    "@/lib/service-brand": { SERVICE_BRAND: { id: "community", name: configuration.name } },
    "@/modules/auth/infrastructure/runtime-session": { getCurrentSession: async () => null },
    "@/modules/community-sites/infrastructure/runtime-site-configuration": { readRuntimeCommunitySiteConfiguration: async () => ({ configuration }) },
    "@/modules/community-sites/domain/site-configuration": config,
    "./managed-community.module.css": { default: {} },
  });
  const shell = source.ManagedCommunityShell as (props: { children: ReactNode }) => Promise<ReactNode>;
  configuration = config.setCommunitySiteModule(configuration, "kakaoHelp", true);
  const enabled = renderToStaticMarkup(await shell({ children: "Page" }));
  for (const href of ["/players", "/images", "/highlights", "/help/kakao"]) assert.ok(enabled.includes(`href="${href}"`), href);
  configuration = config.setCommunitySiteModule(config.setCommunitySiteModule(configuration, "media", false), "kakaoHelp", false);
  const disabled = renderToStaticMarkup(await shell({ children: "Page" }));
  assert.ok(disabled.includes('href="/players"'));
  for (const href of ["/images", "/highlights", "/help/kakao"]) assert.ok(!disabled.includes(`href="${href}"`), href);
});
