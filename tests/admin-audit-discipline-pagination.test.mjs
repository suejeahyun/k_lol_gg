import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { Children, createElement, isValidElement } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const queryAt = (href) => Object.fromEntries(new URL(href, "https://test.invalid").searchParams);
const links = (html) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gu)].map(([, href, label]) => ({ href: href.replaceAll("&amp;", "&"), label: label.replace(/<[^>]+>/gu, "") }));
const hrefFor = (html, label) => { const link = links(html).find((item) => item.label === label); assert.ok(link, `${label} should be available`); return link.href; };
function find(tree, predicate) { if (!isValidElement(tree)) return null; if (predicate(tree)) return tree; for (const child of Children.toArray(tree.props.children)) { const result = find(child, predicate); if (result) return result; } return null; }

function harness(kind, { total = 101, state = "ready", denied = false } = {}) {
  const calls = [], reads = [];
  const pageItems = (query, type) => {
    reads.push({ type, query: JSON.parse(JSON.stringify(query)) });
    const start = (query.page - 1) * query.pageSize;
    return { totalCount: total, items: Array.from({ length: Math.max(0, Math.min(query.pageSize, total - start)) }, (_, index) => {
      const id = start + index + 1;
      if (type === "discipline") return { id: `discipline-${id}`, targetName: `합성 징계 ${id}`, type: "WARNING", active: true, task: null, createdAt: "2026-10-07T00:00:00.000Z" };
      if (type === "events") return { id, action: query.action ?? "SYNTHETIC", targetType: "합성 감사", targetId: id, actorUserAccountId: null, requestId: `request-${id}`, createdAt: "2026-10-07T00:00:00.000Z" };
      return { id: `ai-${id}`, status: query.status ?? "SUCCEEDED", actorRole: "ADMIN", promptHashPrefix: `hash-${id}`, inputTokens: 2, outputTokens: 3, estimatedCostMicros: 1, failureCode: null, createdAt: "2026-10-07T00:00:00.000Z" };
    }) };
  };
  const repository = {
    listAuditLogs: async (query) => pageItems(query, "events"),
    listAiRequests: async (query) => pageItems(query, "ai-requests"),
    getAuditStats: async () => { reads.push({ type: "stats" }); return { totalEvents: total, eventsLast24Hours: 2, uniqueActorsLast24Hours: 1, latestEventAt: null }; },
  };
  const loaded = { exports: {} };
  const source = readFileSync(new URL(`../src/app/(admin)/admin/${kind}/page.tsx`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: loaded.exports, URLSearchParams, require(name) {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/link") return { __esModule: true, default: (props) => createElement("a", { ...props, prefetch: undefined }) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.endsWith("/server-authorization")) return { requirePageRole: async (...args) => { calls.push(args); if (denied) throw new Error("DENIED"); return { role: "ADMIN" }; } };
    if (name.endsWith("/runtime-discipline")) return { loadRuntimeDiscipline: async (callback) => state !== "ready" ? { state } : { state, data: await callback({ adapter: { listAdmin: async (query) => pageItems(query, "discipline") } }) } };
    if (name.endsWith("/runtime-operations")) return { loadRuntimeOperations: async (callback) => state !== "ready" ? { state } : { state, data: await callback(repository) } };
    throw new Error(`Unexpected page dependency ${name}`);
  } });
  const renderTree = (raw = {}) => loaded.exports.default({ searchParams: Promise.resolve(raw) });
  return { calls, reads, renderTree, render: async (raw = {}) => renderToStaticMarkup(await renderTree(raw)) };
}

test("discipline reaches records 51–101 and returns without losing the selected classification", async () => {
  const subject = harness("discipline");
  const first = await subject.render({ tab: "reviews" });
  assert.ok(first.includes("합성 징계 50")); assert.ok(!first.includes("합성 징계 51"));
  const next = queryAt(hrefFor(first, "다음")); assert.equal(next.tab, "reviews"); assert.equal(next.page, "2");
  const second = await subject.render(next); assert.ok(second.includes("합성 징계 51")); assert.ok(second.includes("합성 징계 100"));
  const previous = queryAt(hrefFor(second, "이전")); assert.equal(previous.tab, "reviews"); assert.equal(previous.page ?? "1", "1");
  const last = await subject.render(queryAt(hrefFor(second, "다음"))); assert.ok(last.includes("합성 징계 101")); assert.equal(links(last).some((link) => link.label === "다음"), false);
  assert.deepEqual(subject.calls[0], ["ADMIN", "/admin/discipline"]);
  assert.deepEqual(subject.reads[1], { type: "discipline", query: { tab: "reviews", page: 2, pageSize: 50 } });
  const tasks = queryAt(hrefFor(second, "과제")); assert.equal(tasks.tab, "tasks"); assert.equal(tasks.page ?? "1", "1");
});

test("logs keeps each ledger's page and filters while requesting only the displayed ledger", async () => {
  const subject = harness("logs", { total: 201 });
  const input = { view: "events", eventsPage: "2", aiPage: "3", action: "MMR_PROJECTION_REBUILT", status: "FAILED" };
  const events = await subject.render(input);
  assert.ok(events.includes("합성 감사 · 51")); assert.ok(events.includes("합성 감사 · 100"));
  assert.deepEqual(subject.reads, [{ type: "events", query: { page: 2, pageSize: 50, action: input.action } }]);
  const next = queryAt(hrefFor(events, "다음")); assert.equal(next.eventsPage, "3"); assert.equal(next.aiPage, "3"); assert.equal(next.action, input.action); assert.equal(next.status, "FAILED");
  const aiQuery = queryAt(hrefFor(events, "AI 요청 원장")); assert.equal(aiQuery.view, "ai-requests"); assert.equal(aiQuery.eventsPage, "2"); assert.equal(aiQuery.aiPage, "3");
  const ai = await subject.render(aiQuery); assert.ok(ai.includes("hash-101")); assert.ok(ai.includes("hash-150"));
  assert.deepEqual(subject.reads.at(-1), { type: "ai-requests", query: { page: 3, pageSize: 50, status: "FAILED" } });
  assert.equal(queryAt(hrefFor(ai, "이전")).aiPage, "2");
  assert.equal(queryAt(hrefFor(ai, "감사 이벤트")).eventsPage, "2");
  const stats = await subject.render(queryAt(hrefFor(ai, "통계"))); assert.ok(stats.includes("전체 이벤트"));
  assert.deepEqual(subject.reads.map((read) => read.type), ["events", "ai-requests", "stats"]);
  assert.equal(queryAt(hrefFor(stats, "AI 요청 원장")).aiPage, "3");
  assert.deepEqual(subject.calls[0], ["ADMIN", "/admin/logs"]);
});

test("log filters reset their own page while preserving the other ledger context", async () => {
  const input = { view: "events", eventsPage: "2", aiPage: "3", action: "SYNTHETIC", status: "FAILED" };
  const subject = harness("logs", { total: 201 });
  const html = await subject.render(input), form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/u)?.[0]; assert.ok(form);
  assert.match(form, /name="action"/u); assert.doesNotMatch(form, /name="eventsPage"/u); assert.match(form, /name="aiPage"[^>]*value="3"/u); assert.match(form, /name="status"[^>]*value="FAILED"/u);
  const reset = queryAt(hrefFor(html, "필터 초기화")); assert.equal(reset.action, undefined); assert.equal(reset.eventsPage ?? "1", "1"); assert.equal(reset.aiPage, "3"); assert.equal(reset.status, "FAILED");
  const ai = await subject.render({ ...input, view: "ai-requests" }), aiForm = ai.match(/<form\b[^>]*>[\s\S]*?<\/form>/u)?.[0]; assert.ok(aiForm);
  assert.match(aiForm, /name="status"/u); assert.doesNotMatch(aiForm, /name="aiPage"/u); assert.match(aiForm, /name="eventsPage"[^>]*value="2"/u); assert.match(aiForm, /name="action"[^>]*value="SYNTHETIC"/u);
  const filteredForm = find(await subject.renderTree(input), (node) => node.type === "form");
  const resetForm = find(await subject.renderTree(reset), (node) => node.type === "form");
  assert.notEqual(filteredForm.key, resetForm.key, "client reset/back navigation must replace uncontrolled form values");
  assert.equal(find(resetForm, (node) => node.props.name === "action").props.defaultValue, "");
});

for (const [kind, query, pageKey] of [["discipline", { tab: "tasks", page: "9" }, "page"], ["logs", { view: "ai-requests", aiPage: "9", eventsPage: "2", status: "FAILED", action: "SYNTHETIC" }, "aiPage"]]) {
  test(`${kind}: out-of-range page recovers without calling it an empty data set`, async () => {
    const html = await harness(kind).render(query); assert.ok(html.includes("현재 페이지에 기록이 없습니다."));
    const first = queryAt(hrefFor(html, "첫 페이지로")); assert.equal(first[pageKey] ?? "1", "1");
    for (const [key, value] of Object.entries(query)) if (key !== pageKey) assert.equal(first[key], value);
    assert.equal(links(html).some((link) => link.label === "다음"), false);
  });
  test(`${kind}: empty, unavailable and error states provide truthful recovery`, async () => {
    const firstQuery = { ...query, [pageKey]: "1" };
    const empty = await harness(kind, { total: 0 }).render(firstQuery); assert.ok(empty.includes("기록이 없습니다.")); assert.ok(!empty.includes("현재 페이지에 기록이 없습니다."));
    for (const state of ["error", "unavailable"]) {
      const subject = harness(kind, { state }), html = await subject.render(query);
      assert.equal(state === "error" ? html.includes('role="alert"') : html.includes('role="status"'), true);
      const retry = queryAt(hrefFor(html, "다시 불러오기")); for (const [key, value] of Object.entries(query)) assert.equal(retry[key], value);
      assert.equal(find(await subject.renderTree(query), (node) => node.props.children === "다시 불러오기").type, "a", "retry must request the failed address again instead of reusing a cached client route");
      assert.equal(subject.reads.length, 0);
    }
  });
}

test("invalid or duplicated queries never start list reads and both pages retain the ADMIN guard", async () => {
  const cases = {
    discipline: [{ page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "1e2" }, { page: "10001" }, { page: ["1", "2"] }, { tab: "other" }, { tab: ["records", "tasks"] }, { extra: "value" }],
    logs: [{ eventsPage: "0" }, { eventsPage: "10001" }, { eventsPage: ["1", "2"] }, { aiPage: "bad" }, { aiPage: "-1" }, { aiPage: "10001" }, { aiPage: ["1", "2"] }, { view: "other" }, { view: ["stats", "events"] }, { action: "bad action" }, { action: "A".repeat(97) }, { action: ["A", "B"] }, { status: "UNKNOWN" }, { status: ["FAILED", "PENDING"] }, { extra: "value" }],
  };
  for (const [kind, entries] of Object.entries(cases)) {
    for (const query of entries) {
      const subject = harness(kind), html = await subject.render(query); assert.ok(html.includes("조회 조건을 확인해 주세요."), `${kind} ${JSON.stringify(query)}`); assert.equal(subject.reads.length, 0); assert.ok(links(html).some((link) => link.href === `/admin/${kind}`));
    }
    const denied = harness(kind, { denied: true }); await assert.rejects(denied.render(), /DENIED/u); assert.equal(denied.reads.length, 0);
  }
});

test("the accepted upper page has a previous action but never emits a page outside the bound", async () => {
  for (const [kind, query] of [["discipline", { tab: "records", page: "10000" }], ["logs", { view: "events", eventsPage: "10000" }], ["logs", { view: "ai-requests", aiPage: "10000" }]]) {
    const subject = harness(kind, { total: 500001 }), html = await subject.render(query);
    assert.ok(hrefFor(html, "이전")); assert.equal(links(html).some((link) => link.label === "다음"), false);
    assert.equal(subject.reads[0].query.page, 10000); assert.equal(subject.reads[0].query.pageSize, 50);
    assert.ok(html.includes("500,000"));
  }
});
