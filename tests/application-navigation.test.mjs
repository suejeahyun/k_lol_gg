import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function load(file, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(source, { exports: result.exports, URL, URLSearchParams, require: (specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected navigation dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  return result.exports;
}

const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const icons = new Proxy({}, { get: () => () => null });
const Link = ({ href, children, ...props }) => React.createElement("a", { ...props, href: typeof href === "string" ? href : href.pathname }, children);
const canonicalQuery = load("modules/navigation/application/canonical-view-query.ts", {});
const applicationPositions = load("modules/seasons/application/client-application-positions.ts", {
  "../domain/season": { SEASON_APPLICATION_POSITIONS: ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] },
});
const ApplicationActions = () => null;

function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const matched = find(child, predicate);
    if (matched) return matched;
  }
  return null;
}

function hub({ seasonId = "season-one", applyDate = "2026-10-05", recruitNo = 1, revision = 1, mode = "RIFT", canApply = true } = {}) {
  const player = { id: "synthetic-player", displayName: "합성 참가자", riotId: "Synthetic#TEST" };
  const application = { id: "synthetic-application", seasonId, applyDate, recruitNo, mainPosition: mode === "RIFT" ? "MID" : "ALL", subPositions: [], status: "APPLIED", source: "SITE", revision };
  return {
    currentSeason: { id: seasonId, name: "합성 시즌", applicationsOpen: true },
    applyDate, selectedRecruitNo: recruitNo, availableRecruitNos: [1, 2],
    viewer: "APPROVED", canApply, hasActivePlayer: true, applicantPlayer: player,
    myApplication: application, participants: [{ ...application, player }],
    counts: { applied: 1, reserve: 0, confirmed: 0 }, participantTotal: 1,
    participantsTruncated: false, unlinkedCount: 0, round: { mode, capacity: 10, closed: false },
  };
}

async function applicationPage(data) {
  const page = load("app/(public)/(applications)/applications/page.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "@/components/theme/theme-icons": icons,
    "@/modules/seo/domain/site-seo": { createRouteMetadata: () => ({}) },
    "@/components/ui/badge": { Badge: ({ children }) => React.createElement("span", null, children) },
    "@/components/ui/button": { Button: ({ children }) => React.createElement("button", null, children) },
    "@/modules/auth/infrastructure/runtime-session": { getCurrentSession: async () => ({ userId: "synthetic-owner" }) },
    "@/modules/navigation/application/canonical-view-query": canonicalQuery,
    "@/modules/seasons/application/client-application-positions": applicationPositions,
    "@/modules/seasons/infrastructure/runtime-season-data": { loadRuntimeSeasonData: async (read) => ({ state: "ready", data: await read({ getApplicationHub: async (_owner, recruitNo) => { assert.equal(recruitNo, data.selectedRecruitNo); return data; } }) }) },
    "@/components/navigation/recruiting-competitions": { RecruitingCompetitions: () => null },
    "./application-actions": { ApplicationActions },
    "./applications.module.css": css,
  });
  return page.default({ searchParams: Promise.resolve({ recruitNo: String(data.selectedRecruitNo) }) });
}

test("season, date and round changes replace application form state in both editable branches", async () => {
  for (const canApply of [true, false]) {
    const identity = async (options) => {
      const tree = await applicationPage(hub({ ...options, canApply }));
      const form = find(tree, (node) => node.type === ApplicationActions);
      assert.ok(form);
      return form.key;
    };
    const keys = await Promise.all([{}, { recruitNo: 2 }, { applyDate: "2026-10-06" }, { seasonId: "season-two" }].map(identity));
    assert.equal(new Set(keys).size, 4, "each application identity must receive its own selected positions and reserve state");
    assert.equal(await identity({ revision: 2 }), keys[0], "same-round refresh must preserve local edits");
  }
});

test("position-free rounds do not display a fabricated main/sub position in own or public status", async () => {
  for (const mode of ["ARAM", "AUGMENT_ARAM"]) {
    const html = renderToStaticMarkup(await applicationPage(hub({ mode })));
    assert.equal((html.match(/포지션 구분 없음/gu) ?? []).length, 2);
    assert.doesNotMatch(html, /주 ALL|부 없음/u);
  }
  const rift = renderToStaticMarkup(await applicationPage(hub()));
  assert.match(rift, /주 미드/u);
  assert.match(rift, /부 없음/u);
});

test("closed season or round shows its lifecycle before new-application authentication and retains own status", async () => {
  for (const closure of ["season", "round"]) {
    for (const viewer of ["ANONYMOUS", "RESTRICTED", "APPROVED"]) {
      for (const hasActivePlayer of [false, true]) {
        const data = hub({ canApply: false });
        Object.assign(data, { viewer, hasActivePlayer, myApplication: null });
        if (closure === "season") data.currentSeason.applicationsOpen = false;
        else data.round.closed = true;
        const tree = await applicationPage(data);
        const html = renderToStaticMarkup(tree);
        assert.match(html, /신청 기간이 마감되었어요/u, `${closure}/${viewer}/${hasActivePlayer}`);
        assert.match(html, /href="\/recruits">다른 모집 보기/u);
        assert.doesNotMatch(html, /href="(?:\/login\?|\/account")|로그인·승인 필요|연결된 활성 플레이어가 필요/u);
        assert.equal(find(tree, (node) => node.type === ApplicationActions), null);
      }
    }
    for (const [status, label] of Object.entries({ APPLIED: "신청", RESERVE: "예비", CONFIRMED: "확정", REJECTED: "거절", CANCELLED: "취소" })) {
      const data = hub({ canApply: false, recruitNo: 2 });
      data.myApplication.status = status;
      if (closure === "season") data.currentSeason.applicationsOpen = false;
      else data.round.closed = true;
      const tree = await applicationPage(data);
      assert.equal(find(tree, (node) => node.props.id === "my-status-title").props.children, label);
      assert.equal(find(tree, (node) => node.type === ApplicationActions), null, "closed records remain readable without mutation controls");
      assert.match(renderToStaticMarkup(tree), /2026-10-05 · 2회차 · 주 미드/u);
    }
  }
});

test("open season keeps account recovery, selected-round login return and existing application state", async () => {
  const anonymous = hub({ recruitNo: 2, canApply: false });
  Object.assign(anonymous, { viewer: "ANONYMOUS", hasActivePlayer: false, myApplication: null });
  const login = find(await applicationPage(anonymous), (node) => node.type === Link && node.props.href.startsWith("/login?"));
  assert.equal(new URL(login.props.href, "https://isolated.invalid").searchParams.get("next"), "/applications?type=season&recruitNo=2");
  for (const viewer of ["RESTRICTED", "APPROVED"]) {
    const data = hub({ canApply: false });
    Object.assign(data, { viewer, hasActivePlayer: false, myApplication: null });
    const html = renderToStaticMarkup(await applicationPage(data));
    assert.match(html, /href="\/account"/u);
    assert.match(html, viewer === "RESTRICTED" ? /참가 신청이 제한/u : /연결된 활성 플레이어/u);
    assert.doesNotMatch(html, /신청 기간이 마감/u);
  }
  for (const canApply of [true, false]) {
    const data = hub({ canApply, recruitNo: 2 });
    const form = find(await applicationPage(data), (node) => node.type === ApplicationActions);
    assert.equal(form.props.initial, data.myApplication);
    assert.equal(form.props.recruitNo, 2);
    assert.equal(form.props.closed, false);
  }
});

test("a missing site application retains a direct path to recover Kakao member linking", () => {
  const { ApplicationActions: Form } = load("app/(public)/(applications)/applications/application-actions.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/usage/usage-actions": { recordUsageAction() {} },
    "@/modules/seasons/domain/season": { SEASON_APPLICATION_POSITIONS: ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] },
    "@/modules/seasons/application/client-mutation-key-store": { ClientMutationKeyStore: class {} },
    "@/modules/seasons/application/client-application-positions": applicationPositions,
    "./applications.module.css": css,
  });
  const data = hub();
  const html = renderToStaticMarkup(React.createElement(Form, { initial: null, recruitNo: 1, applicantPlayer: data.applicantPlayer, applyDate: data.applyDate }));
  assert.match(html, /href="\/help\/contact">카카오 신청 회원 연결 문의<\/a>/u);
  assert.match(html, /name="mainPosition"/u);
  assert.match(html, />참가 신청<\/button>/u);
});

test("event position labels remain readable while form values retain the API position codes", () => {
  const display = load("modules/competitions/core/display-projection.ts", {});
  const { EventApplicationActions: Form } = load("app/(public)/(competitions)/competitions/events/[eventId]/event-application-actions.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/usage/usage-actions": { recordUsageAction() {} },
    "@/modules/competitions/core/display-projection": display,
    "../../events.module.css": css,
  });
  const html = renderToStaticMarkup(React.createElement(Form, { eventId: "synthetic-event", revision: 1, format: "POSITION", open: true, signedIn: true, approved: true, application: null }));
  for (const value of ["TOP", "JGL", "MID", "ADC", "SUP"]) {
    assert.match(html, new RegExp(`<option value="${value}"[^>]*>${display.competitionPositionLabel(value)}</option>`, "u"));
    assert.match(html, new RegExp(`name="subPositions"[^>]*value="${value}"`, "u"));
  }
  assert.match(html, /name="mainPosition"/u);
  assert.match(html, /type="submit">신청하기<\/button>/u);
});

test("event lifecycle blocks impossible application prompts while open recruitment retains auth and own controls", () => {
  const { EventApplicationActions: Form } = load("app/(public)/(competitions)/competitions/events/[eventId]/event-application-actions.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/usage/usage-actions": { recordUsageAction() {} },
    "@/modules/competitions/core/display-projection": load("modules/competitions/core/display-projection.ts", {}),
    "../../events.module.css": css,
  });
  const render = (props) => renderToStaticMarkup(React.createElement(Form, { eventId: "synthetic-event", revision: 1, format: "POSITION", open: false, signedIn: false, approved: false, application: null, ...props }));
  for (const [signedIn, approved] of [[false, false], [true, false], [true, true]]) {
    for (const status of [null, "ACTIVE", "CANCELLED"]) {
      const application = signedIn && status ? { participantId: "synthetic-participant", mainPosition: "MID", subPositions: [], status } : null;
      const html = render({ signedIn, approved, application });
      assert.match(html, /참가 신청 기간 아님/u, `${signedIn}/${approved}/${status}`);
      assert.match(html, /href="\/applications\?type=event">다른 이벤트 모집 보기/u);
      assert.doesNotMatch(html, /href="(?:\/login\?|\/account")|<form|<button|계정 필요|플레이어 연결 필요/u);
      assert.match(html, /id="event-application" tabindex="-1"/u);
    }
  }
  const loginHref = render({ open: true }).match(/href="([^"]+)"/u)?.[1];
  assert.equal(new URL(loginHref, "https://isolated.invalid").searchParams.get("next"), "/competitions/events/synthetic-event?action=apply");
  assert.match(render({ open: true, signedIn: true }), /href="\/account">내 계정 상태 확인/u);
  for (const status of [null, "ACTIVE", "CANCELLED"]) {
    const html = render({ open: true, signedIn: true, approved: true, application: status ? { participantId: "synthetic-participant", mainPosition: "MID", subPositions: [], status } : null });
    assert.match(html, status === "ACTIVE" ? /type="submit">신청 수정/u : /type="submit">신청하기/u);
    assert.equal(html.includes("신청 취소</button>"), status === "ACTIVE");
    if (status) assert.match(html, /value="MID" selected=""/u);
  }
});

test("own status and public roster use the same Korean position labels as the application form", async () => {
  for (const [position, label] of Object.entries(applicationPositions.APPLICATION_POSITION_LABELS)) {
    const data = hub();
    data.myApplication.mainPosition = position;
    data.participants[0].mainPosition = position;
    data.myApplication.subPositions = position === "ALL" ? [] : ["TOP", "JGL", "MID", "ADC", "SUP"].filter((value) => value !== position);
    data.participants[0].subPositions = [...data.myApplication.subPositions];
    const before = JSON.stringify(data);
    const html = renderToStaticMarkup(await applicationPage(data));
    assert.equal((html.match(new RegExp(`주 ${label}`, "gu")) ?? []).length, 2, position);
    const expectedSub = data.myApplication.subPositions.map((value) => applicationPositions.APPLICATION_POSITION_LABELS[value]).join(", ") || "없음";
    assert.equal((html.match(new RegExp(`부 ${expectedSub}`, "gu")) ?? []).length, 2, position);
    assert.doesNotMatch(html, /주 (?:TOP|JGL|MID|ADC|SUP|ALL)|부 (?:TOP|JGL|MID|ADC|SUP|ALL)/u);
    assert.equal(JSON.stringify(data), before, "display formatting must preserve stored position values");
  }
});

test("ranking view and applied criteria replace stale unsaved filter inputs", async () => {
  const views = ["win-rate", "participation", "mvp"];
  const page = load("app/(public)/(statistics)/rankings/page.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "@/components/theme/theme-icons": icons,
    "@/modules/seo/domain/site-seo": { createRouteMetadata: () => ({}) },
    "@/modules/auth/infrastructure/runtime-session": { getCurrentSession: async () => null },
    "@/modules/statistics/application/statistics-query": { isStatisticsUuid: () => true },
    "@/modules/statistics/domain/public-ranking-view": { isPublicRankingView: (value) => views.includes(value), publicRankingViewDefinition: () => ({}), publicRankingViewDefinitions: [], buildPublicRankingView: () => [] },
    "@/modules/statistics/infrastructure/runtime-statistics-data": { loadRuntimeStatisticsData: async (read) => ({ state: "ready", data: await read({ listPublicSeasons: async () => [{ id: "season-one", name: "합성 시즌" }], getPublicSeasonRanking: async (season) => ({ season: { id: season ?? "season-one" }, rankings: [], projection: null }) }) }) },
    "@/platform/time/format-korean-date-time": { formatOptionalKoreanDateTime: () => "" },
    "./rankings.module.css": css,
  });
  async function filter(query) {
    const tree = await page.default({ searchParams: Promise.resolve(query) });
    return find(tree, (node) => node.type === "form");
  }
  const initial = await filter({ minParticipation: "0" });
  const byParticipation = await filter({ minParticipation: "0", view: "participation" });
  const changedMinimum = await filter({ minParticipation: "25" });
  const changedSeason = await filter({ minParticipation: "0", seasonId: "season-two" });
  assert.equal(new Set([initial.key, byParticipation.key, changedMinimum.key, changedSeason.key]).size, 4);
  assert.equal(find(byParticipation, (node) => node.props.name === "minParticipation").props.defaultValue, 0);
  assert.equal(find(byParticipation, (node) => node.props.name === "view").props.value, "participation");
});

test("destruction format choices distinguish match lengths and retain the selected canonical filter", async () => {
  const configuration = load("modules/competitions/destruction/configuration.ts", { "../core": {}, "../core/error": {} });
  const contract = load("modules/competitions/destruction/http-contract.ts", { "node:crypto": {}, "./configuration": configuration });
  const display = {
    ...load("modules/competitions/core/display-projection.ts", {}),
    ...load("modules/competitions/core/public-display-labels.ts", {}),
  };
  let requestedQuery;
  const { DestructionCompetitionList } = load("app/(public)/(competitions)/competitions/competition-list-views.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "@/components/theme/theme-icons": icons,
    "@/modules/competitions/core": display,
    "@/modules/competitions/destruction": { ...configuration, ...contract },
    "@/modules/competitions/destruction/runtime-destruction": { loadRuntimeDestruction: async (read) => ({ state: "ready", data: await read({ repository: { listPublic: async (query) => {
      requestedQuery = query;
      return { items: [{ id: "synthetic-tournament", status: "RECRUITING", preliminaryFormat: query.format, title: "합성 대회", teams: [], participantCount: 0 }], totalPages: 2 };
    } } }) }) },
    "@/modules/competitions/events": {},
    "@/modules/competitions/events/infrastructure/runtime-event": {},
    "./events.module.css": css,
  });
  for (const format of configuration.DESTRUCTION_PRELIMINARY_FORMATS) {
    const html = renderToStaticMarkup(await DestructionCompetitionList({ searchParams: Promise.resolve({ format, q: "합성", status: "RECRUITING" }) }));
    const select = html.match(/<select name="format">([\s\S]*?)<\/select>/u)?.[1];
    assert.ok(select);
    const options = [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/gu)];
    assert.equal(new Set(options.map((option) => option[2])).size, configuration.DESTRUCTION_PRELIMINARY_FORMATS.length, "each supported format needs a distinguishable visible choice");
    assert.deepEqual(options.map((option) => option[1]), [...configuration.DESTRUCTION_PRELIMINARY_FORMATS]);
    for (const [, value, label] of options) assert.ok(label.endsWith(value.endsWith("BO3") ? "3판 2선승" : "단판"));
    assert.match(select, new RegExp(`value="${format}" selected=""`, "u"));
    assert.equal(requestedQuery.format, format);
    assert.match(html, new RegExp(`<b>[^<]+${format.endsWith("BO3") ? "3판 2선승" : "단판"}<\\/b>`, "u"));
    const nextHref = html.match(/href="([^"]+)">다음<\/a>/u)?.[1];
    assert.ok(nextHref);
    const nextQuery = contract.parseDestructionListQuery(`https://isolated.invalid${nextHref.replaceAll("&amp;", "&")}`);
    assert.equal(nextQuery?.format, format);
    assert.equal(nextQuery?.page, 2);
    assert.equal(nextQuery?.query, "합성");
    assert.equal(nextQuery?.status, "RECRUITING");
  }
});
