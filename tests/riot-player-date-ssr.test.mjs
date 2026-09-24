import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function load(file, dependencies, intl) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, { exports: result.exports, Intl: intl, Date, require: (specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected date rendering dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  return result.exports;
}

// Reproduce the observed Node/Chrome locale-data difference while retaining the
// same numeric date parts. UI text must not depend on translated format output.
function runtimeIntl(dayPeriod) {
  return { DateTimeFormat: class {
    constructor(locale, options) { this.formatter = new Intl.DateTimeFormat(locale, options); }
    format() { return `9. 24. ${dayPeriod} 09:00`; }
    formatToParts(date) { return this.formatter.formatToParts(date); }
  } };
}

function runtime(dayPeriod) {
  const intl = runtimeIntl(dayPeriod);
  const dates = load("platform/time/format-korean-date-time.ts", {}, intl);
  const analytics = load("components/riot/player-analytics.ts", {
    "@/modules/champions/domain/champion-image": { findDataDragonChampion: () => null },
    "@/modules/riot/domain/riot-player-analytics": { summarizeRiotTimeline: () => ({ goldDiffAt10: null, csDiffAt10: null, goldDiffAt15: null, csDiffAt15: null, xpDiffAt15: null }) },
  }, intl);
  const { PlayerMatchDetail } = load("components/riot/player-match-detail.tsx", {
    "react": React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": (props) => React.createElement("a", props),
    "@/components/champions/champion-portrait": { ChampionPortrait: () => React.createElement("span", null, "합성 챔피언") },
    "@/modules/champions/domain/data-dragon-catalog": { DATA_DRAGON_VERSION: "synthetic" },
    "@/platform/time/format-korean-date-time": dates,
    "./player-asset-catalog": { PLAYER_ITEMS: {}, PLAYER_RUNES: {}, PLAYER_SPELLS: {} },
    "./player-match-chart": { PlayerMatchChart: () => null },
    "./player-analytics": analytics,
    "./player-riot-profile.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  }, intl);
  return { analytics, PlayerMatchDetail };
}

test("match summaries render identical Korean clock text across server and browser locale data", () => {
  const server = runtime("PM"), browser = runtime("오후");
  const match = { matchId: "KR_SYNTHETIC", startedAt: "2026-09-24T12:00:00Z", durationSeconds: 1800, queueId: 420, selfParticipantId: 1, participants: [{ participantId: 1, teamId: 100, championId: 1, championName: "Annie", position: "MID", win: true, kills: 4, deaths: 2, assists: 2, cs: 120, champLevel: 16, items: [], summonerSpells: [], runes: { perkIds: [] } }] };
  const props = { match, anonymous: true, playerId: "synthetic-player" };
  const serverHtml = renderToStaticMarkup(React.createElement(server.PlayerMatchDetail, props));
  const browserHtml = renderToStaticMarkup(React.createElement(browser.PlayerMatchDetail, props));
  assert.equal(serverHtml, browserHtml);
  assert.match(serverHtml, /2026\. 9\. 24\. 21:00 · 30:00/u);
  assert.doesNotMatch(serverHtml, /PM|오후/u);
});

test("filter and chart date keys use fixed Korean calendar parts across locale data and year boundaries", () => {
  const server = runtime("PM"), browser = runtime("오후");
  for (const [input, expected] of [["2026-09-24T12:00:00Z", "2026-09-24"], ["2026-12-31T14:59:59Z", "2026-12-31"], ["2026-12-31T15:00:00Z", "2027-01-01"]]) {
    assert.equal(server.analytics.koreanMatchDate(input), expected);
    assert.equal(browser.analytics.koreanMatchDate(input), expected);
  }
});
