import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeCrypto from "node:crypto";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const root = process.cwd();
const { webcrypto } = nodeCrypto;
const recordId = "a3d590db-d3c7-4d09-8d3b-89360c9dc101";
const fields = { targetName: "합성 대상", targetNickname: "fixture", targetTagLine: "KR1", type: "CAUTION", category: "GENERAL", source: "합성 확인", reason: "격리된 회귀 검증", internalNote: "" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}

function harness(kind, send) {
  const slots = [], requests = [], navigation = [], handlerErrors = [], cache = new Map(), storage = new Map();
  let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect() {},
  };
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiledModule = { exports: {} }; cache.set(filename, compiledModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      exports: compiledModule.exports, crypto: webcrypto, AbortSignal, Error, Uint8Array, setTimeout, clearTimeout,
      sessionStorage: { setItem: (key, value) => storage.set(key, value) },
      FormData: class { constructor(values) { this.values = values; } get(name) { return this.values[name] ?? null; } },
      fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length, url, options); },
      require(specifier) {
        if (specifier === "node:crypto") return nodeCrypto;
        if (specifier === "react") return hooks;
        if (specifier === "react/jsx-runtime") return jsx;
        if (specifier === "next/navigation") return { useRouter: () => ({ push: (href) => navigation.push(href), refresh() {} }) };
        if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
        if (specifier.endsWith("/bounded-picker")) return { BoundedPicker: () => null };
        if (specifier.endsWith("/resilient-media-image")) return { ResilientMediaImage: () => null };
        const resolved = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        return load(`${resolved}.ts`);
      },
    });
    return compiledModule.exports;
  }
  const subjectModule = load(path.join(root, kind === "discipline" ? "src/components/discipline/admin-discipline-create-form.tsx" : "src/components/admin/media/admin-media-form.tsx"));
  const subject = {
    requests, navigation, handlerErrors, storage,
    render() { cursor = 0; return kind === "discipline" ? subjectModule.AdminDisciplineCreateForm() : subjectModule.AdminMediaForm({ kind, uploadAvailable: true }); },
    trigger(values = fields) { return subject.render().props.onSubmit({ preventDefault() {}, currentTarget: values }); },
    async submit(values = fields) { await Promise.resolve(subject.trigger(values)).catch((error) => handlerErrors.push(error)); await tick(); },
    setTitle(value) { find(subject.render(), (node) => node.type === "input" && node.props.maxLength === 120).props.onChange({ target: { value } }); },
    selectFiles(files) { find(subject.render(), (node) => node.type === "input" && node.props.type === "file").props.onChange({ currentTarget: { files, value: "" } }); },
    async waitForNavigation() {
      for (let attempt = 0; attempt < 100 && navigation.length === 0; attempt++) await new Promise((resolve) => setTimeout(resolve, 2));
      assert.equal(navigation.length, 1, "confirmed creation must reach its editor");
    },
  };
  if (kind !== "discipline") {
    subject.setTitle("합성 제목");
    find(subject.render(), (node) => node.type === "textarea" && node.props.maxLength === 4000).props.onChange({ target: { value: "합성 설명" } });
    if (kind === "highlight") find(subject.render(), (node) => node.type === "input" && node.props.type === "url").props.onChange({ target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
  }
  return subject;
}
const success = (kind) => ({ ok: true, status: 201, json: async () => ({ [kind === "discipline" ? "record" : kind]: { id: recordId, revision: 0 } }) });

const reviewFile = { name: "synthetic.png", type: "image/png", size: 12, lastModified: 0, arrayBuffer: async () => new Uint8Array(12).buffer };
test("a truncated attachment response must not claim the image was confirmed linked", async () => {
  const subject = harness("gallery", (_attempt, url) => {
    if (url === "/api/admin/images") return success("gallery");
    if (url.endsWith("/assets")) return { ok: true, status: 201, json: async () => ({ asset: { assetId: "synthetic-asset", status: "READY" } }) };
    return { ok: true, status: 200, json: async () => { throw new Error("synthetic truncated attachment JSON"); } };
  });
  subject.selectFiles([reviewFile]);
  await subject.submit(); await subject.waitForNavigation();
  const report = JSON.parse(subject.storage.get(`klol:gallery-upload-report:${recordId}`));
  assert.equal(report.uploaded, 1);
  assert.equal(report.linked, 0, "a missing attachment confirmation must not produce the success count");
});
