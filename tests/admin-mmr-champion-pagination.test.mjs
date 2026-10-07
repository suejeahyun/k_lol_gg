import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createElement, isValidElement } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function load(file, dependencies = {}) {
  const subject = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: subject.exports, URL, URLSearchParams, require(specifier) { assert.ok(Object.hasOwn(dependencies, specifier), specifier); return dependencies[specifier]; } });
  return subject.exports;
}
const projection = load("src/modules/mmr/domain/mmr-projection.ts");
const mmr = { ...projection, ...load("src/modules/mmr/application/mmr-query.ts", { "../domain/mmr-projection": projection }) };
const champions = load("src/modules/champions/application/query-service.ts", { "../domain/champion": load("src/modules/champions/domain/champion.ts") });
const display = load("src/modules/competitions/core/display-projection.ts");
const css = { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
const reviewId = "70000000-0000-4000-8000-000000000001";

async function render(kind, searchParams = {}, { total = 31, state = "ready" } = {}) {
  let calls = 0, query;
  const read = async (value) => {
    query = value;
    return { ...value, total, totalPages: Math.ceil(total / value.pageSize), items: Array.from({ length: Math.min(value.pageSize, Math.max(0, total - (value.page - 1) * value.pageSize)) }, (_, index) => {
      const number = (value.page - 1) * value.pageSize + index + 1;
      return { id: reviewId, playerId: `synthetic-${number}`, displayName: `합성 이름 ${number}`, playerDisplayName: `합성 선수 ${number}`, riotId: "Synthetic#QA", overallScore: 53.24, confidence: .8, sampleSize: 20,
        positions: Object.fromEntries(projection.MMR_POSITIONS.map((position) => [position, { score: position === "MID" ? 76.25 : 0, sampleSize: position === "MID" ? 7 : 0 }])),
        position: "MID", deltaBp: 100, reasonCode: "SYNTHETIC", publicNote: "합성 조정", createdAt: "2026-10-08T00:00:00.000Z", key: `synthetic-${number}`, imageUrl: null, status: value.status ?? "ACTIVE", revision: 2 };
    }) };
  };
  const dependencies = {
    "react/jsx-runtime": jsx, "next/link": function Link(props) { return createElement("a", props); },
    "@/components/theme/theme-icons": new Proxy({}, { get: () => () => null }),
    "@/modules/auth/infrastructure/server-authorization": { requirePageRole: async () => ({ role: "ADMIN" }) },
    "@/modules/mmr": mmr, "@/modules/champions": champions,
    "@/modules/competitions/core/display-projection": display,
    "./mmr-admin.module.css": css, "@/components/admin/media/admin-media.module.css": css,
    "./mmr-admin-actions": { MmrAdminActions: () => null }, "./team-balance-override-actions": { TeamBalanceOverrideActions: () => null },
    "@/components/admin/media/admin-media-pages": { AdminContentTabs: () => null },
    "@/components/champions/champion-portrait": { ChampionPortrait: () => null },
    "@/modules/champions/domain/champion-image": { officialChampionImageUrl: () => "synthetic" },
    "@/modules/mmr/infrastructure/runtime-mmr": { loadRuntimeMmr: async (callback) => { calls++; return state !== "ready" ? { state } : { state, data: await callback({ getSummary: async () => ({ generation: 3, sourceMatchCount: 5, sourceGameCount: 10, pendingSourceCount: 0, sourceAdjustmentCount: total, formulaTransition: null }), listPlayers: read, listAdjustments: (page, pageSize) => read({ page, pageSize }), getAdjustment: async () => ({ id: reviewId, playerId: "synthetic-1", playerDisplayName: "선택한 합성 선수", position: "MID", deltaBp: 100, reasonCode: "SYNTHETIC", publicNote: "합성 조정", createdAt: "2026-10-08T00:00:00.000Z" }) }) }; } },
    "@/modules/champions/infrastructure/runtime-champions": { loadRuntimeChampions: async (_admin, callback) => { calls++; return state !== "ready" ? { state } : { state, data: await callback({ listAdmin: read }) }; } },
  };
  const element = await load(`src/app/(admin)/admin/${kind}/page.tsx`, dependencies).default({ searchParams: Promise.resolve(searchParams) });
  function findForm(node) {
    if (!isValidElement(node)) return null;
    if (node.type === "form") return node;
    for (const child of [node.props.children].flat()) { const found = findForm(child); if (found) return found; }
    return null;
  }
  return { html: renderToStaticMarkup(element), calls, query, form: findForm(element) };
}
function links(html, label) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gu)].filter((match) => match[2] === label).map((match) => new URL(match[1].replaceAll("&amp;", "&"), "https://test.invalid"));
}
function parseMmrUrl(url, tab) {
  assert.equal(url.searchParams.get("tab"), tab);
  url.searchParams.delete("tab");
  return tab === "reviews" ? mmr.parseMmrReviewQuery(url.href) : mmr.parseMmrPlayerQuery(url.href);
}

test("MMR players retain query, position and page size across page navigation and show the score used for ordering", async () => {
  const result = await render("balance-ai", { tab: "players", q: "합성 선수", position: "MID", page: "2", pageSize: "10" });
  assert.match(result.html, /합성 이름 11/u); assert.match(result.html, /76\.25/u); assert.doesNotMatch(result.html, /53\.24/u);
  for (const [label, page] of [["이전", 1], ["다음", 3]]) {
    const [url] = links(result.html, label); assert.ok(url, label);
    const query = parseMmrUrl(url, "players");
    assert.equal(query.page, page); assert.equal(query.pageSize, 10); assert.equal(query.query, "합성 선수"); assert.equal(query.position, "MID");
  }
  assert.match(result.html, /aria-label="MMR 플레이어 목록 페이지"/u);
  assert.match(result.html, /name="tab" value="players"/u); assert.doesNotMatch(result.html, /name="page"/u);
  assert.ok(result.form, "existing searchable service must be reachable through the page");
  const changed = await render("balance-ai", { tab: "players", q: "다른 선수", position: "TOP", pageSize: "10" });
  assert.notEqual(result.form.key, changed.form.key);
  assert.match(changed.html, /0\.00/u); assert.doesNotMatch(changed.html, /53\.24/u);
});

test("MMR review pagination uses its independent query contract and detail close retains the current page", async () => {
  const result = await render("balance-ai", { tab: "reviews", page: "2", pageSize: "10", review: reviewId });
  assert.match(result.html, /합성 선수 11/u);
  for (const [label, page] of [["이전", 1], ["다음", 3], ["닫기", 2]]) {
    const [url] = links(result.html, label); assert.ok(url, label);
    assert.equal(url.searchParams.has("review"), false); assert.equal(url.searchParams.has("action"), false);
    const query = parseMmrUrl(url, "reviews"); assert.equal(query.page, page); assert.equal(query.pageSize, 10);
  }
  assert.match(result.html, /aria-label="MMR 조정 이력 페이지"/u);
  assert.doesNotMatch(result.html, /name="q"|name="position"/u);
  const [playersTab] = links(result.html, "플레이어");
  const query = parseMmrUrl(playersTab, "players"); assert.equal(query.page, 1); assert.equal(query.pageSize, 10);
});

test("MMR invalid and duplicated queries do not silently display an unrelated first page; empty pages recover within their tab", async () => {
  for (const input of [{ tab: "players", page: "bad" }, { tab: "players", q: ["a", "b"] }, { tab: "reviews", page: ["1", "2"] }, { tab: "reviews", position: "MID" }, { tab: ["players"] }, { tab: "unknown" }]) {
    const result = await render("balance-ai", input); assert.equal(result.calls, 0); assert.match(result.html, /목록 조건을 확인/u); assert.equal(links(result.html, "목록 초기화").length, 1);
  }
  const capped = await render("balance-ai", { tab: "players", page: "10000", pageSize: "10" }, { total: 100_001 });
  assert.equal(links(capped.html, "다음").length, 0);
  for (const tab of ["players", "reviews"]) {
    const input = { tab, page: "5", pageSize: "10", ...(tab === "players" ? { q: "합성", position: "MID" } : {}) };
    const result = await render("balance-ai", input); assert.match(result.html, /현재 페이지/u);
    const query = parseMmrUrl(links(result.html, "첫 페이지로")[0], tab); assert.equal(query.page, 1); assert.equal(query.pageSize, 10);
    if (tab === "players") { assert.equal(query.query, "합성"); assert.equal(query.position, "MID"); }
    const first = await render("balance-ai", { tab, pageSize: "10" }); assert.equal(links(first.html, "이전").length, 0);
    const last = await render("balance-ai", { tab, page: "4", pageSize: "10" }); assert.equal(links(last.html, "다음").length, 0);
    const failed = await render("balance-ai", input, { state: "error" });
    const retry = parseMmrUrl(links(failed.html, "다시 불러오기")[0], tab); assert.equal(retry.page, 5);
  }
});

test("champion previous and next retain search, status and size, while edited filters reset to page one", async () => {
  const input = { q: "합성 & 키", status: "INACTIVE", page: "2", pageSize: "10" };
  const result = await render("champions", input);
  for (const [label, page] of [["이전", 1], ["다음", 3]]) {
    const [url] = links(result.html, label); assert.ok(url);
    const query = champions.parseChampionListQuery(url.href, true); assert.ok(query);
    assert.equal(query.page, page); assert.equal(query.query, input.q); assert.equal(query.status, input.status); assert.equal(query.pageSize, 10);
  }
  assert.doesNotMatch(result.html, /name="page"/u); assert.match(result.html, /name="pageSize" value="10"/u);
  const changed = await render("champions", { ...input, status: "ACTIVE" }); assert.notEqual(result.form.key, changed.form.key);
});

test("champion status choices and badges use Korean labels while retaining canonical filter values", async () => {
  for (const [status, label] of [["ACTIVE", "활성"], ["INACTIVE", "비활성"]]) {
    const result = await render("champions", { status, pageSize: "1" }, { total: 1 });
    assert.match(result.html, new RegExp(`<option value="${status}" selected="">${label}</option>`, "u"));
    assert.match(result.html, new RegExp(`data-state="${status}">${label}</span>`, "u"));
    assert.match(result.html, /변경 버전 2/u);
    assert.equal(result.query.status, status);
  }
});

test("champion invalid, unavailable, unmatched and out-of-range pages each have a valid recovery", async () => {
  for (const input of [{ page: "bad" }, { status: ["ACTIVE", "INACTIVE"] }]) {
    const result = await render("champions", input); assert.equal(result.calls, 0); assert.match(result.html, /목록 조건을 확인/u); assert.ok(links(result.html, "목록 초기화")[0]);
  }
  const input = { q: "합성", status: "INACTIVE", page: "5", pageSize: "10" };
  const emptyPage = await render("champions", input); assert.match(emptyPage.html, /현재 페이지/u);
  const first = champions.parseChampionListQuery(links(emptyPage.html, "첫 페이지로")[0].href, true);
  assert.equal(first.page, 1); assert.equal(first.query, "합성"); assert.equal(first.status, "INACTIVE"); assert.equal(first.pageSize, 10);
  const unmatched = await render("champions", input, { total: 0 });
  const reset = champions.parseChampionListQuery(links(unmatched.html, "검색 초기화")[0].href, true); assert.equal(reset.query, null); assert.equal(reset.status, null); assert.equal(reset.pageSize, 10);
  const failed = await render("champions", input, { state: "error" });
  const retry = champions.parseChampionListQuery(links(failed.html, "다시 불러오기")[0].href, true); assert.equal(retry.page, 5); assert.equal(retry.query, "합성"); assert.equal(retry.status, "INACTIVE");
  assert.equal(links((await render("champions", { pageSize: "10" })).html, "이전").length, 0);
  assert.equal(links((await render("champions", { page: "4", pageSize: "10" })).html, "다음").length, 0);
  const capped = await render("champions", { page: "1000", pageSize: "1" }, { total: 1_001 });
  assert.equal(links(capped.html, "다음").length, 0);
});
