import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import ts from "typescript";

const compile = (path, dependencies = {}) => {
  const compiledModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports: compiledModule.exports, URLSearchParams, require(specifier) {
    assert.ok(Object.hasOwn(dependencies, specifier), specifier);
    return dependencies[specifier];
  } });
  return compiledModule.exports;
};
const statistics = compile("../src/modules/statistics/domain/season-statistics.ts");
const views = compile("../src/modules/statistics/domain/public-ranking-view.ts", { "./season-statistics": statistics });
const longName = "W".repeat(16);
const rows = [longName, "가나다라마바사아자차카타파하가나"].map((displayName, index) => ({
  playerId: `f487a92a-2bb6-44de-a596-869ec7b5010${index}`, displayName, riotId: `${displayName}#QA123`,
  rank: index + 1, totalGames: 10, participationCount: 10, wins: 7 - index, losses: 3 + index, winRate: 70 - index * 10, kda: 2, mvpCount: 5 - index,
}));
async function render(view) {
  const page = compile("../src/app/(public)/(statistics)/rankings/page.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": ({ href, ...props }) => createElement("a", { ...props, href: typeof href === "string" ? href : `${href.pathname}?${new URLSearchParams(href.query)}` }),
    "./rankings.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
    "@/modules/seo/domain/site-seo": { createRouteMetadata: () => ({}) },
    "@/components/theme/theme-icons": new Proxy({}, { get: () => () => null }),
    "@/modules/auth/infrastructure/runtime-session": { getCurrentSession: async () => null },
    "@/modules/statistics/application/statistics-query": { isStatisticsUuid: () => false },
    "@/modules/statistics/domain/public-ranking-view": views,
    "@/platform/time/format-korean-date-time": { formatOptionalKoreanDateTime: () => "2026. 10. 6." },
    "@/modules/statistics/infrastructure/runtime-statistics-data": { loadRuntimeStatisticsData: async (read) => ({ state: "ready", data: await read({
      listPublicSeasons: async () => [{ id: "synthetic-season", name: "합성 시즌", status: "ACTIVE" }],
      getPublicSeasonRanking: async () => ({ season: { id: "synthetic-season" }, rankings: rows, projection: { status: "READY", sourceMatchCount: 10, sourceGameCount: 20 } }),
    }) }) },
  });
  return renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ view, minParticipation: "0" }) }));
}

test("rankings preserve complete Latin/Korean names, Riot IDs, player links, and separate metrics in every view", async () => {
  for (const view of ["win-rate", "participation", "mvp"]) {
    const html = await render(view);
    const podium = html.match(/<section class="podium"[^>]*>(.*?)<\/section>/s)?.[1];
    const board = html.match(/<section class="board"[^>]*>(.*?)<\/section>/s)?.[1];
    assert.ok(podium); assert.ok(board);
    for (const row of rows) {
      const identity = `<strong>${row.displayName}</strong><small>${row.riotId}</small>`;
      assert.ok(podium.includes(identity), "podium preserves the full visible identity");
      assert.ok(board.includes(`<a href="/players/${row.playerId}">${identity}</a>`), "the whole identity is a player link");
      const metric = views.publicRankingViewDefinition(view);
      assert.ok(board.includes(`<span><small>${metric.metricLabel}</small><strong>${metric.metric(row)}</strong></span>`), "name and score stay in separate grid cells");
    }
  }
});

test("ranking player links can shrink and wrap unspaced names in narrow and wide layouts", () => {
  const css = postcss.parse(readFileSync(new URL("../src/app/(public)/(statistics)/rankings/rankings.module.css", import.meta.url), "utf8"));
  for (const width of [320, 390, 768, 1280]) {
    for (const selector of [".board li a", ".podium a"]) {
      const declarations = new Map();
      css.walkRules((rule) => {
        if (!rule.selectors.includes(selector)) return;
        for (let ancestor = rule.parent; ancestor; ancestor = ancestor.parent) {
          if (ancestor.type !== "atrule" || ancestor.name !== "media") continue;
          const maximum = ancestor.params.match(/^\(max-width:\s*(\d+)px\)$/)?.[1];
          if (!maximum || width > Number(maximum)) return;
        }
        rule.walkDecls((declaration) => declarations.set(declaration.prop, declaration.value));
      });
      assert.equal(declarations.get("min-width"), "0", `${selector} must fit its grid column at ${width}px`);
      assert.equal(declarations.get("overflow-wrap"), "anywhere", `${selector} must wrap W×16 and Riot ID at ${width}px`);
      assert.notEqual(declarations.get("white-space"), "nowrap");
      assert.notEqual(declarations.get("text-overflow"), "ellipsis");
    }
  }
});
