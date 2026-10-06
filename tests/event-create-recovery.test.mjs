import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const source = new URL("../src/app/(admin)/admin/progress/event/new/event-create-form.tsx", import.meta.url);
function harness(send) {
  const slots = [], requests = [], navigation = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
  };
  const dependencies = {
    react: hooks, "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: (href) => navigation.push(href), refresh() {} }) },
    "@/modules/competitions/core/display-projection": { competitionEventFormatLabel: (format) => format === "POSITION" ? "포지션 드래프트" : "칼바람" },
    "../event-admin.module.css": { __esModule: true, default: {} },
  };
  const compiledModule = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: compiledModule.exports, crypto: webcrypto, AbortSignal,
    FormData: class { constructor(values) { this.values = values; } get(name) { return this.values[name]; } },
    require(specifier) { assert.ok(Object.hasOwn(dependencies, specifier), specifier); return dependencies[specifier]; },
    fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length); },
  });
  return { requests, navigation, render() { cursor = 0; return compiledModule.exports.EventCreateForm(); } };
}
const fields = { title: "합성 이벤트", description: "", format: "POSITION", recruitmentOpensAt: "2026-10-06T10:00", recruitmentClosesAt: "2026-10-07T10:00", bracketBestOf: "3" };
const submit = (subject, values = fields) => subject.render().props.onSubmit({ preventDefault() {}, currentTarget: values });
const ok = { ok: true, status: 201, json: async () => ({}) };
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const hit = find(child, predicate); if (hit) return hit; }
  return null;
}
const key = (request) => request.headers["Idempotency-Key"];

test("event creation retries the exact uncertain request and keeps editing locked until confirmation", async () => {
  const subject = harness((attempt) => { if (attempt === 1) throw new Error("lost response"); return ok; });
  await submit(subject);
  const pending = subject.render();
  await submit(subject, { ...fields, title: "stale DOM must not replace unresolved input" });
  assert.equal(subject.requests[0].body, subject.requests[1].body);
  assert.equal(key(subject.requests[0]), key(subject.requests[1]));
  assert.equal(find(pending, (node) => node.type === "fieldset")?.props.disabled, true);
  const id = JSON.parse(subject.requests[0].body).eventId;
  assert.deepEqual(subject.navigation, [`/admin/progress/event/${id}`]);
  await submit(subject);
  assert.equal(subject.requests.length, 2, "confirmed navigation stays locked");
});

test("two submissions before render issue only one event request", async () => {
  let resolveRequest;
  const subject = harness(() => new Promise((resolve) => { resolveRequest = resolve; }));
  const first = submit(subject);
  const second = submit(subject);
  assert.equal(subject.requests.length, 1);
  resolveRequest(ok);
  await Promise.all([first, second]);
});

test("server errors and unreadable successful responses retain the original event identity", async () => {
  const subject = harness((attempt) => attempt === 1 ? { ok: false, status: 503 } : attempt === 2 ? { ok: true, status: 201, json: async () => { throw new Error("truncated JSON"); } } : ok);
  await submit(subject); await submit(subject); await submit(subject);
  assert.equal(subject.requests.length, 3);
  assert.equal(new Set(subject.requests.map(key)).size, 1);
  assert.equal(new Set(subject.requests.map((r) => r.body)).size, 1);
  assert.equal(subject.navigation.length, 1);
});

test("a definite rejection unlocks correction and gives the corrected request a new identity", async () => {
  const subject = harness((attempt) => attempt === 1 ? { ok: false, status: 400, json: async () => ({ detail: "입력을 확인해 주세요." }) } : ok);
  await submit(subject);
  assert.equal(Boolean(find(subject.render(), (node) => node.type === "fieldset")?.props.disabled), false);
  await submit(subject, { ...fields, title: "수정한 이벤트" });
  assert.notEqual(key(subject.requests[0]), key(subject.requests[1]));
  assert.notEqual(JSON.parse(subject.requests[0].body).eventId, JSON.parse(subject.requests[1].body).eventId);
  assert.equal(JSON.parse(subject.requests[1].body).settings.title, "수정한 이벤트");
});

for (const status of [401, 403, 429]) {
  test(`an uncertain creation keeps its identity after retry receives ${status}`, async () => {
    const subject = harness((attempt) => {
      if (attempt === 1) throw new Error("created, response lost");
      if (attempt === 2) return { ok: false, status, json: async () => ({ detail: "인증 또는 요청 제한을 확인해 주세요." }) };
      return ok;
    });
    await submit(subject);
    await submit(subject);
    assert.equal(find(subject.render(), (node) => node.type === "fieldset")?.props.disabled, true, "retry rejection does not disprove the original creation");
    await submit(subject);
    assert.equal(new Set(subject.requests.map(key)).size, 1);
    assert.equal(new Set(subject.requests.map((request) => request.body)).size, 1);
    assert.equal(subject.navigation.length, 1);
  });
}
