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
const base = "src/app/(admin)/admin/progress/destruction";
const statuses = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED", "CANCELLED"];
const statusNames = ["대회 준비", "참가 모집", "주장·포인트 확정", "선수 경매", "예선", "본선", "종료", "취소"];
const formats = ["FULL_ROUND_ROBIN_BO3", "FULL_ROUND_ROBIN_BO1", "GROUP_ROUND_ROBIN_BO3", "GROUP_ROUND_ROBIN_BO1", "SWISS_ROUND_BO3", "SWISS_ROUND_BO1", "RANDOM_ROUNDS_BO3", "RANDOM_ROUNDS_BO1"];
const formatNames = ["전체 풀리그 · 3판 2선승", "전체 풀리그 · 단판", "조별 풀리그 · 3판 2선승", "조별 풀리그 · 단판", "스위스 라운드 · 3판 2선승", "스위스 라운드 · 단판", "랜덤 라운드 · 3판 2선승", "랜덤 라운드 · 단판"];
const id = "60000000-0000-4000-8000-000000000001";
const items = statuses.map((status, index) => ({
  id: `${id.slice(0, -1)}${index + 1}`, title: `합성 멸망전 ${index + 1}`,
  status, preliminaryFormat: formats[index], participantCount: index + 1,
  teams: [{ id: "synthetic-team", name: "합성 팀" }], revision: index + 3,
}));

function harness() {
  const modules = new Map(), calls = [];
  let requestedQuery;
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} }; modules.set(filename, loaded);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports: loaded.exports, URL, URLSearchParams,
      require(specifier) {
        if (specifier.startsWith("node:")) return requireNode(specifier);
        if (specifier === "react/jsx-runtime") return jsx;
        if (specifier === "next/link") return function Link(props) { return createElement("a", { ...props, scroll: undefined, prefetch: undefined }); };
        if (specifier === "next/navigation") return { notFound: () => { throw new Error("notFound"); }, permanentRedirect: () => { throw new Error("unexpected redirect"); } };
        if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
        if (specifier.endsWith("/theme-icons")) return { Plus: () => null, ArrowLeft: () => null, Gavel: () => null };
        if (specifier.endsWith("/server-authorization")) return { requirePageRole: async (...args) => { calls.push(args); return { role: "ADMIN" }; } };
        if (specifier.endsWith("/destruction-admin-actions")) return { DestructionAdminActions: () => null };
        if (specifier.endsWith("/runtime-destruction")) return {
          loadRuntimeDestruction: async (read) => ({ state: "ready", data: await read({ repository: { listAdmin: async (query) => { calls.push("listAdmin"); requestedQuery = query; return { items }; } } }) }),
          getRuntimeDestruction: () => ({ repository: { getAdminWorkspace: async () => ({
            destruction: { id, title: "합성 멸망전", lifecycle: { status: "AUCTION" }, configuration: { preliminaryFormat: formats[0], teamCount: 4, gameMode: "CLASSIC" }, teams: [], participants: [], preliminaryFixtures: [], mvpBallots: [], replacements: [], tournamentBracket: null },
            playerOptions: [], playerLabels: {}, galleryOptions: [],
          }) } }),
        };
        if (specifier === "@/modules/competitions/destruction") return {
          ...load(path.join(root, "src/modules/competitions/destruction/configuration.ts")),
          ...load(path.join(root, "src/modules/competitions/destruction/http-contract.ts")),
          ...load(path.join(root, "src/modules/competitions/destruction/destruction-service.ts")),
        };
        const resolved = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        const candidate = [`${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, "index.ts")].find(existsSync);
        assert.ok(candidate, `Unexpected dependency: ${specifier}`);
        return load(candidate);
      },
    });
    return loaded.exports;
  }
  return {
    calls,
    query: () => requestedQuery,
    parse: (url) => load(path.join(root, "src/modules/competitions/destruction/http-contract.ts")).parseDestructionListQuery(url),
    async list(searchParams = {}) { return renderToStaticMarkup(await load(path.join(root, base, "page.tsx")).default({ searchParams: Promise.resolve(searchParams) })); },
    async detail() { return renderToStaticMarkup(await load(path.join(root, base, "[tournamentId]/page.tsx")).default({ params: Promise.resolve({ tournamentId: id }), searchParams: Promise.resolve({}) })); },
  };
}

function options(html, name) {
  const select = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>(.*?)</select>`, "u"));
  assert.ok(select, `${name} selector must exist`);
  return [...select[1].matchAll(/<option([^>]*)>(.*?)<\/option>/gu)].map((match) => ({
    value: match[1].match(/value="([^"]*)"/u)?.[1] ?? match[2], label: match[2], selected: match[1].includes("selected="),
  }));
}

test("admin destruction filters display distinct Korean choices while submitting canonical values to the existing parser", async () => {
  const subject = harness();
  const html = await subject.list({ q: "합성", status: "AUCTION", format: "SWISS_ROUND_BO1" });
  const statusOptions = options(html, "status"), formatOptions = options(html, "format");
  assert.deepEqual(statusOptions.map((option) => option.label), ["전체", ...statusNames]);
  assert.deepEqual(formatOptions.map((option) => option.label), ["전체", ...formatNames]);
  assert.deepEqual(statusOptions.map((option) => option.value), ["", ...statuses]);
  assert.deepEqual(formatOptions.map((option) => option.value), ["", ...formats]);
  assert.equal(new Set(formatOptions.map((option) => option.label)).size, 9, "BO1 and BO3 must remain distinguishable");
  assert.equal(statusOptions.find((option) => option.selected)?.value, "AUCTION");
  assert.equal(formatOptions.find((option) => option.selected)?.value, "SWISS_ROUND_BO1");
  assert.equal(subject.query().status, "AUCTION"); assert.equal(subject.query().format, "SWISS_ROUND_BO1"); assert.equal(subject.query().query, "합성");
  for (let index = 1; index < statusOptions.length; index++) {
    const url = new URL("https://test.invalid/admin/progress/destruction");
    url.searchParams.set("status", statusOptions[index].value); url.searchParams.set("format", formatOptions[index].value);
    const query = subject.parse(url.href);
    assert.ok(query, "display labels must never replace the query values");
    assert.equal(query.status, statuses[index - 1]); assert.equal(query.format, formats[index - 1]);
  }
  assert.deepEqual(subject.calls[0], ["ADMIN", "/admin/progress/destruction"]);
  assert.equal(subject.calls[1], "listAdmin");
});

test("admin destruction result cards preserve identity, counts and revision while describing the format and lifecycle in Korean", async () => {
  const html = await harness().list();
  const cards = [...html.matchAll(/<a href="\/admin\/progress\/destruction\/([^"]+)">(.*?)<\/a>/gu)].filter((match) => match[1] !== "new");
  assert.equal(cards.length, items.length);
  for (let index = 0; index < cards.length; index++) {
    const [, target, content] = cards[index];
    assert.equal(target, items[index].id);
    assert.ok(content.includes(`<strong>합성 멸망전 ${index + 1}</strong>`));
    assert.ok(content.includes(`<span>${formatNames[index]} · ${statusNames[index]}</span>`), `card ${index + 1} needs readable format and status`);
    assert.ok(content.includes(`<b>${index + 1}/5</b>`));
    assert.ok(content.includes(`변경 버전 ${index + 3}`));
    assert.doesNotMatch(content.replace(/<[^>]+>/gu, ""), /PLANNED|RECRUITING|TEAM_BUILDING|AUCTION|PRELIMINARY|TOURNAMENT|COMPLETED|CANCELLED|_BO[13]/u);
  }
});

test("the connected admin detail already uses the same Korean stages and format without changing canonical stage links", async () => {
  const html = await harness().detail();
  const text = html.replace(/<[^>]+>/gu, "");
  assert.ok(text.includes("전체 풀리그 · 3판 2선승"));
  assert.ok(text.includes("현재 단계선수 경매"));
  for (let index = 0; index < statuses.length - 1; index++) {
    assert.ok(html.includes(`href="?stage=${statuses[index]}"`));
    assert.ok(text.includes(statusNames[index]));
  }
  assert.doesNotMatch(text, /PLANNED|RECRUITING|TEAM_BUILDING|AUCTION|PRELIMINARY|TOURNAMENT|COMPLETED|FULL_ROUND_ROBIN/u);
  assert.ok(html.includes(`href="/competitions/destruction/${id}"`));
});
