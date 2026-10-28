import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as nodeCrypto from "node:crypto";
const { webcrypto } = nodeCrypto;
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
const Button = ({ children, ...props }) => React.createElement("button", Object.fromEntries(Object.entries(props).filter(([key]) => !["variant", "size"].includes(key))), children);
const Link = ({ children, ...props }) => React.createElement("a", props, children);
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const match = find(child, predicate); if (match) return match; }
  return null;
}
function harness(file, name, initialProps, send) {
  const slots = [], requests = [], navigation = [], cache = new Map(), effects = [];
  const windowListeners = new Map(), documentListeners = new Map();
  const windowFixture = { confirm: () => true, addEventListener: (name, handler) => windowListeners.set(name, handler), removeEventListener: name => windowListeners.delete(name) };
  const documentFixture = { visibilityState: "visible", addEventListener: (name, handler) => documentListeners.set(name, handler), removeEventListener: name => documentListeners.delete(name) };
  let cursor = 0, props = initialProps, refreshed = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(callback) { return callback(); },
    useEffect(callback) { effects.push(callback); },
    useTransition() { return [false, callback => callback()]; },
    useId() { return `fixture-${cursor++}`; },
  };
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const result = { exports: {} }; cache.set(filename, result);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      process: { env: { NODE_ENV: "test", NEXT_PUBLIC_SERVICE_ID: "klol" } },
      exports: result.exports, TextEncoder, URL, URLSearchParams, crypto: webcrypto, requestAnimationFrame: callback => callback(), window: windowFixture, document: documentFixture,
      FormData: class { constructor(values) { this.values = values; } get(name) { return this.values[name] ?? null; } },
      fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length, options); },
      require(specifier) {
        if (specifier === "node:crypto") return nodeCrypto;
        if (specifier === "react") return hooks;
        if (specifier === "react/jsx-runtime") return jsx;
        if (specifier === "next/link") return Link;
        if (specifier === "next/navigation") return { useRouter: () => ({ push: href => navigation.push(href), replace: href => navigation.push(href), refresh: () => refreshed++ }) };
        if (specifier === "@/components/ui/button") return { Button };
        if (specifier === "@/components/ui/input") return { Input: props => React.createElement("input", props) };
        if (specifier.endsWith("theme-icons")) return new Proxy({}, { get: () => () => null });
        if (specifier.endsWith("usage-actions")) return { recordUsageAction() {} };
        if (specifier.endsWith(".module.css")) return css;
        const base = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate) && /\.tsx?$/.test(candidate));
        assert.ok(resolved, `Unhandled dependency ${specifier}`);
        return load(resolved);
      },
    });
    return result.exports;
  }
  const Component = load(path.join(root, "src", file))[name];
  return {
    requests, navigation, windowListeners, documentListeners, documentFixture,
    runEffects() { return effects.splice(0).map(callback => callback()).filter(Boolean); },
    get refreshed() { return refreshed; },
    render(nextProps = props) { props = nextProps; cursor = 0; return Component(props); },
    async submit(values) { await find(this.render(), node => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: values }); },
  };
}
const rejection = () => ({ ok: false, status: 412, json: async () => ({ detail: "다른 작업이 먼저 저장됨" }) });
const success = body => ({ ok: true, status: 200, json: async () => body });

test("application day, season and round changes retain choices until the new target is accepted", async () => {
  for (const change of [{ applyDate: "2026-10-14" }, { seasonId: "new-season", seasonName: "새 시즌" }, { roundId: "new-round" }]) {
    const props = { seasonId: "old-season", seasonName: "기존 시즌", roundId: null, applyDate: "2026-10-13", initial: null, recruitNo: 1, applicantPlayer: { displayName: "합성", riotId: "Fixture#KR1" } };
    const subject = harness("app/(public)/(applications)/applications/application-actions.tsx", "ApplicationActions", props, () => success({}));
    find(subject.render(), node => node.props.name === "mainPosition" && node.props.value === "MID").props.onChange();
    let tree = subject.render({ ...props, ...change });
    assert.equal(find(tree, node => node.props.name === "mainPosition" && node.props.value === "MID").props.checked, true);
    const save = find(tree, node => node.type === "button" && node.props.children === "참가 신청");
    assert.equal(save.props.disabled, true);
    await save.props.onClick();
    assert.equal(subject.requests.length, 0);
    find(tree, node => node.props.children === "현재 모집에 내 입력 사용").props.onClick();
    tree = subject.render();
    await find(tree, node => node.type === "button" && node.props.children === "참가 신청").props.onClick();
    const payload = JSON.parse(subject.requests[0].body);
    assert.equal(payload.mainPosition, "MID");
    assert.deepEqual(payload.target, { seasonId: change.seasonId ?? props.seasonId, applyDate: change.applyDate ?? props.applyDate, roundId: change.roundId ?? props.roundId, applicationId: null });
  }
});

test("an expired round that no longer exists keeps the draft instead of refreshing into an error page", async () => {
  const props = { seasonId: "old-season", seasonName: "기존 시즌", roundId: "old-round", applyDate: "2026-10-13", initial: null, recruitNo: 2, applicantPlayer: { displayName: "합성", riotId: "Fixture#KR1" } };
  const subject = harness("app/(public)/(applications)/applications/application-actions.tsx", "ApplicationActions", props, attempt => attempt === 1
    ? { ok: false, status: 412, json: async () => ({ code: "APPLICATION_TARGET_CHANGED" }) }
    : { ok: false, status: 400, json: async () => ({}) });
  find(subject.render(), node => node.props.name === "mainPosition" && node.props.value === "MID").props.onChange();
  await find(subject.render(), node => node.type === "button" && node.props.children === "참가 신청").props.onClick();
  const tree = subject.render();
  assert.equal(subject.refreshed, 0);
  assert.equal(find(tree, node => node.props.name === "mainPosition" && node.props.value === "MID").props.checked, true);
  assert.equal(find(tree, node => node.props.children === "참가 신청").props.disabled, true);
  assert.match(renderToStaticMarkup(tree), /새 탭에서 현재 모집 확인/u);
});

const submissionFixture = { id: "11111111-1111-4111-8111-111111111111", publicCode: "MR2AAAAAAAAAAAAAAAA", seasonId: null, seasonName: null, title: "합성 경기", organizer: "합성", seriesNumber: 1, note: null, playedOn: "2026-10-14", startedAt: null, expectedGameCount: 2, teamBalanceDraftId: null, source: "WEB", receivedGameNumbers: [], status: "AWAITING_UPLOAD", publicReviewReason: null, approvedMatchSeriesId: null, revision: 1, updatedAt: "2026-10-14T00:00:00Z" };
const submissionProps = { viewer: "APPROVED", seasons: [], initial: submissionFixture, requestedCode: submissionFixture.publicCode, requestedTeamBalanceDraftId: null, teamBalanceDraft: null };
const submissionInput = { title: "내 작성값", organizer: "합성", seriesNumber: "1", playedOn: "2026-10-14", expectedGameCount: "2" };

test("new and edited match submissions lock their fields until delayed saves settle", async () => {
  for (const creating of [true, false]) {
    for (const accepted of [true, false]) {
      let respond;
      const subject = harness("app/(public)/(matches)/matches/submit/submission-form.tsx", "SubmissionForm",
        creating ? { ...submissionProps, initial: null, requestedCode: null } : submissionProps,
        () => new Promise(resolve => { respond = resolve; }));
      if (!creating) find(subject.render(), node => node.props.children === "접수 정보 수정").props.onClick();
      const pending = subject.submit({ ...submissionInput, note: "요청에 포함한 메모" });
      const form = find(subject.render(), node => node.type === "form");
      const fields = find(form, node => node.type === "fieldset");
      assert.ok(fields, "all mutable fields share a disabled fieldset");
      assert.equal(fields.props.disabled, true, "typing cannot continue into a form that will be replaced on success");
      for (const name of ["title", "organizer", "playedOn", "seriesNumber", "expectedGameCount", "seasonId", "startedAt", "note"]) {
        assert.ok(find(fields, node => node.props.name === name), `${name} is inside the locked fieldset`);
      }
      await subject.submit(submissionInput);
      assert.equal(subject.requests.length, 1, "a pending save cannot be submitted twice");
      assert.equal(JSON.parse(subject.requests[0].body).note, "요청에 포함한 메모");
      respond(accepted ? success({ submissionId: submissionFixture.id, publicCode: submissionFixture.publicCode, status: "AWAITING_UPLOAD", revision: 2 }) : { ok: false, status: 503, json: async () => ({}) });
      await pending;
      const tree = subject.render();
      if (accepted) {
        assert.equal(find(tree, node => node.props.name === "title"), null, "successful saving exits the editor");
      } else {
        assert.equal(find(tree, node => node.type === "fieldset").props.disabled, false, "failed saving leaves the form available for retry");
        assert.match(renderToStaticMarkup(tree), /요청을 처리하지 못했어요/u);
      }
    }
  }
});

test("match submission conflicts compare latest values and retry preserved input with the accepted revision", async () => {
  const latest = { ...submissionFixture, revision: 2, title: "다른 탭 제목", note: "다른 탭 메모" };
  const subject = harness("app/(public)/(matches)/matches/submit/submission-form.tsx", "SubmissionForm", submissionProps, attempt => attempt === 1 ? rejection() : attempt === 2 ? success({ submission: latest }) : success({ status: "AWAITING_UPLOAD", revision: 3 }));
  find(subject.render(), node => node.props.children === "접수 정보 수정").props.onClick();
  await subject.submit(submissionInput);
  let tree = subject.render();
  assert.match(renderToStaticMarkup(tree), /다른 탭 제목/u);
  assert.match(renderToStaticMarkup(tree), /다른 탭 메모/u);
  assert.equal(find(tree, node => node.props.children === "수정 저장").props.disabled, true);
  await subject.submit(submissionInput);
  assert.equal(subject.requests.length, 2, "comparison blocks another mutation");
  find(tree, node => node.props.children === "내 입력 유지").props.onClick();
  await subject.submit(submissionInput);
  assert.equal(subject.requests[2].headers["If-Match"], '"2"');
  assert.equal(JSON.parse(subject.requests[2].body).title, "내 작성값");
});

test("match conflict retry survives failed latest reads and terminal state offers discard only", async () => {
  const subject = harness("app/(public)/(matches)/matches/submit/submission-form.tsx", "SubmissionForm", submissionProps, attempt => attempt === 1 ? rejection() : attempt === 2 ? Promise.reject(new Error("offline")) : success({ submission: { ...submissionFixture, revision: 2, status: "CANCELLED" } }));
  find(subject.render(), node => node.props.children === "접수 정보 수정").props.onClick();
  await subject.submit(submissionInput);
  let tree = subject.render();
  assert.match(renderToStaticMarkup(tree), /입력은 유지했습니다/u);
  await find(tree, node => node.props.children === "최신값 다시 불러오기").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = subject.render();
  assert.equal(find(tree, node => node.props.children === "내 입력 유지"), null);
  find(tree, node => node.props.children === "입력 버리고 최신값 사용").props.onClick();
  assert.equal(find(subject.render(), node => node.props.children === "수정 저장"), null);
  assert.match(renderToStaticMarkup(subject.render()), /사용자 취소/u);
});

test("image upload recovery cannot advance an open editor past unseen metadata changes", async () => {
  const latest = { ...submissionFixture, revision: 2, title: "다른 탭 최신 제목", receivedGameNumbers: [1] };
  const subject = harness("app/(public)/(matches)/matches/submit/submission-form.tsx", "SubmissionForm", submissionProps, attempt => attempt === 1 ? Promise.reject(new Error("response lost")) : attempt === 2 ? success({ submission: latest }) : success({ status: "AWAITING_UPLOAD", revision: 3 }));
  find(subject.render(), node => node.props.children === "접수 정보 수정").props.onClick();
  const file = { name: "synthetic.png", type: "image/png", size: 12, arrayBuffer: async () => new Uint8Array(12).buffer };
  find(subject.render(), node => node.type === "input" && node.props.type === "file").props.onChange({ currentTarget: { files: [file], value: "synthetic.png" } });
  for (let attempt = 0; attempt < 20 && subject.requests.length < 2; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  let tree = subject.render();
  assert.equal(subject.requests.length, 2);
  assert.match(renderToStaticMarkup(tree), /다른 탭 최신 제목/u);
  assert.equal(find(tree, node => node.props.children === "수정 저장").props.disabled, true);
  await subject.submit(submissionInput);
  assert.equal(subject.requests.length, 2);
  find(tree, node => node.props.children === "내 입력 유지").props.onClick();
  await subject.submit(submissionInput);
  assert.equal(subject.requests[2].headers["If-Match"], '"2"');
  assert.equal(JSON.parse(subject.requests[2].body).title, submissionInput.title);
});

test("site and Kakao settings lock all inputs during saving and unlock after malformed responses", async () => {
  const initial = { revision: 1, brandName: "합성", tagline: "기존", supportUrl: null, features: { registrations: true }, aiAllowedRoles: [], aiRequestsPerHour: 10, aiDailyCostLimitMicros: 0, internalMaintenanceNote: null, globalEnabled: true, maintenanceMode: false, playerSearchEnabled: true, seasonApplicationsEnabled: true, imageReceiveEnabled: true, recruitingEnabled: true, scheduledNoticeEnabled: true, maxMessageLength: 900 };
  for (const [file, name] of [["app/(admin)/admin/site-settings/settings-form.tsx", "default"], ["app/(admin)/admin/kakao/kakao-settings-form.tsx", "KakaoSettingsForm"]]) {
    let respond;
    const subject = harness(file, name, { initial }, () => new Promise(resolve => { respond = resolve; }));
    const pending = subject.submit({});
    assert.equal(find(subject.render(), node => node.type === "fieldset").props.disabled, true);
    respond({ ok: true, json: async () => { throw new Error("truncated response"); } });
    await pending;
    const tree = subject.render();
    assert.equal(find(tree, node => node.type === "fieldset").props.disabled, false);
    assert.match(renderToStaticMarkup(tree), /저장하지 못했습니다/u);
  }
});

test("full round requires an explicit reserve choice and sends only the selected seat", async () => {
  const subject = harness("app/(public)/(applications)/applications/application-actions.tsx", "ApplicationActions", { initial: null, recruitNo: 1, applicantPlayer: { displayName: "합성 회원", riotId: "Fixture#KR1" }, applyDate: "2026-10-13", capacity: 10, participantCount: 10 }, () => success({}));
  let tree = subject.render();
  assert.equal(find(tree, node => node.type === "input" && node.props.name === "seat" && node.props.disabled).props.checked, false);
  const submit = find(tree, node => node.type === "button" && node.props.onClick);
  assert.equal(submit.props.disabled, true);
  await submit.props.onClick();
  assert.equal(subject.requests.length, 0);
  find(tree, node => node.type === "input" && node.props.name === "seat" && !node.props.disabled).props.onChange();
  find(subject.render(), node => node.type === "input" && node.props.value === "MID").props.onChange();
  tree = subject.render();
  assert.match(renderToStaticMarkup(tree), /예비 참가 신청/u);
  await find(tree, node => node.type === "button" && node.props.onClick).props.onClick();
  assert.equal(JSON.parse(subject.requests[0].body).reserve, true);
});

const application = { id: "fixture-application", seasonId: "fixture-season", applyDate: "2026-10-13", recruitNo: 1, status: "APPLIED", source: "SITE", mainPosition: "TOP", subPositions: ["JGL"], revision: 1, updatedAt: "2026-10-13T00:00:00Z" };
const applicationProps = { seasonId: application.seasonId, seasonName: "합성 시즌", roundId: null, initial: application, recruitNo: 1, applicantPlayer: { displayName: "합성 회원", riotId: "Fixture#KR1" }, applyDate: application.applyDate, capacity: 10, participantCount: 5 };
const action = (tree, label) => find(tree, node => node.type === "button" && node.props.children === label);
test("application refresh preserves draft and blocks save/cancel until the new revision is explicitly accepted", async () => {
  const saved = { ...application, mainPosition: "MID", subPositions: ["JGL", "ADC"], status: "RESERVE", revision: 3 };
  const subject = harness("app/(public)/(applications)/applications/application-actions.tsx", "ApplicationActions", applicationProps, () => success({ application: saved }));
  find(subject.render(), node => node.props.name === "mainPosition" && node.props.value === "MID").props.onChange();
  find(subject.render(), node => node.props.name === "subPositions" && node.props.value === "ADC").props.onChange();
  find(subject.render(), node => node.props.name === "seat" && node.props.checked === false).props.onChange();
  let tree = subject.render({ ...applicationProps, initial: { ...application, mainPosition: "SUP", subPositions: ["TOP"], revision: 2 } });
  assert.equal(find(tree, node => node.props.name === "mainPosition" && node.props.value === "MID").props.checked, true);
  assert.match(renderToStaticMarkup(tree), /최신 주라인<\/dt><dd>서폿/u);
  assert.equal(action(tree, "예비 신청 수정").props.disabled, true);
  assert.equal(action(tree, "내 신청 취소").props.disabled, true);
  await action(tree, "예비 신청 수정").props.onClick();
  await action(tree, "내 신청 취소").props.onClick();
  assert.equal(subject.requests.length, 0);
  action(tree, "내 입력 유지").props.onClick();
  await action(subject.render(), "예비 신청 수정").props.onClick();
  assert.equal(subject.requests[0].headers["If-Match"], '"2"');
  assert.deepEqual(JSON.parse(subject.requests[0].body), { recruitNo: 1, mainPosition: "MID", subPositions: ["JGL", "ADC"], reserve: true, target: { seasonId: application.seasonId, applyDate: application.applyDate, roundId: null, applicationId: application.id } });
  tree = subject.render();
  assert.equal(action(tree, "예비 신청 수정").props.disabled, false, "a successful response advances the draft revision before refresh arrives");
  await action(tree, "예비 신청 수정").props.onClick();
  assert.equal(subject.requests[1].headers["If-Match"], '"3"');
});

test("application 412 retains the draft and explicit discard uses latest main/sub/reserve values", async () => {
  const subject = harness("app/(public)/(applications)/applications/application-actions.tsx", "ApplicationActions", applicationProps, attempt => attempt === 1 ? rejection() : success({ application: { ...application, revision: 3, status: "CANCELLED" } }));
  find(subject.render(), node => node.props.name === "mainPosition" && node.props.value === "MID").props.onChange();
  await action(subject.render(), "신청 수정").props.onClick();
  assert.equal(subject.requests[0].headers["If-Match"], '"1"');
  assert.equal(action(subject.render(), "신청 수정").props.disabled, true);
  const latest = { ...application, mainPosition: "SUP", subPositions: ["ADC"], status: "RESERVE", revision: 2 };
  let tree = subject.render({ ...applicationProps, initial: latest });
  assert.equal(find(tree, node => node.props.name === "mainPosition" && node.props.value === "MID").props.checked, true);
  action(tree, "입력 버리고 최신값 사용").props.onClick();
  tree = subject.render();
  assert.equal(find(tree, node => node.props.name === "mainPosition" && node.props.value === "SUP").props.checked, true);
  assert.equal(find(tree, node => node.props.name === "subPositions" && node.props.value === "ADC").props.checked, true);
  assert.equal(action(tree, "예비 신청 수정").props.disabled, false);
  await action(tree, "내 신청 취소").props.onClick();
  assert.equal(subject.requests[1].method, "DELETE");
  assert.equal(subject.requests[1].headers["If-Match"], '"2"');
});

test("a newly observed application needs comparison even when its initial revision is zero", async () => {
  const subject = harness("app/(public)/(applications)/applications/application-actions.tsx", "ApplicationActions", { ...applicationProps, initial: null }, () => success({}));
  subject.render();
  const tree = subject.render({ ...applicationProps, initial: { ...application, revision: 0 } });
  assert.equal(action(tree, "신청 수정").props.disabled, true);
  assert.ok(action(tree, "내 입력 유지"));
});

test("season creation retains a failed draft and resets only after confirmed success", async () => {
  let resets = 0;
  const fields = { name: "합성 시즌", startsAt: "2026-10-13T20:00", applicationsOpenAt: "", applicationsCloseAt: "", endsAt: "", reset() { resets++; } };
  const subject = harness("app/(admin)/admin/seasons/season-admin-actions.tsx", "CreateSeasonForm", {}, attempt => attempt === 1 ? rejection() : success({}));
  assert.equal(subject.render().props.action, undefined, "failed requests must not enter React's automatic form-reset path");
  await subject.submit(fields);
  assert.equal(resets, 0);
  assert.match(renderToStaticMarkup(subject.render()), /다른 작업이 먼저 저장됨/u);
  await subject.submit(fields);
  assert.equal(resets, 1);
  assert.equal(subject.requests[0].body, subject.requests[1].body);
});

test("signup retains the actual review result with an explicit login continuation", async () => {
  const subject = harness("components/accounts/account-auth-forms.tsx", "SignupForm", { nextPath: "/applications?recruitNo=2" }, () => success({ message: "기존 플레이어 연결은 관리자 수동 검토 후 확정됩니다." }));
  const fields = { loginId: "fixture_user", password: "Synthetic123", memberName: "합성 회원", riotId: "Fixture#KR1", termsAccepted: "on", privacyAccepted: "on", reset() {} };
  assert.equal(subject.render().props.noValidate, undefined);
  await subject.submit(fields);
  const tree = subject.render();
  assert.match(renderToStaticMarkup(tree), /관리자 수동 검토/u);
  assert.equal(find(tree, node => node.type === "form"), null);
  assert.equal(subject.navigation.length, 0, "success should remain readable until the user chooses to continue");
  const login = find(tree, node => node.type === Link && node.props.href.startsWith("/login?"));
  assert.equal(new URL(login.props.href, "https://fixture.invalid").searchParams.get("next"), "/applications?recruitNo=2");
});

test("signup reports password and Riot ID validity on the field being edited", () => {
  const subject = harness("components/accounts/account-auth-forms.tsx", "SignupForm", {}, () => success({}));
  const tree = subject.render();
  for (const [name, invalid, valid, expected] of [["password", "short", "Synthetic123", /비밀번호/u], ["riotId", "MissingTag", "Fixture#KR1", /게임 이름#태그/u]]) {
    let validity = "";
    const input = { value: invalid, setCustomValidity(value) { validity = value; } };
    const field = find(tree, node => node.type === "input" && node.props.name === name);
    field.props.onInput({ currentTarget: input });
    assert.match(validity, expected);
    input.value = valid; field.props.onInput({ currentTarget: input });
    assert.equal(validity, "");
  }
});

const player = { id: "fixture-player", memberName: "이전 이름", nickname: "Fixture", tagLine: "KR1", riotId: "Fixture#KR1", peakTier: "GOLD I", currentTier: "SILVER II", revision: 1 };
test("admin player conflict preserves draft, compares latest and retries only after explicit choice", async () => {
  const subject = harness("components/admin/players/admin-player-form.tsx", "AdminPlayerForm", { mode: "edit", player }, attempt => attempt === 1 ? rejection() : success({ player: { id: player.id, revision: 3 } }));
  find(subject.render(), node => node.props.name === "memberName").props.onChange({ target: { value: "작성 중 이름" } });
  await subject.submit({});
  let tree = subject.render({ mode: "edit", player: { ...player, memberName: "다른 관리자의 이름", revision: 2 } });
  assert.equal(find(tree, node => node.props.name === "memberName").props.value, "작성 중 이름");
  assert.match(renderToStaticMarkup(tree), /다른 관리자의 이름/u);
  assert.equal(find(tree, node => node.props.type === "submit").props.disabled, true);
  find(tree, node => node.props.children === "내 입력 유지").props.onClick();
  await subject.submit({});
  assert.equal(subject.requests[1].headers["If-Match"], '"2"');
  assert.equal(JSON.parse(subject.requests[1].body).memberName, "작성 중 이름");
  await subject.submit({});
  assert.equal(subject.requests[2].headers["If-Match"], '"3"');
});

test("account player conflict keeps the form mounted when the user retains their draft", async () => {
  const subject = harness("components/accounts/account-player-form.tsx", "AccountPlayerForm", { player }, attempt => attempt === 1 ? rejection() : success({ playerRevision: 3 }));
  const fields = { memberName: "작성 이름", riotId: "Fixture#KR1", peakTier: "GOLD I", currentTier: "SILVER II" };
  const draft = tree => find(tree, node => node.type === "div" && node.props.className === "form");
  const before = draft(subject.render()).key;
  await subject.submit(fields);
  let tree = subject.render({ player: { ...player, memberName: "최신 저장 이름", revision: 2 } });
  assert.equal(draft(tree).key, before);
  assert.equal(find(tree, node => node.props.type === "submit").props.disabled, true);
  find(tree, node => node.props.children === "내 입력 유지").props.onClick();
  await subject.submit(fields);
  assert.equal(subject.requests[1].headers["If-Match"], '"2"');
  assert.equal(JSON.parse(subject.requests[1].body).memberName, "작성 이름");
});

test("account player discard explicitly resets editable fields to the latest revision", async () => {
  const subject = harness("components/accounts/account-player-form.tsx", "AccountPlayerForm", { player }, rejection);
  const draft = tree => find(tree, node => node.type === "div" && node.props.className === "form");
  const before = draft(subject.render()).key;
  await subject.submit({ memberName: "작성 중 이름" });
  const latest = { ...player, memberName: "최신 회원명", revision: 2 };
  const tree = subject.render({ player: latest });
  find(tree, node => node.props.children === "입력 버리고 최신값 사용").props.onClick();
  const discarded = subject.render();
  assert.notEqual(draft(discarded).key, before, "only a deliberate discard remounts uncontrolled inputs");
  assert.equal(find(discarded, node => node.props.name === "memberName").props.defaultValue, latest.memberName);
  assert.equal(find(discarded, node => node.props.type === "submit").props.disabled, false);
});

test("live view refresh checks on a visible return, throttles repeated focus, and supports manual refresh", () => {
  const subject = harness("components/navigation/live-view-refresh.tsx", "LiveViewRefresh", { checkedAt: new Date(Date.now() - 31_000).toISOString() }, () => success({}));
  const tree = subject.render();
  assert.match(renderToStaticMarkup(tree), /마지막 조회/u);
  const cleanups = subject.runEffects();
  subject.documentFixture.visibilityState = "hidden";
  subject.windowListeners.get("focus")();
  assert.equal(subject.refreshed, 0);
  subject.documentFixture.visibilityState = "visible";
  subject.documentListeners.get("visibilitychange")();
  subject.windowListeners.get("focus")();
  assert.equal(subject.refreshed, 1);
  find(tree, node => node.props.children === "현황 새로고침").props.onClick();
  assert.equal(subject.refreshed, 2);
  cleanups.forEach(cleanup => cleanup());
  assert.equal(subject.windowListeners.size, 0);
  assert.equal(subject.documentListeners.size, 0);
});
