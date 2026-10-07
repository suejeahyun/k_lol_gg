import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const styles = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
function compile(path, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, { exports: loaded.exports, Object, require: name => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`); return modules[name];
  } });
  return loaded.exports;
}
const labels = compile("../src/modules/competitions/core/public-display-labels.ts");
const actions = compile("../src/components/riot/riot-owner-actions.tsx", { react: React, "react/jsx-runtime": jsxRuntime, "./riot-workspace.module.css": styles });
async function render(code, method = "DIRECT_OWNER") {
  const page = compile("../src/app/(public)/account/riot/page.tsx", {
    "react/jsx-runtime": jsxRuntime, "next/link": props => React.createElement("a", props),
    "@/modules/seo/domain/site-seo": { createRouteMetadata: () => ({}) },
    "@/components/accounts/account-shell": { AccountShell: ({ children }) => React.createElement("main", null, children) },
    "@/components/accounts/account-access.module.css": styles,
    "@/components/riot/riot-owner-actions": actions,
    "@/modules/competitions/core": labels,
    "@/modules/auth/infrastructure/server-authorization": { requireApprovedAccountPage: async () => ({ userId: "synthetic-owner" }) },
    "@/modules/riot/infrastructure/runtime-riot": {
      getRuntimeRiot: () => ({ rsoAvailable: false }),
      loadRuntimeRiot: async read => ({ state: "ready", data: await read({ query: { getOwnerStatus: async ownerId => {
        assert.equal(ownerId, "synthetic-owner");
        return { link: { riotId: "Synthetic#TEST", method, status: "CONNECTED", revision: 1 }, lastSync: { status: "PARTIAL", attemptCount: 1, failureCode: code }, summary: null };
      } } }) }),
    },
  });
  return renderToStaticMarkup(await page.default());
}

test("owner renders a Korean partial cause with the existing sync action and no raw diagnostic", async () => {
  const html = await render("PARTIAL_PROVIDER_TIMEOUT");
  assert.match(html, /일부 반영/u);
  assert.match(html, /<dt>진단<\/dt><dd>일부 전적 응답 지연<\/dd>/u);
  assert.match(html, /지금 동기화/u);
  assert.match(html, /Riot ID 직접 연결/u);
  assert.doesNotMatch(html, /PARTIAL_PROVIDER|상태 확인 필요/u);
});

test("owner never renders an unknown diagnostic body or prototype key", async () => {
  for (const code of ["synthetic-private-body", "toString", "__proto__"]) {
    const html = await render(code);
    assert.match(html, /원인 확인 필요/u);
    assert.doesNotMatch(html, /synthetic-private-body|toString|__proto__/u);
  }
  assert.match(await render(null), /일부 전적 미반영/u);
});

test("real Riot link method values have concrete labels without claiming ownership for admin links", async () => {
  assert.match(await render(null, "RSO_VERIFIED"), /Riot 계정 확인/u);
  const admin = await render(null, "ADMIN");
  assert.match(admin, /관리자 연결/u);
  assert.match(admin, /Riot 계정 소유권 미인증/u);
});
