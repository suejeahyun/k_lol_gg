import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const filename = path.join(root, "src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/destruction-owner-actions.tsx");
const tournamentId = "81000000-0000-4000-8000-000000000001";
const application = { applicationId: "81000000-0000-4000-8000-000000000002", tournamentId, tournamentRevision: 3, playerId: "81000000-0000-4000-8000-000000000003", position: "MID", status: "APPLIED", captainVolunteer: false };
const ballot = { fixtureId: "synthetic-fixture", fixtureName: "합성 A팀 vs 합성 B팀", candidates: [{ playerId: "81000000-0000-4000-8000-000000000004", playerName: "합성 후보" }] };

function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const result = find(child, predicate); if (result) return result; }
  return null;
}

function harness(props = {}, mutationState = {}) {
  const modules = new Map(), effects = [], elements = new Map(), mutations = [], recoveries = [];
  const document = { activeElement: null };
  const mutation = { busy: false, message: "", retryAvailable: false, mutate: (...args) => mutations.push(args), retry: () => recoveries.push("retry"), refresh: () => recoveries.push("refresh"), ...mutationState };
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const loaded = { exports: {} }; modules.set(file, loaded);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports: loaded.exports, window: { innerHeight: 800 }, crypto: { randomUUID: () => application.applicationId }, FormData: class { constructor(form) { this.values = form; } get(key) { return this.values[key] ?? null; } }, require(name) {
      if (name === "react") return { useState: value => [value, () => {}], useRef: value => ({ current: value }), useLayoutEffect: callback => effects.push(callback) };
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next/link") return { __esModule: true, default: "a" };
      if (name.endsWith("/use-destruction-mutation")) return { useDestructionMutation: () => mutation };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      const resolved = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(file), name);
      const dependency = [`${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, "index.ts")].find(existsSync);
      assert.ok(dependency, `Unexpected dependency: ${name}`); return load(dependency);
    } });
    return loaded.exports;
  }
  const component = load(filename).DestructionOwnerActions;
  const tree = component({ tournamentId, revision: 3, status: "COMPLETED", signedIn: false, approved: false, application: null, mvpBallots: [], ...props });
  function attach(node) {
    if (!React.isValidElement(node)) return;
    if (node.props.id) {
      const element = { scrolled: false, getBoundingClientRect: () => ({ top: 900 }), scrollIntoView() { this.scrolled = true; }, focus() { document.activeElement = this; } };
      elements.set(node.props.id, element);
      if (node.props.ref) node.props.ref.current = element;
    }
    React.Children.forEach(node.props.children, attach);
  }
  attach(tree); effects.forEach(effect => effect());
  return { tree, mutations, recoveries, document, elements, html: renderToStaticMarkup(tree), application: () => find(tree, node => node.props.id === "destruction-application"), mvp: () => find(tree, node => node.props.id === "destruction-mvp") };
}
const html = tree => renderToStaticMarkup(tree);
const submit = (form, values) => { assert.ok(form, "expected an available form"); let prevented = false; form.props.onSubmit({ currentTarget: values, preventDefault() { prevented = true; } }); assert.equal(prevented, true); };

test("completed and cancelled anonymous visitors see closed actions and a login link specifically for their own record", () => {
  for (const status of ["COMPLETED", "CANCELLED"]) {
    const subject = harness({ status });
    assert.match(html(subject.application()), /내 신청 확인/u);
    assert.match(html(subject.application()), /참가 신청 종료/u);
    const login = find(subject.application(), node => node.type === "a");
    assert.equal(login.props.children, "로그인하고 내 신청 확인");
    assert.equal(new URL(login.props.href, "https://example.invalid").searchParams.get("next"), `/competitions/destruction/${tournamentId}?action=apply`);
    assert.match(html(subject.mvp()), /MVP 투표 종료/u);
    assert.doesNotMatch(html(subject.mvp()), /로그인|승인|<form|<a/u);
    assert.equal(find(subject.tree, node => node.type === "form"), null);
    assert.equal(subject.mutations.length, 0);
  }
});

test("pending accounts see terminal state and account recovery only for own-application reading", () => {
  for (const status of ["COMPLETED", "CANCELLED"]) {
    const subject = harness({ status, signedIn: true });
    assert.match(html(subject.application()), /내 신청 확인/u);
    assert.match(html(subject.application()), /참가 신청 종료/u);
    assert.ok(find(subject.application(), node => node.props.href === "/account"));
    assert.match(html(subject.mvp()), /MVP 투표 종료/u);
    assert.doesNotMatch(html(subject.mvp()), /로그인|승인|<form|<a/u);
  }
});

test("recruitment keeps application login and approval recovery without promising early MVP voting", () => {
  for (const signedIn of [false, true]) {
    const subject = harness({ status: "RECRUITING", signedIn });
    assert.match(html(subject.application()), /참가 신청/u);
    assert.ok(find(subject.application(), node => node.type === "a" && (signedIn ? node.props.href === "/account" : node.props.href.startsWith("/login?next="))));
    assert.match(html(subject.mvp()), /MVP 투표 대기/u);
    assert.doesNotMatch(html(subject.mvp()), /로그인|승인|<form|<a/u);
  }
  const planned = harness({ status: "PLANNED" });
  assert.match(html(planned.application()), /참가 신청 대기/u);
  assert.equal(find(planned.tree, node => node.type === "a"), null);
});

test("preliminary and tournament voting have their own login return target and approval recovery", () => {
  for (const status of ["PRELIMINARY", "TOURNAMENT"]) {
    const anonymous = harness({ status });
    const login = find(anonymous.mvp(), node => node.type === "a");
    assert.ok(login, "voting login must return to the voting region, not the closed application form");
    assert.equal(new URL(login.props.href, "https://example.invalid").searchParams.get("next"), `/competitions/destruction/${tournamentId}?tab=mvp`);
    assert.match(html(anonymous.application()), /참가 신청 마감/u);
    const pending = harness({ status, signedIn: true });
    assert.ok(find(pending.mvp(), node => node.props.href === "/account"));
  }
});

test("approved terminal participants retain their stored application and mode record without mutation controls", () => {
  for (const status of ["COMPLETED", "CANCELLED"]) for (const applicationStatus of ["CONFIRMED", "CANCELLED", "RESERVE"]) {
    const subject = harness({ status, signedIn: true, approved: true, gameMode: "ARAM", application: { ...application, position: null, status: applicationStatus, selfReportedRecord: { mode: "ARAM", wins: 17, losses: 9, submittedAt: "2026-01-01T00:00:00Z" }, canEditModeRecord: false }, mvpBallots: [ballot] });
    assert.match(html(subject.application()), /내 신청 확인/u);
    assert.match(html(subject.application()), /17승 9패/u);
    assert.match(subject.html, /내 신청:/u);
    assert.equal(find(subject.tree, node => node.type === "form"), null);
    assert.doesNotMatch(subject.html, /로그인|변경은 운영자에게 문의/u);
  }
});

test("existing recruitment submit/cancel and active MVP vote handlers preserve request identities and values", () => {
  const subject = harness({ status: "RECRUITING", signedIn: true, approved: true, application });
  submit(find(subject.application(), node => node.type === "form"), { position: "SUP", captainVolunteer: "true" });
  find(subject.application(), node => node.type === "button" && node.props.children === "신청 취소").props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(subject.mutations)), [[`/api/competitions/destruction/${tournamentId}/application`, "PUT", { applicationId: application.applicationId, position: "SUP", captainVolunteer: true }], [`/api/competitions/destruction/${tournamentId}/application`, "DELETE", {}]]);
  for (const status of ["PRELIMINARY", "TOURNAMENT"]) {
    const voting = harness({ status, signedIn: true, approved: true, mvpBallots: [ballot] });
    submit(find(voting.mvp(), node => node.type === "form"), { candidatePlayerId: ballot.candidates[0].playerId });
    assert.deepEqual(JSON.parse(JSON.stringify(voting.mutations)), [[`/api/competitions/destruction/${tournamentId}/mvp-vote`, "POST", { fixtureId: ballot.fixtureId, candidatePlayerId: ballot.candidates[0].playerId }]]);
  }
});

test("confirmed mode-record editing remains available during team building when the existing DTO allows it", () => {
  const subject = harness({ status: "TEAM_BUILDING", signedIn: true, approved: true, gameMode: "ARAM", application: { ...application, position: null, status: "CONFIRMED", captainVolunteer: true, canEditModeRecord: true } });
  submit(find(subject.application(), node => node.type === "form"), { wins: "10", losses: "4" });
  assert.deepEqual(JSON.parse(JSON.stringify(subject.mutations[0])), [`/api/competitions/destruction/${tournamentId}/application`, "PUT", { applicationId: application.applicationId, position: null, captainVolunteer: true, modeRecord: { wins: 10, losses: 4 } }]);
});

test("application and MVP deep links still focus their visible region for each lifecycle and account state", () => {
  for (const status of ["RECRUITING", "PRELIMINARY", "TOURNAMENT", "COMPLETED", "CANCELLED"]) for (const [signedIn, approved] of [[false, false], [true, false], [true, true]]) for (const focusTarget of ["apply", "mvp"]) {
    const subject = harness({ status, signedIn, approved, focusTarget });
    const target = subject.elements.get(focusTarget === "apply" ? "destruction-application" : "destruction-mvp");
    assert.ok(target);
    assert.equal(subject.document.activeElement, target);
    assert.equal(target.scrolled, true);
  }
});

test("private-read failures and uncertain mutation recovery remain actionable", () => {
  const unavailable = harness({ signedIn: true, approved: true, available: false });
  assert.match(unavailable.html, /내 신청·투표 정보를 불러오지 못했습니다/u);
  find(unavailable.tree, node => node.type === "button").props.onClick();
  assert.deepEqual(unavailable.recoveries, ["refresh"]);
  const retry = harness({ status: "RECRUITING", signedIn: true, approved: true, application }, { retryAvailable: true, message: "요청 결과를 확인해 주세요." });
  assert.equal(find(retry.application(), node => node.type === "button" && node.props.children === "신청 수정").props.disabled, true);
  find(retry.tree, node => node.type === "button" && node.props.children === "요청 결과 다시 확인").props.onClick();
  assert.deepEqual(retry.recoveries, ["retry"]);
});
