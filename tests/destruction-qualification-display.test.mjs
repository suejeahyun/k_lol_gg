import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const requireNode = createRequire(import.meta.url);
const tournamentId = "81000000-0000-4000-8000-000000000001";
const uuid = (value) => `81000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function harness() {
  const modules = new Map();
  let pageDto;
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} }; modules.set(filename, loaded);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports: loaded.exports, URL, URLSearchParams, require(specifier) {
      if (specifier.startsWith("node:")) return requireNode(specifier);
      if (specifier === "react") return { ...React, cache: (callback) => callback };
      if (specifier === "react/jsx-runtime") return jsx;
      if (specifier === "next/link") return function Link(props) { return React.createElement("a", { ...props, scroll: undefined }); };
      if (specifier === "next/navigation") return { notFound() { throw new Error("unexpected notFound"); } };
      if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
      if (specifier.endsWith("/theme-icons")) return new Proxy({}, { get: () => () => null });
      if (specifier.endsWith("/list-return")) return { BackToList: () => null };
      if (specifier.endsWith("/site-seo")) return {};
      if (specifier.endsWith("/runtime-session")) return { getCurrentSession: async () => null };
      if (specifier.endsWith("/runtime-destruction")) return { getRuntimeDestruction: () => ({ repository: { getPublic: async () => pageDto } }) };
      if (specifier.endsWith("/public-navigation")) return { parseDestructionDetailView: () => ({ tab: "overview", imageIndex: null, playerId: null, action: null }) };
      if (specifier.endsWith("/legacy-user-redirects") || specifier.endsWith("/admin-player") || specifier.endsWith("/runtime-public-player-legacy-mapping") || specifier.endsWith("/legacy-identifiers")) return {};
      if (specifier.endsWith("/resilient-media-image")) return { ResilientMediaImage: () => null };
      if (specifier.endsWith("destruction-owner-actions")) return { DestructionOwnerActions: () => null };
      if (specifier.endsWith("/gallery-lightbox")) return { DestructionGalleryLightbox: () => null };
      if (specifier.endsWith("/auction-reveal")) return { AuctionReveal: () => null };
      if (specifier.endsWith("/live-status")) return { DestructionLiveStatus: () => null };
      if (specifier.endsWith("/score-table")) return { DestructionScoreTable: () => null };
      if (specifier === "@/modules/competitions/destruction") return load(path.join(root, "src/modules/competitions/destruction/destruction-service.ts"));
      const resolved = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      const candidate = [`${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, "index.ts")].find(existsSync);
      assert.ok(candidate, specifier); return load(candidate);
    } });
    return loaded.exports;
  }
  const core = load(path.join(root, "src/modules/competitions/core/index.ts"));
  const { toDestructionPublicDto } = load(path.join(root, "src/modules/competitions/destruction/state.ts"));
  const { DestructionRulesAndStandings } = load(path.join(root, "src/components/competitions/destruction/public-progress.tsx"));
  function aggregate(qualification = "different") {
    const teams = Array.from({ length: 6 }, (_, index) => ({ id: uuid(10 + index), name: `합성 ${index < 3 ? "A" : "B"}${index % 3 + 1}팀`, confirmed: true, captainParticipantId: uuid(100 + index), initialAuctionPoints: 2000, remainingAuctionPoints: 0 }));
    const preliminaryFixtures = ["A", "B"].flatMap((groupKey, group) => [[0, 1], [1, 2], [2, 0]].map(([left, right], index) => ({ id: uuid(200 + group * 3 + index), groupKey, status: "COMPLETED", confirmed: true, bestOf: 3, teamAId: teams[group * 3 + left].id, teamBId: teams[group * 3 + right].id, teamAScore: 2, teamBScore: index === 0 ? 0 : 1, winnerTeamId: teams[group * 3 + left].id })));
    const qualifiedTeamIds = qualification === "unpublished" ? [] : (qualification === "same" ? [0, 3, 1, 4] : [0, 3, 2, 5]).map((index) => teams[index].id);
    let tournamentBracket = qualifiedTeamIds.length ? core.buildSingleEliminationBracket({ competitionId: tournamentId, teams: qualifiedTeamIds.map((id, index) => ({ id, seed: index + 1 })), bestOf: 3 }) : null;
    if (tournamentBracket) for (let index = 0; index < 3; index++) {
      const fixture = tournamentBracket.fixtures[index];
      tournamentBracket = core.advanceSingleEliminationBracket(tournamentBracket, { fixtureId: fixture.id, teamAScore: 2, teamBScore: 0, winnerTeamId: fixture.teamAId }).bracket;
    }
    return { id: tournamentId, revision: 1, title: "합성 확정 대회", lifecycle: { status: qualification === "unpublished" ? "PRELIMINARY" : "COMPLETED", cancelledFrom: null, cancellationReason: null },
      configuration: { preliminaryFormat: "GROUP_ROUND_ROBIN_BO3", preliminaryMode: "GROUP_ROUND_ROBIN", preliminaryBestOf: 3, preliminaryRoundCount: 1, tournamentBestOf: 3, teamCount: 6, rosterSize: 5, advanceTeamCount: 4, laneLimits: { TOP: 6, JGL: 6, MID: 6, ADC: 6, SUP: 6 } },
      teams, preliminaryFixtures, qualifiedTeamIds, tournamentBracket, participants: [], applications: [], rosterSnapshots: [], replacements: [], mvpBallots: [], auctionSeed: "synthetic-import", galleryId: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" };
  }
  return {
    aggregate, dto: toDestructionPublicDto,
    render(dto) { return renderToStaticMarkup(React.createElement(DestructionRulesAndStandings, { destruction: dto })); },
    async page(dto) { pageDto = dto; return renderToStaticMarkup(await load(path.join(root, "src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/page.tsx")).default({ params: Promise.resolve({ tournamentId }), searchParams: Promise.resolve({}) })); },
  };
}

test("a recorded bracket that differs from calculated qualifiers preserves all records without claiming a final rank", () => {
  const subject = harness(), aggregate = subject.aggregate(), dto = subject.dto(aggregate);
  const before = JSON.stringify({ aggregate, dto });
  assert.deepEqual(JSON.parse(JSON.stringify(dto.standings.flatMap((group) => group.rows.map((row) => row.rank)))), [1, 2, 3, 1, 2, 3]);
  assert.deepEqual(JSON.parse(JSON.stringify(dto.standings.map((group) => group.rows.filter((row) => dto.qualifiedTeamIds.includes(row.teamId)).map((row) => row.rank)))), [[1, 3], [1, 3]]);
  const html = subject.render(dto);
  assert.match(html, /예선 경기 기록/u);
  assert.doesNotMatch(html, /예선 순위|예선 최종|<th>순위<\/th>|<th>표시 순서<\/th>|조별 상위 2팀/u);
  assert.match(html, /본선 진출: 확정 대진 기준/u);
  for (const group of dto.standings) for (const row of group.rows) {
    const rendered = [...html.matchAll(/<tr>(.*?)<\/tr>/gu)].map((match) => match[1]).find((entry) => entry.includes(row.teamName));
    assert.ok(rendered); assert.equal(rendered.includes("본선 진출"), dto.qualifiedTeamIds.includes(row.teamId));
    assert.ok(rendered.includes(`<td>${row.setsFor} : ${row.setsAgainst}</td>`));
  }
  assert.equal(JSON.stringify({ aggregate, dto }), before, "display cannot rewrite ranks, fixtures, scores, qualifiers or the bracket");
});

test("matching and unpublished qualifiers retain calculated ranks and normal advancement criteria", () => {
  const subject = harness();
  for (const qualification of ["same", "unpublished"]) {
    const dto = subject.dto(subject.aggregate(qualification));
    const html = subject.render(dto);
    assert.match(html, /예선 순위 · 결과 확정/u); assert.match(html, /<th>순위<\/th>/u); assert.match(html, /조별 상위 2팀/u);
    assert.doesNotMatch(html, /예선 경기 기록|확정 대진 기준/u);
    assert.equal((html.match(/ · 본선 진출/g) ?? []).length, qualification === "same" ? 4 : 0);
  }
  const ongoing = subject.aggregate("unpublished");
  ongoing.preliminaryFixtures[0] = { ...ongoing.preliminaryFixtures[0], status: "PENDING", confirmed: false, teamAScore: null, teamBScore: null, winnerTeamId: null };
  const pendingHtml = subject.render(subject.dto(ongoing));
  assert.match(pendingHtml, /예선 순위 · 진행 중/u); assert.match(pendingHtml, /잠정 순위/u); assert.match(pendingHtml, /<th>순위<\/th>/u);
  assert.doesNotMatch(pendingHtml, /예선 경기 기록| · 본선 진출/u);
});

test("the public detail summary distinguishes actual confirmed teams from a future qualification threshold", async () => {
  const subject = harness();
  const confirmed = await subject.page(subject.dto(subject.aggregate()));
  assert.match(confirmed, /본선 진출<\/span><strong>4팀 확정/u);
  assert.doesNotMatch(confirmed, /상위 4팀/u);
  const unpublished = await subject.page(subject.dto(subject.aggregate("unpublished")));
  assert.match(unpublished, /본선 진출<\/span><strong>상위 4팀/u);
});
