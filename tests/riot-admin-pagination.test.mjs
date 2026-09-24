import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pageSource = compile("../src/app/(admin)/admin/riot/page.tsx");
const queryModule = { exports: {} };
vm.runInNewContext(compile("../src/modules/riot/application/riot-query.ts"), {
  exports: queryModule.exports, URL, Set, Date,
});
const { parseAdminRiotQuery } = queryModule.exports;

async function render(searchParams, total, count, state = "ready") {
  const pageModule = { exports: {} };
  let requestedQuery;
  const modules = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": (props) => createElement("a", props),
    "@/components/riot/riot-workspace.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
    "@/components/riot/riot-admin-actions": {
      RiotAdminActions: () => null,
      RiotAdminGlobalActions: () => null,
      RiotAdminBulkLink: ({ remainingBefore, items }) => createElement("p", { "data-testid": "bulk-preview" }, `배치 ${items.length} / ${remainingBefore}`),
    },
    "@/modules/auth/infrastructure/server-authorization": { requirePageRole: async () => ({ role: "SUPER_ADMIN" }) },
    "@/modules/competitions/core": {
      publicRiotLinkMethodLabel: (value) => value,
      publicRiotLinkStatusLabel: (value) => value,
      publicRiotSyncStatusLabel: (value) => value,
    },
    "@/modules/riot": { parseAdminRiotQuery },
    "@/modules/riot/infrastructure/runtime-riot": {
      loadRuntimeRiot: async (read) => state !== "ready" ? { state } : {
        state: "ready",
        data: await read({ query: { listAdmin: async (query) => {
          requestedQuery = query;
          return {
            tab: query.tab, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
            items: query.tab === "accounts" ? Array.from({ length: count }, (_, index) => ({
              playerId: `synthetic-${index}`, displayName: "합성 플레이어", riotId: "Synthetic#TEST", status: "UNLINKED", method: null,
              lastSyncStatus: null, failureCode: null, lastSyncedAt: null,
            })) : [],
            syncItems: query.tab === "sync" ? Array.from({ length: count }, (_, index) => ({
              jobId: `synthetic-${index}`, displayName: "합성 플레이어", riotId: "Synthetic#TEST", status: "SUCCEEDED", failureCode: null,
              requestedBy: "ADMIN", attemptCount: 1, maximumAttempts: 5, requestedAt: null, completedAt: null, availableAt: null,
            })) : [],
            logItems: query.tab === "logs" ? Array.from({ length: count }, (_, index) => ({
              id: `synthetic-${index}`, source: "AUDIT", title: "합성 감사", detail: "합성 데이터", status: "SUCCESS", occurredAt: null,
            })) : [],
          };
        } } }),
      },
    },
  };
  vm.runInNewContext(pageSource, {
    exports: pageModule.exports, URL, URLSearchParams, Intl, Date,
    require: (specifier) => {
      assert.ok(Object.hasOwn(modules, specifier), `Unexpected page dependency: ${specifier}`);
      return modules[specifier];
    },
  });
  const html = renderToStaticMarkup(await pageModule.exports.default({ searchParams: Promise.resolve(searchParams) }));
  return { html, requestedQuery };
}

function pageLinks(html) {
  return [...html.matchAll(/href="([^"]+)"[^>]*>(이전|다음)<\/a>/gu)].map((match) => ({
    label: match[2], url: new URL(match[1].replaceAll("&amp;", "&"), "https://test.invalid"),
  }));
}

test("account pagination reports the filtered total and page range while retaining filters and page size", async () => {
  const { html, requestedQuery } = await render({ tab: "accounts", status: "DISCONNECTED", page: "2", pageSize: "25" }, 63, 25);
  assert.equal(requestedQuery.page, 2);
  assert.match(html, /현재 필터 전체 <strong>63명<\/strong> · 26–50명 표시/u);
  assert.match(html, /2 \/ 3 페이지/u);
  assert.match(html, /전체 동기화는 현재 필터·페이지와 관계없이 연결됨 상태의 모든 계정을 대상으로 합니다/u);
  assert.match(html, /연결 안 됨·연결 해제·연결 취소 계정은 연결 후/u);
  const links = pageLinks(html);
  assert.deepEqual(links.map((item) => item.label), ["이전", "다음"]);
  for (const [index, { url }] of links.entries()) {
    assert.equal(url.searchParams.get("page"), index === 0 ? "1" : "3");
    assert.equal(url.searchParams.get("status"), "DISCONNECTED");
    assert.equal(url.searchParams.get("pageSize"), "25");
    assert.ok(parseAdminRiotQuery(url.href));
  }
  assert.match(html, /type="hidden" name="pageSize" value="25"/u);
});

test("first and last job pages expose only valid navigation and preserve the status filter", async () => {
  const first = await render({ tab: "sync", status: "FAILED", pageSize: "10" }, 21, 10);
  assert.deepEqual(pageLinks(first.html).map((item) => item.label), ["다음"]);
  assert.match(first.html, /<span aria-disabled="true">이전<\/span>/u);
  const last = await render({ tab: "sync", status: "FAILED", page: "3", pageSize: "10" }, 21, 1);
  assert.match(last.html, /21건<\/strong> · 21–21건 표시/u);
  assert.match(last.html, /<span aria-disabled="true">다음<\/span>/u);
  const [previous] = pageLinks(last.html);
  assert.equal(previous.url.searchParams.get("status"), "FAILED");
  assert.equal(previous.url.searchParams.get("tab"), "sync");
  assert.equal(previous.url.searchParams.get("pageSize"), "10");
});

test("log navigation retains its source and does not produce an incompatible account status", async () => {
  const { html } = await render({ tab: "logs", source: "AUDIT", page: "2", pageSize: "10" }, 35, 10);
  for (const { url } of pageLinks(html)) {
    assert.equal(url.searchParams.get("source"), "AUDIT");
    assert.equal(url.searchParams.get("status"), null);
    assert.equal(url.searchParams.get("tab"), "logs");
    assert.ok(parseAdminRiotQuery(url.href));
  }
});

test("bulk preview remains a bounded first batch without ordinary page navigation or invented totals", async () => {
  const { html, requestedQuery } = await render({ tab: "accounts", action: "bulk-link", batchSize: "10" }, 49, 10);
  assert.equal(requestedQuery.page, 1);
  assert.equal(requestedQuery.pageSize, 10);
  assert.match(html, /배치 10 \/ 49/u);
  assert.doesNotMatch(html, /aria-label="조회 범위"|aria-label="Riot 목록 페이지"|name="pageSize"/u);
  assert.deepEqual(pageLinks(html), []);
});

test("a now-empty page can return to available results without displaying a nonexistent range", async () => {
  const { html } = await render({ tab: "accounts", page: "4" }, 30, 0);
  assert.match(html, /30명<\/strong> · 현재 페이지 0명/u);
  assert.match(html, /현재 페이지에 결과 없음/u);
  const links = pageLinks(html);
  assert.equal(links.length, 1);
  assert.equal(links[0].url.searchParams.get("page"), "2");
});

test("navigation respects the query ceiling and unavailable data never pretends there are zero accounts", async () => {
  const { html } = await render({ tab: "logs", page: "200", pageSize: "25" }, 5_200, 25);
  assert.match(html, /5,200건/u);
  assert.match(html, /최대 5,000건/u);
  assert.deepEqual(pageLinks(html).map((item) => item.label), ["이전"]);
  const unavailable = await render({ tab: "accounts" }, 0, 0, "unavailable");
  assert.doesNotMatch(unavailable.html, /aria-label="조회 범위"|aria-label="Riot 목록 페이지"/u);
});
