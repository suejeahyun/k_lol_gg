import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const sources = Object.fromEntries([
  ["public", "../src/app/(public)/community-network/page.tsx"],
  ["admin", "../src/app/(admin)/admin/community-network/page.tsx"],
].map(([kind, filename]) => [kind, ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
}).outputText]));

const emptySnapshot = { revision: 0, communities: [], rooms: [], connectionStatus: "UNVERIFIED", routingStatus: "NOT_APPLIED" };
const notFound = new Error("NOT_FOUND");
const forbidden = new Error("FORBIDDEN");

function harness(kind, { state = "ready", communities = [], snapshot = emptySnapshot, allowed = true } = {}) {
  const calls = [];
  const pageModule = { exports: {} };
  const modules = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": (props) => createElement("a", props),
    "next/navigation": { notFound() { calls.push(["notFound"]); throw notFound; } },
    "./network.module.css": { __esModule: true, default: {} },
    "./network-directory.module.css": { __esModule: true, default: {} },
    "./network-form": ({ initial }) => {
      calls.push(["form", initial]);
      return createElement("div", { "data-testid": "network-form" });
    },
    "@/modules/auth/infrastructure/server-authorization": {
      async requirePageRole(role, returnTo) {
        calls.push(["authorize", role, returnTo]);
        if (!allowed) throw forbidden;
      },
    },
    "@/modules/community-network/infrastructure/runtime": {
      async loadRuntimeCommunityNetwork(read) {
        calls.push(["load"]);
        if (state !== "ready") return { state };
        const data = await read({
          async getSnapshot() { calls.push(["snapshot"]); return snapshot; },
          async getPublicDirectory() { calls.push(["directory"]); return communities; },
        });
        return { state: "ready", data };
      },
    },
  };
  vm.runInNewContext(sources[kind], {
    exports: pageModule.exports, URL,
    require(specifier) {
      assert.ok(Object.hasOwn(modules, specifier), `Unexpected dependency: ${specifier}`);
      return modules[specifier];
    },
  });
  return { calls, async render() { return renderToStaticMarkup(await pageModule.exports.default()); } };
}

test("public community directory is not available when the feature is disabled", async () => {
  const page = harness("public", { state: "disabled" });
  await assert.rejects(page.render(), (error) => error === notFound);
  assert.deepEqual(page.calls, [["load"], ["notFound"]]);
});

test("public directory distinguishes storage failure from a genuinely empty directory", async () => {
  const empty = harness("public");
  const emptyHtml = await empty.render();
  assert.match(emptyHtml, /아직 공개된 커뮤니티가 없습니다/u);
  assert.doesNotMatch(emptyHtml, /목록을 불러오지 못했습니다/u);
  assert.deepEqual(empty.calls, [["load"], ["directory"]]);
  for (const state of ["unavailable", "error"]) {
    const failure = harness("public", { state });
    const html = await failure.render();
    assert.match(html, /목록을 불러오지 못했습니다/u);
    assert.match(html, /role="status"/u);
    assert.doesNotMatch(html, /아직 공개된 커뮤니티가 없습니다/u);
    assert.deepEqual(failure.calls, [["load"]]);
  }
});

test("public cards escape untrusted introductions and expose no extra private fields", async () => {
  const page = harness("public", { communities: [{
    id: "synthetic-public", slug: "synthetic", name: '<script>alert("name")</script>',
    origin: "https://community.example", description: '<img src=x onerror="alert(1)">\nSecond line',
    connectionStatus: "UNVERIFIED", routingStatus: "NOT_APPLIED",
    rooms: [{ displayName: "PRIVATE_ROOM_SENTINEL", dataGroupKey: "PRIVATE_GROUP_SENTINEL" }],
    privateNote: "PRIVATE_NOTE_SENTINEL",
  }] });
  const html = await page.render();
  assert.match(html, /&lt;script&gt;alert\(&quot;name&quot;\)&lt;\/script&gt;/u);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/u);
  assert.doesNotMatch(html, /<script\b|<img\b|PRIVATE_(?:ROOM|GROUP|NOTE)_SENTINEL/u);
  assert.match(html, /href="https:\/\/community\.example" target="_blank" rel="noopener noreferrer"/u);
  assert.match(html, /사이트 방문/u);
  assert.match(html, /\(새 창\)/u);
  assert.match(html, /사이트 방문과 회원 가입은 별도입니다/u);
  assert.deepEqual(page.calls, [["load"], ["directory"]]);
});

test("admin page requires SUPER_ADMIN before loading any registry information", async () => {
  const denied = harness("admin", { allowed: false });
  await assert.rejects(denied.render(), (error) => error === forbidden);
  assert.deepEqual(denied.calls, [["authorize", "SUPER_ADMIN", "/admin/community-network"]]);
  const allowed = harness("admin");
  const html = await allowed.render();
  assert.deepEqual(allowed.calls, [["authorize", "SUPER_ADMIN", "/admin/community-network"], ["load"], ["snapshot"], ["form", emptySnapshot]]);
  assert.match(html, /data-testid="network-form"/u);
  assert.match(html, /휴대폰 봇 설정과 기존 사이트 데이터는 변경되지 않습니다/u);
});

test("admin disabled and unavailable storage do not render an editable empty registry", async () => {
  for (const state of ["disabled", "unavailable", "error"]) {
    const page = harness("admin", { state });
    const html = await page.render();
    assert.match(html, /등록 정보를 불러올 수 없습니다/u);
    assert.match(html, /role="status"/u);
    assert.doesNotMatch(html, /data-testid="network-form"/u);
    assert.match(html, state === "disabled" ? /아직 활성화되지 않았습니다/u : /저장된 자료가 없다는 뜻은 아닙니다/u);
    assert.deepEqual(page.calls, [["authorize", "SUPER_ADMIN", "/admin/community-network"], ["load"]]);
  }
});
