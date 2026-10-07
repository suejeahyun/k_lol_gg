import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const requireNode = createRequire(import.meta.url);
const cases = [
  { kind: "event", status: "IN_PROGRESS", format: "ARAM", label: "이벤트전" },
  { kind: "destruction", status: "TOURNAMENT", format: "SWISS_ROUND_BO1", label: "멸망전" },
];
const decode = (value) => value.replaceAll("&amp;", "&");
function links(html) { return [...html.matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>(.*?)<\/a>/gu)].map(([, before, href, after, label]) => ({ href: decode(href), label: label.replace(/<[^>]+>/gu, ""), attrs: before + after })); }
function queryAt(href) { return Object.fromEntries(new URL(href, "https://test.invalid").searchParams); }

function harness(config, { total = 25, state = "ready", denied = false } = {}) {
  const modules = new Map(), calls = [], reads = [];
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} }; modules.set(filename, loaded);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports: loaded.exports, URL, URLSearchParams, require(specifier) {
      if (specifier.startsWith("node:")) return requireNode(specifier);
      if (specifier === "react/jsx-runtime") return jsx;
      if (specifier === "next/link") return function Link(props) { return createElement("a", { ...props, prefetch: undefined, scroll: undefined }); };
      if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (specifier.endsWith("/theme-icons")) return { Plus: () => null };
      if (specifier.endsWith("/server-authorization")) return { requirePageRole: async (...args) => { calls.push(args); if (denied) throw new Error("DENIED"); return { role: "ADMIN" }; } };
      if (specifier.endsWith("/runtime-event") || specifier.endsWith("/runtime-destruction")) {
        const read = async (callback) => {
          if (state !== "ready") return { state };
          return { state, data: await callback({ repository: { listAdmin: async (query) => {
            reads.push(query); const start = (query.page - 1) * query.pageSize;
            const count = Math.max(0, Math.min(query.pageSize, total - start));
            const items = Array.from({ length: count }, (_, index) => ({
              id: `60000000-0000-4000-8000-${String(start + index + 1).padStart(12, "0")}`,
              title: `합성 대회 ${start + index + 1}`, status: config.status, format: config.format, preliminaryFormat: config.format,
              participantCount: 3, teams: [], revision: 5,
            }));
            return { items, total, totalPages: Math.ceil(total / query.pageSize), page: query.page, pageSize: query.pageSize };
          } } }) };
        };
        return { loadRuntimeEvent: read, loadRuntimeDestruction: read };
      }
      if (specifier === "@/modules/competitions/destruction") return {
        ...load(path.join(root, "src/modules/competitions/destruction/configuration.ts")),
        ...load(path.join(root, "src/modules/competitions/destruction/http-contract.ts")),
      };
      if (specifier === "@/modules/competitions/events") return {
        ...load(path.join(root, "src/modules/competitions/events/domain/event.ts")),
        ...load(path.join(root, "src/modules/competitions/events/application/event-query.ts")),
      };
      const base = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      const candidate = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(existsSync);
      assert.ok(candidate, `Unexpected dependency: ${specifier}`); return load(candidate);
    } }, { filename });
    return loaded.exports;
  }
  return { calls, reads, async render(raw = {}) {
    return renderToStaticMarkup(await load(path.join(root, `src/app/(admin)/admin/progress/${config.kind}/page.tsx`)).default({ searchParams: Promise.resolve(raw) }));
  } };
}

for (const config of cases) {
  const route = `/admin/progress/${config.kind}`;
  const filtered = { q: "합성 & 오래된 대회", status: config.status, format: config.format, pageSize: "12" };
  test(`${config.kind} administrators can reach records 13–25 and return without losing filters`, async () => {
    const subject = harness(config);
    const first = await subject.render(filtered);
    assert.ok(first.includes("합성 대회 12")); assert.ok(!first.includes("합성 대회 13"));
    const next = links(first).find((link) => link.label === "다음");
    assert.ok(next, "more than twelve records require a discoverable next-page action");
    assert.deepEqual(queryAt(next.href), { ...filtered, page: "2" });
    const second = await subject.render(queryAt(next.href));
    assert.ok(second.includes("합성 대회 13")); assert.ok(second.includes("합성 대회 24"));
    const previous = links(second).find((link) => link.label === "이전");
    assert.deepEqual(queryAt(previous.href), { ...filtered, page: "1" });
    const last = await subject.render(queryAt(links(second).find((link) => link.label === "다음").href));
    assert.ok(last.includes("합성 대회 25")); assert.equal(links(last).some((link) => link.label === "다음"), false);
    assert.deepEqual(subject.calls[0], ["ADMIN", route]);
    assert.equal(subject.reads[1].query, filtered.q);
  });

  test(`${config.kind} search keeps page size, starts at page one and retains canonical filter values`, async () => {
    const html = await harness(config, { total: 60 }).render({ ...filtered, page: "2", pageSize: "24" });
    const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/u)?.[0]; assert.ok(form);
    assert.match(form, /<input[^>]*type="hidden"[^>]*name="pageSize"[^>]*value="24"/u);
    assert.doesNotMatch(form, /name="page"/u);
    assert.ok(form.includes(`value="${config.status}"`)); assert.ok(form.includes(`value="${config.format}"`));
    const next = links(html).find((link) => link.label === "다음");
    assert.deepEqual(queryAt(next.href), { ...filtered, page: "3", pageSize: "24" });
    const reset = links(html).find((link) => link.label === "검색 초기화");
    assert.ok(reset); assert.deepEqual(queryAt(reset.href), { pageSize: "24" });
  });

  test(`${config.kind} out-of-range empty page returns to the same filtered first page`, async () => {
    const html = await harness(config).render({ ...filtered, page: "9" });
    assert.ok(html.includes("현재 페이지에 대회가 없습니다."));
    const recovery = links(html).find((link) => link.label === "첫 페이지로");
    assert.ok(recovery); assert.deepEqual(queryAt(recovery.href), { ...filtered, page: "1" });
    assert.ok(!html.includes(`등록된 ${config.label}이 없습니다.`));
    assert.equal(links(html).some((link) => link.label === "다음" || link.label === "이전"), false);
  });

  test(`${config.kind} empty filtered and initial states differ, and failed loads can retry the same query`, async () => {
    const empty = harness(config, { total: 0 });
    const filteredHtml = await empty.render(filtered);
    assert.ok(filteredHtml.includes(`조건에 맞는 ${config.label}이 없습니다.`));
    assert.ok(links(filteredHtml).some((link) => link.label === "검색 초기화"));
    const initial = await empty.render(); assert.ok(initial.includes(`등록된 ${config.label}이 없습니다.`));
    for (const state of ["error", "unavailable"]) {
      const failed = await harness(config, { state }).render({ ...filtered, page: "2" });
      const retry = links(failed).find((link) => link.label === "다시 불러오기"); assert.ok(retry);
      assert.deepEqual(queryAt(retry.href), { ...filtered, page: "2" });
      assert.ok(failed.includes(`role="${state === "error" ? "alert" : "status"}"`));
    }
  });

  test(`${config.kind} invalid pagination avoids accidental unfiltered reads and provides recovery`, async () => {
    for (const page of ["0", "bad", "10001", ["1", "2"]]) {
      const subject = harness(config); const html = await subject.render({ ...filtered, page });
      assert.ok(html.includes("목록 조건을 확인해 주세요.")); assert.equal(subject.reads.length, 0);
      assert.ok(html.includes('role="alert"'));
      assert.ok(links(html).some((link) => link.href === route));
    }
    const denied = harness(config, { denied: true }); await assert.rejects(denied.render(), /DENIED/u); assert.equal(denied.reads.length, 0);
  });

  test(`${config.kind} pagination never emits a page outside the existing parser limit`, async () => {
    const html = await harness(config, { total: 120001 }).render({ ...filtered, page: "10000" });
    assert.equal(links(html).some((link) => link.label === "다음"), false);
    const previous = links(html).find((link) => link.label === "이전");
    assert.ok(previous, "the highest accepted page must have a reachable previous page");
    assert.deepEqual(queryAt(previous.href), { ...filtered, page: "9999" });
  });
}
