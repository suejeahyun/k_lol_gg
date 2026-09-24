import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToString } from "react-dom/server";
import ts from "typescript";

function component(file, name, metric, dependencies) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/components/riot/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const chartModule = { exports: {} };
  const modules = {
    "react": { ...React, useState: () => React.useState(metric) },
    "react/jsx-runtime": jsxRuntime,
    "./player-riot-profile.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
    ...dependencies,
  };
  vm.runInNewContext(compiled, { exports: chartModule.exports, require: (specifier) => {
    assert.ok(Object.hasOwn(modules, specifier), `Unexpected chart dependency: ${specifier}`);
    return modules[specifier];
  } });
  return chartModule.exports[name];
}

function renderedTitles(View, props) {
  const warnings = [];
  const previous = console.error;
  console.error = (...args) => warnings.push(args.join(" "));
  let html;
  try { html = renderToString(React.createElement(View, props)); } finally { console.error = previous; }
  assert.deepEqual(warnings, [], "SSR must not discard SVG titles as unsupported array children");
  return [...html.matchAll(/<title>(.*?)<\/title>/gu)].map((match) => match[1]);
}

test("history chart server output preserves tooltip text for every chart mode", () => {
  const daily = [{ date: "2026-09-24", games: 2, wins: 1, losses: 1, kda: 2.5, kills: 5, deaths: 4, assists: 5, perfect: false, winRate: 50 }];
  const props = { matches: [], rankHistory: [{ date: "2026-09-24", tier: "GOLD", rank: "I", leaguePoints: 45 }] };
  const labels = { games: "2게임 · 1승 1패", winRate: "50% · 2게임", kda: "2.50 KDA · 5 / 4 / 5 · 2게임", rank: "GOLD I 45 LP" };
  for (const metric of Object.keys(labels)) {
    const View = component("player-history-chart.tsx", "PlayerHistoryChart", metric, {
      "./player-analytics": { playerDailyAggregates: () => daily, playerRankPoints: () => 1545 },
    });
    assert.deepEqual(renderedTitles(View, props), [`2026-09-24: ${labels[metric]}`]);
  }
});

test("match growth server output preserves own and opponent tooltips without fabricated missing values", () => {
  for (const metric of ["totalGold", "cs", "xp", "teamGold"]) {
    const View = component("player-match-chart.tsx", "PlayerMatchChart", metric, {
      "./player-match-series": {
        MATCH_CHART_LABELS: { totalGold: "골드", cs: "CS", xp: "경험치", teamGold: "팀 골드 차이" },
        matchGrowthSeries: () => [{ timestamp: 0, value: 0, opponent: 0 }, { timestamp: 900000, value: 6500, opponent: 5900 }, { timestamp: 960000, value: null, opponent: null }],
      },
    });
    assert.deepEqual(renderedTitles(View, { match: { timeline: { frameInterval: 60000 } } }), ["0:00 본인: 0", "0:00 상대: 0", "15:00 본인: 6500", "15:00 상대: 5900"]);
  }
});
