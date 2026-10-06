import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const form = { id: "17020df9-6d02-4d20-8bb6-c9a08b8c2d16", formType: "suggestions", revision: 3, status: "PENDING", adminNote: "기존 메모" };
const success = { ok: true, status: 200, json: async () => ({ id: form.id, revision: 4 }) };
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
const button = (tree, label) => find(tree, (node) => node.type === "button" && node.props.children === label);

function harness(send) {
  const slots = [], requests = [], navigation = [], transitions = [], modules = new Map();
  let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useTransition() { const [pending, setPending] = hooks.useState(false); return [pending, (operation) => { setPending(true); operation(); transitions.push(() => setPending(false)); }]; },
  };
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} }; modules.set(filename, loaded);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      exports: loaded.exports, crypto: webcrypto, Headers, Error,
      window: { prompt: () => "합성 삭제 사유" },
      fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length, options, load(path.join(root, "src/platform/http/concurrency.ts"))); },
      require(specifier) {
        if (specifier === "react") return hooks;
        if (specifier === "react/jsx-runtime") return jsx;
        if (specifier === "next/link") return () => null;
        if (specifier === "next/navigation") return { useRouter: () => ({ replace: (href) => navigation.push(href), refresh: () => navigation.push("refresh") }) };
        if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
        const resolved = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        return load(`${resolved}.ts`);
      },
    });
    return loaded.exports;
  }
  const loaded = load(path.join(root, "src/components/operation-forms/admin-operation-form-actions.tsx"));
  const subject = {
    requests, navigation, load,
    render(value = form) { cursor = 0; return loaded.AdminOperationFormActions({ form: value }); },
    async click(label = "상태와 메모 저장") { await button(subject.render(), label).props.onClick(); await tick(); },
    finishRefresh() { transitions.splice(0).forEach((finish) => finish()); },
    setNote(value) { find(subject.render(), (node) => node.type === "textarea").props.onChange({ target: { value } }); },
  };
  return subject;
}

test("actual review and delete handlers send the strong numeric ETag accepted by the server parser", async () => {
  for (const label of ["상태와 메모 저장", "삭제 처리"]) {
    const subject = harness((_attempt, request, concurrency) => {
      const parsed = concurrency.readIfMatchRevision(new Headers(request.headers));
      return parsed.ok ? success : { ok: false, status: 400, json: async () => ({ title: "If-Match 값이 올바르지 않습니다." }) };
    });
    await subject.click(label);
    assert.equal(subject.requests[0].headers["If-Match"], '"3"');
    assert.deepEqual(subject.navigation, [label === "삭제 처리" ? `/admin/operation-forms/${form.formType}` : "refresh"]);
  }
});

test("lost responses and unreadable successes preserve request identity and edited inputs for retry", async () => {
  const subject = harness((attempt) => {
    if (attempt === 1) throw new Error("synthetic lost response");
    if (attempt === 2) return { ok: false, status: 503, json: async () => ({ detail: "잠시 후 다시 시도" }) };
    if (attempt === 3) return { ...success, json: async () => { throw new Error("synthetic truncated JSON"); } };
    return success;
  });
  subject.setNote("합성 수정 메모");
  for (let attempt = 0; attempt < 4; attempt++) await subject.click();
  assert.equal(new Set(subject.requests.map((request) => request.headers["Idempotency-Key"])).size, 1);
  assert.equal(new Set(subject.requests.map((request) => request.body)).size, 1);
  assert.equal(find(subject.render(), (node) => node.type === "textarea").props.value, "합성 수정 메모");
  assert.deepEqual(subject.navigation, ["refresh"]);
});

test("changing an unsuccessful review payload uses a separate idempotency identity", async () => {
  const subject = harness(() => ({ ok: false, status: 400, json: async () => ({ detail: "입력을 확인하세요." }) }));
  await subject.click(); subject.setNote("다른 합성 메모"); await subject.click();
  assert.notEqual(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
  assert.notEqual(subject.requests[0].body, subject.requests[1].body);
});

test("review is guarded against same-tick clicks and stays locked through server refresh", async () => {
  let finish;
  const subject = harness(() => new Promise((resolve) => { finish = resolve; }));
  const first = subject.click(); const second = subject.click();
  assert.equal(subject.requests.length, 1);
  assert.equal(button(subject.render(), "상태와 메모 저장").props.disabled, true);
  finish(success); await Promise.all([first, second]);
  assert.equal(button(subject.render(), "상태와 메모 저장").props.disabled, true);
  await subject.click(); assert.equal(subject.requests.length, 1);
  subject.finishRefresh();
  assert.equal(button(subject.render(), "상태와 메모 저장").props.disabled, false);
});

test("a stale revision preserves local input until explicit reload and expired sessions link back to the same record", async () => {
  for (const status of [412, 401]) {
    const subject = harness(() => ({ ok: false, status, json: async () => ({ title: "오류", detail: "합성 복구 안내" }) }));
    subject.setNote("보존할 합성 메모"); await subject.click();
    assert.equal(find(subject.render(), (node) => node.type === "textarea").props.value, "보존할 합성 메모");
    assert.equal(button(subject.render(), "상태와 메모 저장").props.disabled, true);
    assert.deepEqual(subject.navigation, []);
    if (status === 412) {
      await subject.click("입력 버리고 최신 내용 불러오기");
      assert.deepEqual(subject.navigation, ["refresh"]);
      subject.finishRefresh();
      assert.equal(find(subject.render(), (node) => node.type === "textarea").props.value, form.adminNote);
      assert.equal(button(subject.render(), "상태와 메모 저장").props.disabled, false, "same-revision transition rejection must remain recoverable");
    } else {
      assert.equal(find(subject.render(), (node) => node.props.children === "관리자 로그인").props.href,
        `/admin/login?next=${encodeURIComponent(`/admin/operation-forms/${form.formType}/${form.id}`)}`);
    }
  }
});

test("successful deletion navigates to its filtered list and cannot repeat before navigation", async () => {
  const subject = harness(() => success);
  await subject.click("삭제 처리"); await subject.click("삭제 처리");
  assert.equal(subject.requests.length, 1);
  assert.equal(subject.requests[0].method, "DELETE");
  assert.deepEqual(subject.navigation, [`/admin/operation-forms/${form.formType}`]);
  assert.equal(button(subject.render(), "삭제 처리").props.disabled, true);
});

test("record detail keys review state to the record revision after an explicit server refresh", async () => {
  const Actions = () => null;
  let current = { ...form, payload: {}, submittedAt: "2026-10-06T00:00:00Z" };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(root, "src/app/(admin)/admin/operation-forms/[formType]/[id]/page.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: loaded.exports, require(specifier) {
    if (specifier === "react/jsx-runtime") return jsx;
    if (specifier === "next/link") return () => null;
    if (specifier === "next/navigation") return { notFound() { throw new Error("not found"); } };
    if (specifier.endsWith("/admin-operation-form-actions")) return { AdminOperationFormActions: Actions };
    if (specifier.endsWith("/admin-operation-form-list")) return { typeLabels: { suggestions: "문의·건의" }, operationFormStatusLabels: { PENDING: "대기", IN_REVIEW: "검토 중" } };
    if (specifier.endsWith("/server-authorization")) return { requirePageRole: async () => {} };
    if (specifier.endsWith("/domain")) return { isOperationFormType: () => true };
    if (specifier.endsWith("/runtime")) return { loadRuntimeOperationForms: async () => ({ state: "ready", data: current }) };
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: {} };
    throw new Error(`Unexpected detail dependency: ${specifier}`);
  } });
  const render = () => loaded.exports.default({ params: Promise.resolve({ id: form.id, formType: form.formType }) });
  const before = find(await render(), (node) => node.type === Actions);
  assert.equal(find(await render(), (node) => node.type === Actions).key, before.key);
  current = { ...current, revision: 4, status: "IN_REVIEW", adminNote: "다른 운영자의 메모" };
  const after = find(await render(), (node) => node.type === Actions);
  assert.notEqual(after.key, before.key);
  assert.equal(after.props.form.adminNote, "다른 운영자의 메모");
});
