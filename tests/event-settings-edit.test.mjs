import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const actionPath = "src/app/(admin)/admin/progress/event/[eventId]/event-admin-actions.tsx";
const event = {
  id: "20b56b3a-3d30-48f1-848a-69bcba6f0fe6", revision: 3,
  settings: { title: "합성 이벤트", description: "합성 설명", format: "POSITION", recruitmentOpensAt: "2026-10-07T15:30:12.345Z", recruitmentClosesAt: "2026-10-08T14:59:59.123Z", bracketBestOf: 3 },
  lifecycle: { status: "PLANNED" }, participants: [], teams: [], bracket: null, galleryId: null,
};
const success = { ok: true, status: 200, json: async () => ({ eventId: event.id, commandType: "REPLACE_SETTINGS", revision: 4 }) };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
const field = (tree, name) => find(tree, (node) => node.props.name === name);
const button = (tree, label) => find(tree, (node) => node.type === "button" && node.props.children === label);
const settingsForm = (tree) => find(tree, (node) => node.type === "form" && Boolean(field(node, "title")));

function harness(send = () => success, initial = event) {
  const slots = [], requests = [], navigation = [], transitions = [], modules = new Map();
  let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(factory) { return factory(); },
    useTransition() { const [pending, setPending] = hooks.useState(false); return [pending, (operation) => { setPending(true); operation(); transitions.push(() => setPending(false)); }]; },
  };
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} }; modules.set(filename, loaded);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      exports: loaded.exports, crypto: webcrypto, AbortSignal, Date, Error,
      FormData: class { constructor(values) { this.values = values; } get(name) { return this.values[name]; } },
      fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length, options); },
      require(specifier) {
        if (specifier === "react") return hooks;
        if (specifier === "react/jsx-runtime") return jsx;
        if (specifier === "next/link") return { __esModule: true, default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) };
        if (specifier === "next/navigation") return { useRouter: () => ({ refresh: () => navigation.push("refresh") }) };
        if (specifier.endsWith("/bounded-picker")) return { BoundedPicker: () => null };
        if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
        const resolved = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        return load(`${resolved}.ts`);
      },
    });
    return loaded.exports;
  }
  const loaded = load(path.join(root, actionPath));
  const subject = {
    requests, navigation,
    render(value = initial) { cursor = 0; return loaded.EventAdminActions({ event: value, playerOptions: [], playerLabels: {}, galleryOptions: [] }); },
    set(name, value) { const input = field(subject.render(), name); assert.ok(input, `missing ${name} input`); input.props.onChange({ target: { value } }); },
    async submit() { const form = settingsForm(subject.render()); assert.ok(form, "planned event needs editable settings"); await form.props.onSubmit({ preventDefault() {} }); await tick(); },
    finishRefresh() { transitions.splice(0).forEach((finish) => finish()); },
  };
  return subject;
}

test("actual admin rendering exposes settings only while planned with no participants, including cancelled participants", () => {
  const subject = harness();
  const tree = subject.render();
  assert.ok(settingsForm(tree), "missing settings task on an editable planned event");
  const html = renderToStaticMarkup(tree);
  assert.match(html, /이벤트 설정 수정/u);
  assert.match(html, /모집 시작 \(한국 시간\)/u);
  assert.match(html, /모집 마감 \(한국 시간\)/u);
  for (const name of ["title", "description", "format", "recruitmentOpensAt", "recruitmentClosesAt", "bracketBestOf"]) assert.ok(field(tree, name), name);
  for (const status of ["RECRUITING", "TEAM_BUILDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) {
    assert.equal(settingsForm(subject.render({ ...event, lifecycle: { status } })), null, status);
  }
  for (const status of ["ACTIVE", "CANCELLED"]) {
    assert.equal(settingsForm(subject.render({ ...event, participants: [{ id: "participant", playerId: "player", status }] })), null, `${status} participant locks settings`);
  }
});

test("unchanged dates round-trip exactly through KST inputs across midnight independently of machine timezone", async () => {
  const subject = harness();
  assert.equal(field(subject.render(), "recruitmentOpensAt")?.props.value, "2026-10-08T00:30:12.345");
  assert.equal(field(subject.render(), "recruitmentClosesAt")?.props.value, "2026-10-08T23:59:59.123");
  await subject.submit();
  const request = subject.requests[0];
  assert.equal(request.url, `/api/admin/competitions/events/${event.id}`);
  assert.equal(request.method, "PATCH");
  assert.equal(request.headers["If-Match"], '"3"');
  assert.deepEqual(JSON.parse(request.body), { type: "REPLACE_SETTINGS", payload: { settings: event.settings } });
  assert.deepEqual(subject.navigation, ["refresh"]);
});

test("edited settings use the existing command shape and reject invalid recruitment dates before sending", async () => {
  const subject = harness();
  subject.set("title", "수정한 합성 이벤트"); subject.set("description", ""); subject.set("format", "ARAM"); subject.set("bracketBestOf", "5");
  subject.set("recruitmentOpensAt", "2026-10-09T10:00"); subject.set("recruitmentClosesAt", "2026-10-09T09:00");
  await subject.submit(); assert.equal(subject.requests.length, 0);
  assert.match(renderToStaticMarkup(subject.render()), /모집 마감은 시작보다 늦어야 합니다/u);
  subject.set("recruitmentClosesAt", ""); await subject.submit(); assert.equal(subject.requests.length, 0);
  subject.set("recruitmentClosesAt", "2026-10-10T00:00"); await subject.submit();
  assert.deepEqual(JSON.parse(subject.requests[0].body).payload.settings, {
    title: "수정한 합성 이벤트", description: null, format: "ARAM", bracketBestOf: 5,
    recruitmentOpensAt: "2026-10-09T01:00:00.000Z", recruitmentClosesAt: "2026-10-09T15:00:00.000Z",
  });
});

test("lost response, server failure and unreadable success retry the same body, revision and idempotency key", async () => {
  const subject = harness((attempt) => {
    if (attempt === 1) throw new Error("synthetic lost response");
    if (attempt === 2) return { ok: false, status: 503, json: async () => { throw new Error("synthetic unavailable body"); } };
    if (attempt === 3) return { ...success, json: async () => { throw new Error("synthetic truncated response"); } };
    return success;
  });
  subject.set("title", "보존할 합성 입력");
  for (let attempt = 0; attempt < 4; attempt++) await subject.submit();
  for (const extract of [(r) => r.body, (r) => r.headers["If-Match"], (r) => r.headers["Idempotency-Key"]]) assert.equal(new Set(subject.requests.map(extract)).size, 1);
  assert.equal(field(subject.render(), "title").props.value, "보존할 합성 입력");
  assert.deepEqual(subject.navigation, ["refresh"]);
});

test("same-tick submits and another lifecycle operation are blocked through the successful refresh", async () => {
  let finish;
  const subject = harness(() => new Promise((resolve) => { finish = resolve; }));
  assert.ok(settingsForm(subject.render()), "planned event needs editable settings");
  const first = subject.submit(); const second = subject.submit();
  assert.equal(subject.requests.length, 1);
  assert.equal(find(settingsForm(subject.render()), (node) => node.type === "fieldset").props.disabled, true);
  finish(success); await Promise.all([first, second]);
  assert.equal(button(subject.render(), "설정 저장").props.disabled, true);
  await subject.submit(); await button(subject.render(), "모집 시작").props.onClick();
  assert.equal(subject.requests.length, 1);
  subject.finishRefresh();
  assert.equal(button(subject.render(), "설정 저장").props.disabled, false);
});

test("conflict preserves input until explicit reload; expired sessions return to this event after admin login", async () => {
  for (const status of [412, 401]) {
    const subject = harness(() => ({ ok: false, status, json: async () => ({ detail: "합성 복구 안내" }) }));
    subject.set("title", "다른 운영자와 충돌할 입력"); await subject.submit();
    assert.equal(field(subject.render(), "title").props.value, "다른 운영자와 충돌할 입력");
    assert.equal(button(subject.render(), "설정 저장").props.disabled, true);
    await subject.submit(); assert.equal(subject.requests.length, 1);
    assert.deepEqual(subject.navigation, []);
    if (status === 412) {
      await button(subject.render(), "입력 버리고 최신 내용 불러오기").props.onClick();
      assert.deepEqual(subject.navigation, ["refresh"]);
      subject.finishRefresh();
      assert.equal(field(subject.render(), "title").props.value, event.settings.title);
      assert.equal(button(subject.render(), "설정 저장").props.disabled, false);
    } else {
      assert.equal(find(subject.render(), (node) => node.props.children === "관리자 로그인").props.href, `/admin/login?next=${encodeURIComponent(`/admin/progress/event/${event.id}`)}`);
    }
  }
});

test("correcting a rejected setting uses a distinct request identity", async () => {
  const subject = harness(() => ({ ok: false, status: 400, json: async () => ({ detail: "입력을 확인하세요." }) }));
  await subject.submit(); subject.set("title", "입력 수정"); await subject.submit();
  assert.notEqual(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
  assert.notEqual(subject.requests[0].body, subject.requests[1].body);
});

test("unconfirmed success bodies retain the same request identity and never claim completion", async () => {
  for (const body of [null, {}, [], { eventId: "another-event", commandType: "REPLACE_SETTINGS", revision: 4 }, { eventId: event.id, commandType: "CANCEL_EVENT", revision: 4 }, { eventId: event.id, commandType: "REPLACE_SETTINGS", revision: 3 }, { eventId: event.id, commandType: "REPLACE_SETTINGS", revision: 4.5 }]) {
    const subject = harness((attempt) => attempt === 1 ? { ok: true, status: 200, json: async () => body } : success);
    await subject.submit();
    assert.deepEqual(subject.navigation, [], "uncertain success must not navigate or claim confirmation");
    assert.match(renderToStaticMarkup(subject.render()), /완료하지 못했습니다/u);
    await subject.submit();
    assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
    assert.equal(subject.requests[0].body, subject.requests[1].body);
    assert.deepEqual(subject.navigation, ["refresh"]);
  }
});

function detailPage(initial = event) {
  let current = initial;
  const authorization = [];
  const Actions = () => null;
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(root, "src/app/(admin)/admin/progress/event/[eventId]/page.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: loaded.exports, require(specifier) {
    if (specifier === "react/jsx-runtime") return jsx;
    if (specifier === "next/link") return ({ children, ...props }) => jsx.jsx("a", { ...props, children });
    if (specifier === "next/navigation") return { notFound() { throw new Error("unexpected not found"); } };
    if (specifier.endsWith("/theme-icons")) return { ArrowLeft: () => null, Trophy: () => null };
    if (specifier.endsWith("/server-authorization")) return { requirePageRole: async (...args) => { authorization.push(args); } };
    if (specifier.endsWith("/events")) return { isEventUuid: () => true };
    if (specifier.endsWith("/runtime-event")) return { getRuntimeEvent: () => ({ repository: { getAdminWorkspace: async () => ({ event: current, playerOptions: [], playerLabels: Object.fromEntries(current.participants.map((participant, index) => [participant.playerId, `합성 선수 ${index + 1}`])), galleryOptions: [] }) } }) };
    if (specifier.endsWith("/legacy-user-redirects") || specifier.endsWith("/legacy-identifiers")) return {};
    if (specifier === "./event-admin-actions") return { EventAdminActions: Actions };
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: {} };
    if (specifier.endsWith("/public-display-labels") || specifier.endsWith("/display-projection")) {
      const dependency = { exports: {} };
      const source = readFileSync(path.join(root, "src", `${specifier.slice(2)}.ts`), "utf8");
      vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: dependency.exports });
      return dependency.exports;
    }
    throw new Error(`unexpected detail dependency: ${specifier}`);
  } });
  const render = () => loaded.exports.default({ params: Promise.resolve({ eventId: event.id }) });
  return { Actions, authorization, render, setEvent(value) { current = value; } };
}

test("actual detail page resets local settings from the latest event revision after refresh", async () => {
  const subject = detailPage();
  const before = find(await subject.render(), (node) => node.type === subject.Actions);
  const current = { ...event, revision: 4, settings: { ...event.settings, title: "다른 운영자가 저장한 제목" } };
  subject.setEvent(current);
  const after = find(await subject.render(), (node) => node.type === subject.Actions);
  assert.notEqual(before.key, after.key);
  const refreshed = harness(() => ({ ...success, json: async () => ({ eventId: event.id, commandType: "REPLACE_SETTINGS", revision: 5 }) }), after.props.event);
  assert.equal(field(refreshed.render(), "title").props.value, current.settings.title);
  await refreshed.submit(); assert.equal(refreshed.requests[0].headers["If-Match"], '"4"');
});

test("actual admin page identifies each event mode and current lifecycle stage in Korean without losing links or authority", async () => {
  const statuses = { PLANNED: "준비 중", RECRUITING: "참가 모집", TEAM_BUILDING: "팀 편성", IN_PROGRESS: "진행 중", COMPLETED: "완료", CANCELLED: "취소" };
  const subject = detailPage();
  for (const [format, formatLabel] of Object.entries({ POSITION: "포지션 드래프트", ARAM: "칼바람" })) {
    for (const [status, statusLabel] of Object.entries(statuses)) {
      subject.setEvent({ ...event, settings: { ...event.settings, format }, lifecycle: { status } });
      const tree = await subject.render();
      const html = renderToStaticMarkup(tree);
      const stages = find(tree, (node) => node.props["aria-label"] === "이벤트 진행 단계");
      assert.deepEqual(React.Children.toArray(stages.props.children).map((node) => node.props.children), Object.values(statuses));
      assert.equal(find(stages, (node) => node.props["aria-current"] === "step").props.children, statusLabel);
      assert.match(html, new RegExp(formatLabel, "u"));
      assert.doesNotMatch(html, /POSITION|ARAM|PLANNED|RECRUITING|TEAM_BUILDING|IN_PROGRESS|COMPLETED|CANCELLED/u);
      assert.equal(find(tree, (node) => node.props.children === "공개 화면").props.href, `/competitions/events/${event.id}`);
      assert.equal(find(tree, (node) => node.type === subject.Actions).props.event.lifecycle.status, status);
    }
  }
  assert.equal(subject.authorization.length, 12);
  assert.ok(subject.authorization.every(([role, destination]) => role === "ADMIN" && destination === `/admin/progress/event/${event.id}`));
});

test("actual participant rows distinguish position, registration source and cancelled participation without leaking unknown codes", async () => {
  const participants = [
    { mainPosition: "TOP", source: "USER_APPLICATION", status: "ACTIVE" },
    { mainPosition: "MID", source: "ADMIN_IMPORT", status: "ACTIVE" },
    { mainPosition: null, source: "ADMIN_MANUAL", status: "CANCELLED" },
    { mainPosition: "FUTURE_POSITION", source: "FUTURE_SOURCE", status: "FUTURE_STATUS" },
  ].map((row, index) => ({ ...row, id: `participant-${index}`, playerId: `player-${index}`, ownerUserAccountId: null, subPositions: [] }));
  const subject = detailPage({ ...event, participants });
  const tree = await subject.render();
  const panel = find(tree, (node) => node.type === "article" && Boolean(find(node, (child) => child.type === "h2" && child.props.children === "참가자")));
  const html = renderToStaticMarkup(panel);
  for (const label of ["합성 선수 1", "합성 선수 2", "합성 선수 3", "합성 선수 4", "탑 · 직접 신청", "미드 · 명단 가져오기", "포지션 구분 없음 · 관리자 등록", "참가 취소", "포지션 미정 · 출처 확인 필요", "상태 확인 필요"]) assert.ok(html.includes(label), label);
  assert.equal((html.match(/<b>참가<\/b>/gu) ?? []).length, 2);
  assert.doesNotMatch(html, /TOP|MID|ARAM|USER_APPLICATION|ADMIN_IMPORT|ADMIN_MANUAL|ACTIVE|CANCELLED|FUTURE_/u);
  assert.match(renderToStaticMarkup(tree), /<strong>2\/10<\/strong>/u);
  assert.equal(find(tree, (node) => node.type === subject.Actions).props.event.participants, participants);
});
