import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

// Exercise the real installation effect and click handler using synthetic native
// browser offers; this does not install an app or invoke a production account.
function harness() {
  const slots = [], effects = [], frames = [], listeners = new Map();
  let cursor = 0, dirty = true, tree;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { const next = typeof value === "function" ? value(slots[index]) : value; if (next !== slots[index]) { slots[index] = next; dirty = true; } }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(callback) { const index = cursor++; if (!(index in slots)) { slots[index] = true; effects.push(callback); } },
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/app/(public)/(guides)/install/install-actions.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const dependencies = {
    react: hooks,
    "react/jsx-runtime": jsxRuntime,
    "@/components/theme/theme-icons": { Download: () => null },
    "../guide.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) },
  };
  vm.runInNewContext(code, { exports, require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, window: {
    matchMedia: () => ({ matches: false }), navigator: { userAgent: "Synthetic Chromium" },
    requestAnimationFrame: (callback) => frames.push(callback), cancelAnimationFrame() {},
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name),
  } });
  function render() {
    let attempts = 0;
    while (dirty) { assert.ok(attempts++ < 20); dirty = false; cursor = 0; tree = exports.InstallActions(); while (effects.length) effects.shift()(); }
    return tree;
  }
  function find(node, predicate) {
    if (!React.isValidElement(node)) return null;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props.children)) { const result = find(child, predicate); if (result) return result; }
    return null;
  }
  render();
  return {
    button: () => find(render(), (node) => node.type === "button"),
    message: () => find(render(), (node) => node.type === "p"),
    frames() { while (frames.length) frames.shift()(); render(); },
    offer(prompt, userChoice) { listeners.get("beforeinstallprompt")({ preventDefault() {}, prompt, userChoice }); render(); },
    installed() { listeners.get("appinstalled")(); render(); },
  };
}

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test("a rejected native install prompt reports recovery and accepts a new browser offer", async () => {
  const client = harness(); client.frames();
  client.offer(async () => { throw new Error("Synthetic browser refusal"); }, Promise.resolve({ outcome: "dismissed" }));
  await assert.doesNotReject(client.button().props.onClick());
  assert.equal(client.message().props.role, "alert");
  assert.match(client.message().props.children, /브라우저 메뉴/);
  assert.equal(client.button().props.disabled, true, "a consumed native offer cannot be invoked again");
  client.offer(async () => {}, Promise.resolve({ outcome: "dismissed" }));
  assert.equal(client.button().props.disabled, false);
  await client.button().props.onClick();
  assert.match(client.message().props.children, /취소/);
});

test("installation prevents duplicate native prompts and waits for actual appinstalled", async () => {
  const client = harness(); client.frames();
  const choice = deferred(); let prompts = 0;
  client.offer(async () => { prompts++; }, choice.promise);
  const click = client.button().props.onClick;
  const first = click(); const repeated = click();
  assert.equal(client.button().props.disabled, true);
  assert.equal(prompts, 1);
  choice.resolve({ outcome: "accepted" }); await first; await repeated;
  assert.match(client.message().props.children, /설치 요청/);
  assert.doesNotMatch(client.message().props.children, /설치되어/);
  client.installed(); assert.match(client.message().props.children, /설치되어/);
});

test("a ready browser offer is not overwritten by initial environment detection", () => {
  const client = harness();
  client.offer(async () => {}, Promise.resolve({ outcome: "dismissed" }));
  client.frames();
  assert.equal(client.button().props.disabled, false);
});

test("a late native choice cannot overwrite confirmed app installation", async () => {
  const client = harness(); client.frames();
  const choice = deferred();
  client.offer(async () => {}, choice.promise);
  const pending = client.button().props.onClick();
  client.installed(); choice.resolve({ outcome: "dismissed" }); await pending;
  assert.match(client.message().props.children, /설치되어/);
});
