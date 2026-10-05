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
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"];
const queryModule = { exports: {} };
vm.runInNewContext(compile("../src/modules/mmr/application/mmr-query.ts"), {
  exports: queryModule.exports, URL,
  require: (specifier) => {
    assert.equal(specifier, "../domain/mmr-projection");
    return { MMR_POSITIONS: positions };
  },
});
const { parseMmrPlayerQuery } = queryModule.exports;
const pageSource = compile("../src/app/(public)/(statistics)/rankings/mmr/page.tsx");

async function render(searchParams, { total = 21, count = 10, state = "ready", summaryStatus = "READY" } = {}) {
  const pageModule = { exports: {} };
  let requestedQuery;
  let loaderCalls = 0;
  const modules = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": (props) => createElement("a", props),
    "./mmr.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
    "@/modules/seo/domain/site-seo": { createRouteMetadata: () => ({}) },
    "@/components/theme/theme-icons": Object.fromEntries(["Activity", "Gauge", "Search", "Sparkles"].map(name => [name, () => null])),
    "@/modules/mmr": { MMR_POSITIONS: positions, parseMmrPlayerQuery },
    "@/platform/time/format-korean-date-time": { formatOptionalKoreanDateTime: () => "2026. 10. 5." },
    "@/modules/mmr/infrastructure/runtime-mmr": {
      loadRuntimeMmr: async (read) => {
        loaderCalls++;
        if (state !== "ready") return { state };
        return { state: "ready", data: await read({
          getSummary: async () => ({ status: summaryStatus, generation: 1, sourceMatchCount: 3, pendingSourceCount: 0, calculatedAt: null, formulaTransition: null }),
          listPlayers: async (query) => {
            requestedQuery = query;
            return { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize), items: Array.from({ length: count }, (_, index) => ({
              playerId: `synthetic-${index}`, displayName: `합성 플레이어 ${index}`, riotId: "Synthetic#QA", overallScore: 53.24, confidence: .8, sampleSize: 20,
              positions: Object.fromEntries(positions.map(position => [position, { score: position === "MID" ? 76.25 : 0, sampleSize: position === "MID" ? 7 : 0 }])),
            })) };
          },
        }) };
      },
    },
  };
  vm.runInNewContext(pageSource, {
    exports: pageModule.exports, URL, URLSearchParams,
    require: (specifier) => {
      assert.ok(Object.hasOwn(modules, specifier), `Unexpected dependency: ${specifier}`);
      return modules[specifier];
    },
  });
  const element = await pageModule.exports.default({ searchParams: Promise.resolve(searchParams) });
  return { html: renderToStaticMarkup(element), requestedQuery, loaderCalls };
}

function links(html, label) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gu)]
    .filter(match => !label || match[2] === label)
    .map(match => ({ label: match[2], url: new URL(match[1].replaceAll("&amp;", "&"), "https://test.invalid") }));
}

test("MMR previous/next links reach later players and preserve validated search, position, and page size", async () => {
  const { html, requestedQuery } = await render({ q: "합성 플레이어", position: "MID", page: "2", pageSize: "10" });
  assert.equal(requestedQuery.page, 2);
  assert.match(html, /data-rank="11"/u);
  assert.match(html, /aria-label="MMR 랭킹 페이지"/u);
  assert.match(html, /2 \/ 3/u);
  for (const [label, expectedPage] of [["이전", 1], ["다음", 3]]) {
    const [link] = links(html, label);
    assert.ok(link);
    const query = parseMmrPlayerQuery(link.url.href);
    assert.equal(query.page, expectedPage);
    assert.equal(query.pageSize, 10);
    assert.equal(query.query, "합성 플레이어");
    assert.equal(query.position, "MID");
  }
  assert.match(html, /type="hidden" name="pageSize" value="10"/u);
});

test("first and last MMR pages expose only valid directions", async () => {
  const first = await render({ pageSize: "10" });
  assert.equal(links(first.html, "이전").length, 0);
  assert.equal(links(first.html, "다음").length, 1);
  const last = await render({ page: "3", pageSize: "10" }, { count: 1 });
  assert.match(last.html, /data-rank="21"/u);
  assert.equal(links(last.html, "다음").length, 0);
  assert.equal(links(last.html, "이전").length, 1);
});

test("selected position displays the score used to rank and that position's sample, including zero", async () => {
  const mid = await render({ position: "MID" }, { count: 1 });
  assert.match(mid.html, /미드 MMR 순위/u);
  assert.match(mid.html, /<small>미드 MMR<\/small>76\.25/u);
  assert.match(mid.html, /<small>미드 표본<\/small>7/u);
  assert.match(mid.html, /종합 신뢰도/u);
  assert.doesNotMatch(mid.html, /53\.24/u);
  const top = await render({ position: "TOP" }, { count: 1 });
  assert.match(top.html, /<small>탑 MMR<\/small>0\.00/u);
  assert.match(top.html, /<small>탑 표본<\/small>0/u);
  const overall = await render({}, { count: 1 });
  assert.match(overall.html, /<small>종합 MMR<\/small>53\.24/u);
  assert.match(overall.html, /<small>종합 표본<\/small>20/u);
});

test("empty projection, unmatched search, and out-of-range page have different recovery actions", async () => {
  const empty = await render({}, { total: 0, count: 0, summaryStatus: "EMPTY" });
  assert.match(empty.html, /표시할 MMR이 아직 없어요/u);
  const unmatched = await render({ q: "없는이름" }, { total: 0, count: 0 });
  assert.match(unmatched.html, /검색어에 맞는 플레이어가 없어요/u);
  assert.doesNotMatch(unmatched.html, /표시할 MMR이 아직 없어요/u);
  assert.equal(links(unmatched.html, "검색 초기화")[0].url.pathname, "/rankings/mmr");
  const outside = await render({ q: "합성", position: "MID", page: "10", pageSize: "10" }, { count: 0 });
  assert.match(outside.html, /현재 페이지에 플레이어가 없어요/u);
  const query = parseMmrPlayerQuery(links(outside.html, "첫 페이지로")[0].url.href);
  assert.equal(query.page, 1);
  assert.equal(query.query, "합성");
  assert.equal(query.position, "MID");
  assert.equal(query.pageSize, 10);
  assert.doesNotMatch(outside.html, /aria-label="MMR 랭킹 페이지"/u);
});

test("invalid MMR address is rejected before loading and has a clean recovery link", async () => {
  for (const searchParams of [{ page: "0" }, { page: "no" }, { page: ["1", "2"] }, { position: "UNKNOWN" }]) {
    const result = await render(searchParams);
    assert.equal(result.loaderCalls, 0);
    assert.match(result.html, /검색 조건을 확인해 주세요/u);
    assert.equal(links(result.html, "전체 MMR 순위")[0].url.search, "");
  }
});

test("MMR load failure retries the same bounded query without pretending the list is empty", async () => {
  const result = await render({ q: "합성", position: "MID", page: "2", pageSize: "10" }, { state: "error" });
  assert.doesNotMatch(result.html, /표시할 MMR이 아직 없어요|검색어에 맞는 플레이어가 없어요/u);
  const query = parseMmrPlayerQuery(links(result.html, "다시 불러오기")[0].url.href);
  assert.equal(query.page, 2);
  assert.equal(query.query, "합성");
  assert.equal(query.position, "MID");
  assert.equal(query.pageSize, 10);
});
