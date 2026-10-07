import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const taskId = "89d66c2e-5084-4e3f-a49b-0a09845cffcb", assetId = "b94e3e37-e946-4a73-b06c-f92cbb5c9953";
const task = { id: taskId, publicCode: "WR-SYNTHETIC", category: "GENERAL", revision: 0, status: "REQUIRED", requiredGameCount: 10, submittedEvidenceCount: 0, remainingEvidenceCount: 10, dueAt: "2026-11-01T00:00:00Z", reviewNote: null, evidence: [] };
const ready = { ...task, evidence: [{ assetId, status: "READY", submittedAt: null }] };
const file = (name = "synthetic.png", fail = false) => ({ name, type: "image/png", size: 12, arrayBuffer: async () => { if (fail) throw new Error("synthetic file read failure"); return new Uint8Array(12).buffer; } });
const success = (revision = 1) => ({ ok: true, status: 200, json: async () => ({ taskId, revision, submittedEvidenceCount: revision, requiredGameCount: 10, status: "AWAITING_UPLOAD" }) });
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
function load(source, dependencies, globals = {}) {
  const compiledModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(source, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: compiledModule.exports, crypto: crypto.webcrypto, AbortSignal, ...globals, require(specifier) { assert.ok(Object.hasOwn(dependencies, specifier), specifier); return dependencies[specifier]; } });
  return compiledModule.exports;
}
function harness(send, initial = task) {
  const slots = [], transitions = [], requests = [], errors = [];
  let cursor = 0, tasks = [initial], refreshes = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useTransition() { const index = cursor++; transitions.push(index); slots[index] ??= false; return [slots[index], (callback) => { slots[index] = true; callback(); }]; },
  };
  const component = load("../src/components/discipline/owner-discipline-tasks.tsx", {
    react: hooks, "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) },
    "@/modules/assets/domain/private-asset": load("../src/modules/assets/domain/private-asset.ts", { "node:crypto": crypto }),
    "@/modules/seasons/application/client-mutation-key-store": load("../src/modules/seasons/application/client-mutation-key-store.ts", { "../domain/season": load("../src/modules/seasons/domain/season.ts", {}) }),
    "./discipline.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) },
  }, { fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length, url, options); } });
  const subject = {
    requests, errors,
    render() { cursor = 0; return component.OwnerDisciplineTasks({ tasks }); },
    async upload(files = [file()]) { const input = { files, value: "chosen" }; await Promise.resolve(find(subject.render(), (node) => node.type === "input" && node.props.type === "file").props.onChange({ target: input, currentTarget: input })).catch((error) => errors.push(error)); },
    submitReady() { return find(subject.render(), (node) => node.type === "button").props.onClick(); },
    refresh(nextTask = tasks[0]) { tasks = [nextTask]; for (const index of transitions) slots[index] = false; },
    get refreshes() { return refreshes; },
  };
  return subject;
}

test("file-read errors release the task and expose a recoverable error", async () => {
  const subject = harness(() => success());
  await subject.upload([file("unreadable.png", true)]); subject.refresh();
  assert.equal(subject.errors.length, 0);
  assert.equal(subject.requests.length, 0);
  assert.equal(find(subject.render(), (node) => node.type === "input")?.props.disabled, false);
  assert.ok(find(subject.render(), (node) => node.props.role === "alert"));
});

test("a lost attachment confirmation recovers through the existing READY asset without another raw upload", async () => {
  const subject = harness((attempt) => attempt === 1 ? { ok: true, status: 200, json: async () => { throw new Error("truncated attachment confirmation"); } } : success());
  await subject.upload();
  assert.equal(subject.errors.length, 0); assert.equal(subject.refreshes, 1);
  subject.refresh(ready);
  await subject.submitReady(); subject.refresh();
  assert.equal(subject.requests.length, 2);
  assert.equal(subject.requests.filter((request) => request.body === "{}").length, 1);
  assert.equal(subject.requests[1].url, `/api/me/discipline/tasks/${taskId}/evidence/${assetId}/submit`);
});

test("READY submission keeps the same request identity after network loss and authentication rejection", async () => {
  const subject = harness((attempt) => { if (attempt === 1) throw new Error("lost response"); return attempt === 2 ? { ok: false, status: 401, json: async () => ({}) } : success(); }, ready);
  await subject.submitReady(); subject.refresh();
  await subject.submitReady(); subject.refresh();
  await subject.submitReady(); subject.refresh();
  assert.equal(new Set(subject.requests.map((request) => request.headers["Idempotency-Key"])).size, 1);
  assert.equal(new Set(subject.requests.map((request) => request.headers["If-Match"])).size, 1);
  assert.equal(new Set(subject.requests.map((request) => request.body)).size, 1);
});

test("a READY submission with unreadable success reports uncertainty and releases its busy state", async () => {
  const subject = harness(() => ({ ok: true, status: 200, json: async () => { throw new Error("truncated success"); } }), ready);
  await subject.submitReady(); subject.refresh();
  assert.ok(find(subject.render(), (node) => node.props.role === "alert"));
  assert.equal(find(subject.render(), (node) => node.type === "button").props.disabled, false);
});

test("simultaneous READY clicks issue one submission", async () => {
  let resolve;
  const subject = harness(() => new Promise((done) => { resolve = done; }), ready);
  const first = subject.submitReady(), second = subject.submitReady();
  assert.equal(subject.requests.length, 1);
  resolve(success()); await Promise.all([first, second]);
});

test("a partial batch advances revision and stops after an unconfirmed response", async () => {
  const subject = harness((attempt) => attempt === 1 ? success(1) : { ok: true, status: 200, json: async () => ({}) });
  await subject.upload([file("first.png"), file("second.png"), file("third.png")]); subject.refresh();
  assert.equal(subject.requests.length, 2);
  assert.equal(subject.requests[0].headers["If-Match"], '"0"');
  assert.equal(subject.requests[1].headers["If-Match"], '"1"');
  assert.ok(find(subject.render(), (node) => node.props.role === "alert"));
  assert.equal(find(subject.render(), (node) => node.type === "input").props.disabled, false);
});
