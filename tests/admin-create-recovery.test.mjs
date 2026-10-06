import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeCrypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
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
const key = (request) => request.headers["Idempotency-Key"];

for (const kind of ["discipline", "highlight", "gallery"]) {
  test(`${kind}: lost creation response retries the exact payload/key and locks confirmed navigation`, async () => {
    const subject = harness(kind, (attempt) => { if (attempt === 1) throw new Error("response lost"); return success(kind); });
    await subject.submit();
    assert.equal(find(subject.render(), (node) => node.type === "fieldset")?.props.disabled, true);
    if (kind !== "discipline") subject.setTitle("미확정 요청을 덮어쓰면 안 됨");
    await subject.submit({ ...fields, reason: "새 사유로 대체하면 안 됨" });
    assert.equal(subject.requests[0].body, subject.requests[1].body);
    assert.equal(key(subject.requests[0]), key(subject.requests[1]));
    assert.equal(subject.navigation.length, 1);
    await subject.submit();
    assert.equal(subject.requests.length, 2);
  });

  test(`${kind}: simultaneous submits issue one creation request`, async () => {
    let resolve;
    const subject = harness(kind, () => new Promise((done) => { resolve = done; }));
    const first = subject.trigger(); const second = subject.trigger();
    assert.equal(subject.requests.length, 1);
    resolve(success(kind)); await Promise.all([first, second]); await tick();
  });

  test(`${kind}: 5xx and unreadable success preserve identity and recover without a stuck form`, async () => {
    const subject = harness(kind, (attempt) => attempt === 1 ? { ok: false, status: 503, json: async () => ({}) } : attempt === 2 ? { ok: true, status: 201, json: async () => { throw new Error("truncated JSON"); } } : success(kind));
    await subject.submit(); await subject.submit(); await subject.submit();
    assert.equal(subject.handlerErrors.length, 0);
    assert.equal(new Set(subject.requests.map(key)).size, 1);
    assert.equal(new Set(subject.requests.map((request) => request.body)).size, 1);
    assert.equal(subject.navigation.length, 1);
  });

  test(`${kind}: a definite first rejection allows correction with a new identity`, async () => {
    const subject = harness(kind, (attempt) => attempt === 1 ? { ok: false, status: 400, json: async () => ({ detail: "입력 확인" }) } : success(kind));
    await subject.submit();
    assert.equal(Boolean(find(subject.render(), (node) => node.type === "fieldset")?.props.disabled), false);
    if (kind !== "discipline") subject.setTitle("수정한 제목");
    await subject.submit({ ...fields, reason: "수정한 사유" });
    assert.notEqual(key(subject.requests[0]), key(subject.requests[1]));
    assert.notEqual(subject.requests[0].body, subject.requests[1].body);
    assert.equal(subject.navigation.length, 1);
  });

  for (const status of [401, 403, 429]) {
    test(`${kind}: ${status} after uncertainty does not abandon the original creation`, async () => {
      const subject = harness(kind, (attempt) => { if (attempt === 1) throw new Error("response lost"); return attempt === 2 ? { ok: false, status, json: async () => ({ detail: "인증 또는 요청 한도 확인" }) } : success(kind); });
      await subject.submit(); await subject.submit();
      assert.equal(find(subject.render(), (node) => node.type === "fieldset")?.props.disabled, true);
      if (status !== 429) {
        const login = find(subject.render(), (node) => node.type === "a" && node.props.href === "/admin/login");
        assert.equal(login?.props.target, "_blank", "sign-in must preserve the unresolved form");
      }
      await subject.submit();
      assert.equal(new Set(subject.requests.map(key)).size, 1);
      assert.equal(new Set(subject.requests.map((request) => request.body)).size, 1);
      assert.equal(subject.navigation.length, 1);
    });
  }

  test(`${kind}: malformed success cannot unlock an unconfirmed creation`, async () => {
    const subject = harness(kind, (attempt) => attempt === 1 ? { ok: true, status: 201, json: async () => ({}) } : success(kind));
    await subject.submit();
    assert.equal(find(subject.render(), (node) => node.type === "fieldset")?.props.disabled, true);
    assert.equal(subject.navigation.length, 0);
    await subject.submit();
    assert.equal(key(subject.requests[0]), key(subject.requests[1]));
    assert.equal(subject.navigation.length, 1);
  });
}

const file = (name) => ({ name, type: "image/png", size: 12, lastModified: 0, arrayBuffer: async () => new Uint8Array(12).buffer });
for (const attachmentFails of [false, true]) {
  test(`gallery: retry preserves selected files and partial upload results, attachment failure=${attachmentFails}`, async () => {
    let creates = 0;
    const subject = harness("gallery", (_attempt, url, options) => {
      if (url === "/api/admin/images") {
        if (++creates === 1) throw new Error("response lost");
        return success("gallery");
      }
      if (url.endsWith("/assets")) {
        const name = decodeURIComponent(options.headers["X-Upload-File-Name"]);
        return name === "success.png"
          ? { ok: true, status: 201, json: async () => ({ asset: { assetId: "saved-asset", status: "READY" } }) }
          : { ok: false, status: 422, json: async () => ({ detail: "합성 이미지 검사 실패" }) };
      }
      assert.equal(options.method, "PATCH");
      return attachmentFails
        ? { ok: false, status: 409, json: async () => ({ detail: "합성 연결 충돌" }) }
        : { ok: true, status: 200, json: async () => ({ gallery: { id: recordId, revision: 1 } }) };
    });
    subject.selectFiles([file("success.png"), file("failure.png")]);
    await subject.submit();
    // A stale/programmatic change must not replace the already-sent request's files.
    subject.selectFiles([file("replacement.png")]);
    await subject.submit(); await subject.waitForNavigation();
    assert.equal(creates, 2);
    assert.equal(key(subject.requests[0]), key(subject.requests[1]));
    assert.deepEqual(JSON.parse(subject.requests[0].body).imageOrder, []);
    assert.equal(subject.requests[0].body, subject.requests[1].body);
    const uploads = subject.requests.filter((request) => request.url.endsWith("/assets"));
    assert.deepEqual(uploads.map((request) => decodeURIComponent(request.headers["X-Upload-File-Name"])), ["success.png", "failure.png"]);
    const linked = attachmentFails ? 0 : 1;
    assert.equal(subject.navigation[0], `/admin/images/${recordId}/edit?uploaded=1&linked=${linked}&failed=1`);
    const report = JSON.parse(subject.storage.get(`klol:gallery-upload-report:${recordId}`));
    assert.equal(report.uploaded, 1); assert.equal(report.linked, linked);
    assert.match(report.failedNames[0], /failure\.png/);
    if (attachmentFails) assert.match(report.attachmentError, /합성 연결 충돌/);
    await subject.submit(); assert.equal(creates, 2);
  });
}

for (const responseKind of ["truncated", "null", "empty", "invalid-revision"]) {
  test(`gallery: ${responseKind} attachment response cannot report a confirmed connection`, async () => {
    const subject = harness("gallery", (_attempt, url) => {
      if (url === "/api/admin/images") return success("gallery");
      if (url.endsWith("/assets")) return { ok: true, status: 201, json: async () => ({ asset: { assetId: "saved-asset", status: "READY" } }) };
      return { ok: true, status: 200, json: async () => {
        if (responseKind === "truncated") throw new Error("truncated attachment response");
        if (responseKind === "null") return null;
        return responseKind === "invalid-revision" ? { gallery: { id: recordId, revision: "unconfirmed" } } : {};
      } };
    });
    subject.selectFiles([file("success.png")]);
    await subject.submit(); await subject.waitForNavigation();
    const report = JSON.parse(subject.storage.get(`klol:gallery-upload-report:${recordId}`));
    assert.equal(report.uploaded, 1, "confirmed uploads remain recoverable in the saved draft");
    assert.equal(report.linked, 0, "unconfirmed attachment must not produce a success count");
    assert.match(report.attachmentError, /결과를 확인하지 못했/);
    assert.equal(subject.navigation[0], `/admin/images/${recordId}/edit?uploaded=1&linked=0&failed=0`);
    assert.equal(subject.requests.filter((request) => request.url === "/api/admin/images").length, 1);
    assert.equal(subject.requests.filter((request) => request.url.endsWith("/assets")).length, 1);
  });
}
