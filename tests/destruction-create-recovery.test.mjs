import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const source = new URL("../src/app/(admin)/admin/progress/destruction/new/destruction-create-form.tsx", import.meta.url);
const domainCache = new Map();
function loadDomain(filename) {
  if (domainCache.has(filename)) return domainCache.get(filename).exports;
  const compiledModule = { exports: {} }; domainCache.set(filename, compiledModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports: compiledModule.exports,
    require(specifier) {
      const resolved = path.resolve(path.dirname(filename), specifier);
      return loadDomain(existsSync(`${resolved}.ts`) ? `${resolved}.ts` : path.join(resolved, "index.ts"));
    },
  });
  return compiledModule.exports;
}
const configuration = loadDomain(fileURLToPath(new URL("../src/modules/competitions/destruction/configuration.ts", import.meta.url)));
const display = loadDomain(fileURLToPath(new URL("../src/modules/competitions/core/display-projection.ts", import.meta.url)));
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
    "@/modules/competitions/core/display-projection": display,
    "@/modules/competitions/destruction/configuration": configuration,
    "@/components/competitions/destruction/workspace.module.css": { __esModule: true, default: {} },
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
  return { requests, navigation, render() { cursor = 0; return compiledModule.exports.DestructionCreateForm(); } };
}
const fields = { title: "합성 멸망전", teamCount: "4", gameMode: "CLASSIC", preliminaryFormat: "FULL_ROUND_ROBIN_BO3", preliminaryRoundCount: "1", TOP: "8", JGL: "8", MID: "8", ADC: "8", SUP: "8" };
const submit = (subject, values = fields) => find(subject.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: values });
const ok = { ok: true, status: 201, json: async () => ({}) };
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const hit = find(child, predicate); if (hit) return hit; }
  return null;
}
const key = (request) => request.headers["Idempotency-Key"];

for (const status of [401, 403, 408, 429]) {
  test(`uncertain destruction retry followed by ${status} retains identity and inputs`, async () => {
    const subject = harness((attempt) => { if (attempt === 1) throw new Error("response lost"); return attempt === 2 ? { ok: false, status, json: async () => ({ detail: "인증 또는 요청 제한" }) } : ok; });
    await submit(subject); await submit(subject);
    assert.equal(find(subject.render(), (node) => node.type === "fieldset")?.props.disabled, true);
    if ([401, 403].includes(status)) assert.equal(find(subject.render(), (node) => node.type === "a" && node.props.href === "/admin/login")?.props.target, "_blank");
    await submit(subject, { ...fields, title: "미확정 입력 변경 시도" });
    assert.equal(new Set(subject.requests.map(key)).size, 1);
    assert.equal(new Set(subject.requests.map((request) => request.body)).size, 1);
  });
}
test("confirmed destruction navigation stays locked", async () => {
  const subject = harness(() => ok);
  await submit(subject); await submit(subject);
  assert.equal(subject.requests.length, 1);
  assert.equal(find(subject.render(), (node) => node.type === "form").props["aria-busy"], true);
});

test("destruction concurrent submits send one request before React renders", async () => {
  let resolve;
  const subject = harness(() => new Promise((done) => { resolve = done; }));
  const first = submit(subject), second = submit(subject);
  assert.equal(subject.requests.length, 1);
  resolve(ok); await Promise.all([first, second]);
});

test("destruction server errors and truncated JSON preserve the creation request", async () => {
  const subject = harness((attempt) => attempt === 1 ? { ok: false, status: 503 } : attempt === 2 ? { ok: true, status: 201, json: async () => { throw new Error("truncated response"); } } : ok);
  await submit(subject); await submit(subject); await submit(subject);
  assert.equal(new Set(subject.requests.map(key)).size, 1);
  assert.equal(new Set(subject.requests.map((request) => request.body)).size, 1);
  assert.equal(subject.navigation.length, 1);
});

test("a definite destruction input rejection allows correction with a new request", async () => {
  const subject = harness((attempt) => attempt === 1 ? { ok: false, status: 400, json: async () => ({ detail: "입력 확인" }) } : ok);
  await submit(subject);
  assert.equal(find(subject.render(), (node) => node.type === "fieldset").props.disabled, false);
  await submit(subject, { ...fields, title: "수정된 합성 멸망전" });
  assert.notEqual(key(subject.requests[0]), key(subject.requests[1]));
  assert.equal(JSON.parse(subject.requests[1].body).title, "수정된 합성 멸망전");
});

test("all eight supported preliminary formats keep distinct actual domain labels", () => {
  const subject = harness(() => ok);
  const select = find(subject.render(), (node) => node.type === "select" && node.props.name === "preliminaryFormat");
  const options = React.Children.toArray(select.props.children);
  assert.equal(options.length, 8);
  assert.equal(new Set(options.map((option) => option.props.children)).size, 8);
  assert.deepEqual(options.map((option) => option.props.value), Array.from(configuration.DESTRUCTION_PRELIMINARY_FORMATS));
  for (const option of options) {
    const count = option.props.value.endsWith("BO1") ? 1 : 3;
    assert.match(option.props.children, count === 1 ? /단판|1판/ : /3판|2선승/);
  }
});

for (const gameMode of ["CLASSIC", "ARAM", "ARAM_MAYHEM"]) {
  test(`${gameMode} creation retains valid recruitment and preliminary-format payloads`, async () => {
    for (const preliminaryFormat of configuration.DESTRUCTION_PRELIMINARY_FORMATS) {
      const subject = harness(() => ok);
      find(subject.render(), (node) => node.type === "select" && node.props.name === "gameMode").props.onChange({ target: { value: gameMode } });
      find(subject.render(), (node) => node.type === "select" && node.props.name === "preliminaryFormat").props.onChange({ target: { value: preliminaryFormat } });
      const roundCount = find(subject.render(), (node) => node.type === "input" && node.props.name === "preliminaryRoundCount");
      assert.equal(roundCount.props.type, /^(SWISS|RANDOM)_/.test(preliminaryFormat) ? "number" : "hidden");
      assert.equal(Boolean(find(subject.render(), (node) => node.type === "input" && node.props.name === "TOP")), gameMode === "CLASSIC");
      await submit(subject, { ...fields, gameMode, preliminaryFormat, recruitmentLimit: "40", preliminaryRoundCount: /^(SWISS|RANDOM)_/.test(preliminaryFormat) ? "3" : "1" });
      const payload = JSON.parse(subject.requests[0].body);
      const validated = configuration.validateDestructionConfiguration(payload.configuration);
      assert.equal(validated.gameMode, gameMode);
      assert.equal(validated.preliminaryFormat, preliminaryFormat);
      assert.equal(subject.requests[0].headers["X-Destruction-Revision"], '"0"');
      assert.equal(subject.navigation[0], `/admin/progress/destruction/${payload.tournamentId}`);
    }
  });
}
