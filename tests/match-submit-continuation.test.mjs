import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function load(file, dependencies, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, { exports: result.exports, ...globals, require: (specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected continuation dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  return result.exports;
}

const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const formModule = load("app/(public)/(matches)/matches/submit/submission-form.tsx", {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "next/link": (props) => React.createElement("a", props),
  "next/navigation": { useRouter: () => ({}) },
  "@/components/usage/usage-actions": { recordUsageAction: () => {} },
  "@/modules/matches/domain/match": { MATCH_IMAGE_MAX_BYTES: 4 * 1024 * 1024 },
  "@/modules/matches/infrastructure/client-match-mutation-key-store": { ClientMatchMutationKeyStore: class {} },
  "./submit.module.css": css,
});

const codeA = "MR2A1B2C3D4E5F60708";
const codeB = "MR20123456789ABCDEF";
const draftId = "20000000-0000-4000-8000-000000000000";
const baseProps = { viewer: "APPROVED", seasons: [], initial: null, requestedCode: null, requestedTeamBalanceDraftId: null, teamBalanceDraft: null };

function renderForm(props) {
  return renderToStaticMarkup(React.createElement(formModule.SubmissionForm, { ...baseProps, ...props }));
}

test("anonymous result continuation returns to the same submission after login", () => {
  for (const [code, draft, expected] of [
    [codeA, null, `/matches/submit?code=${codeA}`],
    [null, draftId, `/matches/submit?teamBalanceDraftId=${draftId}`],
    [null, null, "/matches/submit"],
  ]) {
    const html = renderToStaticMarkup(React.createElement(formModule.SubmissionForm, {
      viewer: "ANONYMOUS", seasons: [], initial: null, requestedCode: code,
      requestedTeamBalanceDraftId: draft, teamBalanceDraft: null,
    }));
    const href = html.match(/href="([^"]+)"/u)?.[1];
    assert.ok(href);
    const login = new URL(href, "https://test.invalid");
    assert.equal(login.pathname, "/login");
    assert.equal(login.searchParams.get("next"), expected);
  }
});

function pageContext(session = null, { failLookup = false } = {}) {
  const SubmissionForm = () => null;
  const authorization = load("modules/auth/application/authorize-session.ts", {});
  let privateReads = 0;
  const page = load("app/(public)/(matches)/matches/submit/page.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": () => null,
    "next/navigation": { notFound: () => { throw new Error("Unexpected invalid query"); } },
    "@/components/theme/theme-icons": { ArrowLeft: () => null },
    "@/modules/seo/domain/site-seo": { createRouteMetadata: () => ({}) },
    "@/modules/auth/infrastructure/runtime-session": { getCurrentSession: async () => session },
    "@/modules/auth/application/authorize-session": authorization,
    "@/modules/matches/infrastructure/runtime-match-data": { getRuntimeMatchService: () => ({ getOwnSubmissionByPublicCode: async () => { privateReads++; if (failLookup) throw new Error("Synthetic database failure"); return null; } }) },
    "@/modules/matches/infrastructure/match-query": { parseMatchSubmitPageQuery: (query) => ({ code: query.code ?? null, teamBalanceDraftId: query.teamBalanceDraftId ?? null }) },
    "@/modules/seasons/infrastructure/runtime-season-data": { loadRuntimeSeasonData: async () => ({ state: "ready", data: [] }) },
    "@/modules/team-tools/infrastructure/runtime-team-balance": { loadRuntimeTeamBalance: async () => ({ state: "unavailable" }) },
    "./submission-form": { SubmissionForm },
    "@/components/site-feature-state": { SiteFeatureStatePanel: () => null },
    "@/modules/operations/infrastructure/site-feature-access": { readSiteFeatureState: async () => "enabled", siteFeatureLabel: () => "" },
    "./submit.module.css": css,
  });
  async function formFor(query) {
    const tree = await page.default({ searchParams: Promise.resolve(query) });
    const form = React.Children.toArray(tree.props.children).find((child) => child.type === SubmissionForm);
    assert.ok(form);
    return form;
  }
  return { formFor, privateReads: () => privateReads };
}

test("changing a continuation code or draft resets form identity while same-context refresh preserves edits", async () => {
  const context = pageContext();
  const identity = async (query) => (await context.formFor(query)).key;
  const queries = [{}, { code: codeA }, { code: codeB }, { teamBalanceDraftId: draftId }];
  const keys = await Promise.all(queries.map(identity));
  assert.equal(new Set(keys).size, queries.length, "distinct result contexts must not retain the previous form state");
  assert.equal(await identity({ code: codeA }), keys[1], "a refresh of the current submission must not discard local progress");
});

test("pending, rejected, suspended and password-reset accounts get recovery before filling the submission form", async () => {
  for (const accountStatus of ["PENDING", "REJECTED", "SUSPENDED"]) {
    const context = pageContext({ purpose: "ACCOUNT", role: "USER", accountStatus, mustChangePassword: false });
    const form = await context.formFor({ code: codeA });
    assert.equal(form.props.viewer, "RESTRICTED");
    assert.equal(context.privateReads(), 0);
    const html = renderForm(form.props);
    assert.match(html, /href="\/account"/u);
    assert.doesNotMatch(html, /<form|type="file"/u);
  }
  const context = pageContext({ purpose: "ACCOUNT", role: "USER", accountStatus: "APPROVED", mustChangePassword: true });
  const form = await context.formFor({ code: codeA });
  assert.equal(form.props.viewer, "PASSWORD_CHANGE_REQUIRED");
  assert.equal(context.privateReads(), 0);
  const html = renderForm(form.props);
  const href = html.match(/href="([^"]+)"/u)?.[1].replaceAll("&amp;", "&");
  assert.equal(new URL(href, "https://test.invalid").searchParams.get("next"), `/matches/submit?code=${codeA}`);
  assert.doesNotMatch(html, /<form|type="file"/u);
});

test("completed or rejected submissions show their result and recovery without impossible upload controls", () => {
  for (const status of ["REJECTED", "CANCELLED", "APPROVED", "PENDING_REVIEW", "AWAITING_UPLOAD"]) {
    const html = renderForm({ initial: {
      publicCode: codeA, title: "합성 경기", organizer: "합성 주최자", status,
      publicReviewReason: status === "REJECTED" ? "점수판 내용을 확인해 주세요." : null,
      approvedMatchSeriesId: status === "APPROVED" ? draftId : null,
      expectedGameCount: 2, receivedGameNumbers: [],
    } });
    assert.equal(html.includes('type="file"'), status === "AWAITING_UPLOAD");
    assert.match(html, /href="\/matches\/submissions"/u);
    assert.match(html, /href="\/matches\/submit"/u);
    if (status === "REJECTED") {
      assert.match(html, /점수판 내용을 확인해 주세요/u);
      assert.match(html, /href="\/help\/contact"/u);
    }
    if (status === "APPROVED") assert.ok(html.includes(`href="/matches/${draftId}"`));
    if (status === "PENDING_REVIEW") assert.match(html, /이미지 제출이 완료되었어요/u);
  }
});

test("submission lookup failure keeps the code for retry and is distinct from a missing submission", async () => {
  const session = { userId: "synthetic-owner", purpose: "ACCOUNT", role: "USER", accountStatus: "APPROVED", mustChangePassword: false };
  const failure = await pageContext(session, { failLookup: true }).formFor({ code: codeA });
  assert.equal(failure.props.viewer, "LOAD_ERROR");
  const html = renderForm(failure.props);
  assert.match(html, /접수 정보를 불러오지 못했어요/u);
  assert.match(html, /action="\/matches\/submit" method="get"/u);
  assert.ok(html.includes(`name="code" value="${codeA}"`));
  assert.doesNotMatch(html, /접수를 찾지 못했어요|새 결과 접수|접수 만들기/u);
  const missing = await pageContext(session).formFor({ code: codeA });
  assert.equal(missing.props.viewer, "APPROVED");
  assert.match(renderForm(missing.props), /접수를 찾지 못했어요/u);
});

test("creating a submission locks mutations until the server route has committed and resets new-submission state", async () => {
  const navigation = [];
  const requests = [];
  const slots = [];
  let cursor = 0;
  let finishNavigation;
  let confirmations = 0;
  const hooks = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useTransition() {
      const [pending, setPending] = hooks.useState(false);
      return [pending, (operation) => { setPending(true); finishNavigation = () => setPending(false); operation(); }];
    },
  };
  function find(tree, predicate) {
    if (!React.isValidElement(tree)) return undefined;
    if (predicate(tree)) return tree;
    for (const child of React.Children.toArray(tree.props.children)) {
      const found = find(child, predicate);
      if (found) return found;
    }
  }
  const keyStore = load("modules/matches/infrastructure/client-match-mutation-key-store.ts", {}, { crypto: webcrypto });
  const { SubmissionForm } = load("app/(public)/(matches)/matches/submit/submission-form.tsx", {
    react: hooks,
    "react/jsx-runtime": jsxRuntime,
    "next/link": () => null,
    "next/navigation": { useRouter: () => ({ replace: (...args) => navigation.push(args), push: (...args) => navigation.push(args) }) },
    "@/components/usage/usage-actions": { recordUsageAction: () => {} },
    "@/modules/matches/domain/match": { MATCH_IMAGE_MAX_BYTES: 4 * 1024 * 1024 },
    "@/modules/matches/infrastructure/client-match-mutation-key-store": keyStore,
    "./submit.module.css": css,
  }, {
    crypto: webcrypto,
    window: { confirm: () => { confirmations++; return true; } },
    FormData: class { constructor(fields) { this.fields = fields; } get(name) { return this.fields[name] ?? null; } },
    fetch: async (...args) => { requests.push(args); return { ok: true, json: async () => ({ submissionId: "synthetic-created", publicCode: codeA, status: "AWAITING_UPLOAD", revision: 1 }) }; },
  });
  const render = () => { cursor = 0; return SubmissionForm(baseProps); };
  const section = find(render(), (node) => node.props["aria-labelledby"] === "new-submission-title");
  const form = find(section, (node) => node.type === "form");
  await form.props.onSubmit({ preventDefault() {}, currentTarget: { title: "합성 경기", organizer: "합성 주최자", seriesNumber: "1", playedOn: "2026-10-05", expectedGameCount: "2" } });
  assert.equal(navigation.length, 1);
  assert.equal(navigation[0][0], `/matches/submit?code=${codeA}`);
  assert.equal(navigation[0][1].scroll, false);
  const pending = render();
  const upload = find(pending, (node) => node.props.type === "file");
  const cancel = find(pending, (node) => node.type === "button" && node.props["data-danger"] === "true");
  const edit = find(pending, (node) => node.type === "button" && node.props.children === "접수 정보 수정");
  const resume = find(pending, (node) => node.type === "form");
  assert.equal(upload.props.disabled, true, "the created submission must not accept uploads while its server render is still in flight");
  assert.equal(cancel.props.disabled, true);
  assert.equal(edit.props.disabled, true);
  assert.equal(find(resume, (node) => node.type === "button").props.disabled, true);
  assert.equal(find(pending, (node) => node.props["aria-labelledby"] === "upload-title").props["aria-busy"], true);
  let fileReads = 0;
  upload.props.onChange({ currentTarget: { files: [{ type: "image/png", size: 12, arrayBuffer: async () => { fileReads++; return new ArrayBuffer(12); } }], value: "synthetic.png" } });
  await cancel.props.onClick();
  resume.props.onSubmit({ preventDefault() {} });
  assert.equal(fileReads, 0, "an already-dispatched file handler must not begin an upload during navigation");
  assert.equal(confirmations, 0, "navigation must also guard the cancel handler");
  assert.equal(requests.length, 1, "only the completed create request may have reached the server");
  assert.equal(navigation.length, 1, "another continuation must not race the created submission navigation");
  assert.equal(typeof finishNavigation, "function");
  finishNavigation();
  const settled = render();
  assert.equal(find(settled, (node) => node.props.type === "file").props.disabled, false, "a settled route must allow the next upload");
  assert.equal(find(settled, (node) => node.props["aria-labelledby"] === "upload-title").props["aria-busy"], false);
  const context = pageContext();
  const createdForm = await context.formFor({ code: codeA });
  const freshForm = await context.formFor({});
  assert.notEqual(createdForm.key, freshForm.key);
  assert.match(renderForm({ ...freshForm.props, viewer: "APPROVED" }), /새 결과 접수/u);
});
