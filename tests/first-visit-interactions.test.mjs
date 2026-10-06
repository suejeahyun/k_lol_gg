import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  const exports = {};
  vm.runInNewContext(compiled, { exports, URLSearchParams, AbortController, ...globals, require: (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected interaction dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const icons = new Proxy({}, { get: () => () => null });
const Link = ({ href, children, ...props }) => React.createElement("a", { ...props, href }, children);

test("the application menu marks exactly the selected application type, including query navigation", () => {
  let query = new URLSearchParams();
  const { PrimaryUserNavigation } = load("components/navigation/user-site-navigation.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "next/navigation": { usePathname: () => "/applications", useSearchParams: () => query },
    "@/components/theme/theme-icons": icons,
    "@/modules/navigation/domain/user-navigation": load("modules/navigation/domain/user-navigation.ts", {}),
    "@/modules/navigation/domain/task-navigation": load("modules/navigation/domain/task-navigation.ts", {}),
    "@/modules/navigation/domain/global-command-palette": {},
    "@/modules/auth/application/normalize-internal-next": {},
    "@/components/usage/usage-actions": {},
  });
  for (const [search, expected] of [
    ["", "/applications"],
    ["type=season&recruitNo=2", "/applications"],
    ["type=event", "/applications?type=event"],
    ["type=destruction&source=kakao", "/applications?type=destruction"],
    ["type=event&type=season", null],
    ["type=unknown", null],
  ]) {
    query = new URLSearchParams(search);
    const html = renderToStaticMarkup(React.createElement(PrimaryUserNavigation));
    const current = [...html.matchAll(/<a\b([^>]*aria-current="page"[^>]*)>/gu)].map((match) => match[1].match(/href="([^"]+)"/u)?.[1]);
    assert.deepEqual(current, expected ? [expected] : [], search || "default season");
  }
});

function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!React.isValidElement(tree)) return "";
  return React.Children.toArray(tree.props.children).map(text).join("");
}

// Run the actual component's event handlers and effect cleanup against deferred
// fetches, without a browser, production account or a copied search algorithm.
function builderHarness() {
  const slots = [], effects = [], timers = new Map(), requests = [];
  let cursor = 0, dirty = true, tree, nextTimer = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(slots, index)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => {
        const next = typeof value === "function" ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useMemo(calculate) { cursor++; return calculate(); },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, part) => !Object.is(previous.dependencies[part], value))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  const { TeamBalanceBuilder } = load("app/(public)/(tools)/tools/team-balance/team-balance-builder.tsx", {
    react: hooks,
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/components/theme/theme-icons": icons,
    "@/components/usage/usage-actions": { recordUsageAction() {} },
    "@/modules/team-tools": { TEAM_BALANCE_POSITIONS: ["TOP", "JGL", "MID", "ADC", "SUP"], TEAM_BALANCE_PREFERENCES: ["MAIN", "SUB", "AUTO"] },
    "@/modules/seasons/application/client-mutation-key-store": { ClientMutationKeyStore: class {} },
    "../team-tools.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  }, {
    window: { setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout(id) { timers.delete(id); } },
    fetch: (url, options) => new Promise((resolve, reject) => {
      const request = { url, signal: options.signal, resolve: (body) => resolve({ ok: true, json: async () => body }) };
      requests.push(request);
      options.signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }),
  });
  function render() {
    let attempts = 0;
    while (dirty) {
      assert.ok(attempts++ < 20, "the component must settle");
      dirty = false; cursor = 0; tree = TeamBalanceBuilder();
      while (effects.length) effects.shift()();
    }
    return tree;
  }
  render();
  return {
    requests,
    change(value) { find(render(), (node) => node.props.id === "team-balance-player-search").props.onChange({ target: { value } }); render(); },
    reset() { find(render(), (node) => node.type === "button" && text(node).includes("입력 초기화")).props.onClick(); render(); },
    runTimers() { for (const [id, callback] of timers) { timers.delete(id); void callback(); } render(); },
    loading() { return Boolean(find(render(), (node) => node.props.role === "status" && text(node) === "검색 중…")); },
    async settle() { for (let index = 0; index < 5; index++) await Promise.resolve(); render(); },
  };
}

test("clearing or resetting a slow player search cancels the request and returns to idle", async () => {
  for (const cancel of ["clear", "reset"]) {
    const client = builderHarness();
    client.change("합성 참가자");
    client.runTimers();
    assert.equal(client.loading(), true);
    const request = client.requests.find((entry) => entry.url.includes("source=players"));
    assert.ok(request);
    if (cancel === "clear") client.change(""); else client.reset();
    await client.settle();
    assert.equal(request.signal.aborted, true, cancel);
    assert.equal(client.loading(), false, `${cancel}: an empty field has no request in progress`);
  }
});

test("a superseded request cannot clear the loading state of the newer search", async () => {
  const client = builderHarness();
  client.change("첫 번째"); client.runTimers();
  const first = client.requests.find((entry) => entry.url.includes("source=players"));
  client.change("두 번째"); client.runTimers();
  await client.settle();
  assert.equal(first.signal.aborted, true);
  assert.equal(client.loading(), true);
  client.requests.at(-1).resolve({ players: [] });
  await client.settle();
  assert.equal(client.loading(), false);
});
