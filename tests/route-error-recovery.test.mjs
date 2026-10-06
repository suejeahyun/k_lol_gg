import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { ErrorBoundaryHandler } = require("next/dist/client/components/error-boundary.js");
const files = [
  "app/(public)/(applications)/applications/error.tsx",
  "app/(admin)/admin/players/error.tsx",
  "app/(admin)/admin/users/error.tsx",
  "app/(admin)/admin/users/[userAccountId]/error.tsx",
];
function load(file, reload) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, { exports: result.exports, window: { location: { reload } }, require: (specifier) => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "next/link") return { default: "a" };
    if (specifier.endsWith(".module.css")) return { default: {} };
    if (specifier === "@/components/ui/button") return { Button: "button" };
    if (specifier === "@/components/theme/theme-icons") return new Proxy({}, { get: () => "svg" });
    throw new Error(`Unexpected dependency: ${specifier}`);
  } });
  return result.exports.default;
}
function button(node) {
  if (Array.isArray(node)) return node.map(button).find(Boolean);
  if (!node || typeof node !== "object") return null;
  if (node.type === "button") return node;
  return button(node.props?.children);
}
for (const file of files) {
  test(`${file}: 다시 시도 re-fetches the failed server segment`, () => {
    let refreshed = 0;
    let reloaded = 0;
    const boundary = new ErrorBoundaryHandler({ pathname: "/isolated-recovery" });
    boundary.context = { refresh: () => { refreshed += 1; } };
    boundary.state.error = new Error("synthetic temporary query failure");
    boundary.setState = (state) => { boundary.state = { ...boundary.state, ...state }; };
    const page = load(file, () => { reloaded += 1; })({ error: new Error("synthetic"), retry: boundary.retry, reset: boundary.reset });
    const control = button(page);
    assert.ok(control, "Retry control remains available without supplementary prose");
    control.props.onClick();
    assert.equal(refreshed + reloaded, 1, "Recovery must request fresh data, not only clear the previous error");
    if (refreshed) assert.equal(boundary.state.error, null);
  });
}
