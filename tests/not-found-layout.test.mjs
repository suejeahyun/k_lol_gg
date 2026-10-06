import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function load(file, dependencies) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, { exports: result.exports, process: { env: { NODE_ENV: "test" } }, require: (specifier) => {
    if (specifier === "react") return React;
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected not-found dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  return result.exports;
}

// Resolve the real server layouts and shells before the static renderer, which
// cannot await async Server Components. Client navigation widgets are isolated.
async function resolveTree(node) {
  if (Array.isArray(node)) return Promise.all(node.map(async (child, index) => {
    const resolved = await resolveTree(child);
    return React.isValidElement(resolved) && resolved.key === null ? React.cloneElement(resolved, { key: String(index) }) : resolved;
  }));
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === "function") return resolveTree(await node.type(node.props));
  return React.cloneElement(node, { children: await resolveTree(node.props.children) });
}

const Link = ({ children, ...props }) => React.createElement("a", props, children);
const icons = new Proxy({}, { get: () => () => React.createElement("svg", { "aria-hidden": true }) });
const status = load("components/status-panel.tsx", { "@/components/theme/theme-icons": icons });
const content = load("components/not-found-content.tsx", { "next/link": Link, "@/components/status-panel": status });
const common = { "next/link": Link, "@/components/not-found-content": content };
const publicShell = load("components/site-shell.tsx", {
  "next/link": Link,
  "@/components/theme/theme-icons": icons,
  "@/modules/auth/infrastructure/runtime-session": { getCurrentSession: async () => null },
  "@/components/navigation/user-site-navigation": {
    HeaderUserControls: () => null, MobileUserNavigation: () => null,
    NavigationFallback: () => null, PrimaryUserNavigation: () => null,
  },
});
const publicLayout = load("app/(public)/layout.tsx", {
  "@/components/site-shell": publicShell,
  "@/components/navigation/list-return": { ListNavigationMemory: () => null },
  "@/components/navigation/workflow-navigation": { WorkflowNavigation: () => null },
  "@/components/usage/usage-tracker": { UsageTracker: () => null },
  "@/modules/usage/domain/usage": { usageEnabled: () => false },
});
const rootNotFound = load("app/not-found.tsx", { ...common, "@/components/site-shell": publicShell });
const publicNotFound = load("app/(public)/not-found.tsx", common);
const adminNotFound = load("app/(admin)/admin/not-found.tsx", common);
const adminShell = load("components/admin/admin-shell.tsx", {
  "next/link": Link,
  "@/components/theme/theme-icons": icons,
  "@/modules/accounts/domain/account-display-labels": { accountRoleLabel: () => "관리자" },
  "./admin-navigation": { AdminBreadcrumb: () => null, AdminOperationsNavigation: () => null, AdminWorkspaceNavigation: () => null, MobileAdminNavigation: () => null },
  "./admin-logout-button": { AdminLogoutButton: () => null },
  "./admin-shell.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
});

function assertPublicRecovery(html) {
  for (const pattern of [/data-ui-scope="public"/gu, /class="site-header"/gu, /class="site-footer"/gu, /<main(?:\s|>)/gu, /id="main-content"/gu, /class="skip-link"/gu, /<h1(?:\s|>)/gu]) {
    assert.equal((html.match(pattern) ?? []).length, 1, `single landmark: ${pattern}`);
  }
  assert.match(html, /찾으시는 페이지가 없어요/u);
  assert.match(html, /class="status-panel__link" href="\/"/u);
  assert.match(html, /href="\/players"/u);
}

test("unknown root addresses keep one complete public shell and recovery links", async () => {
  assertPublicRecovery(renderToStaticMarkup(await resolveTree(rootNotFound.default())));
});

test("public resource and invalid-query recovery uses the existing layout without nesting another shell", async () => {
  const tree = publicLayout.default({ children: publicNotFound.default() });
  assertPublicRecovery(renderToStaticMarkup(await resolveTree(tree)));
});

test("application error recovery keeps the public main landmark singular", async () => {
  const applicationError = load("app/(public)/(applications)/applications/error.tsx", {
    "@/components/theme/theme-icons": icons,
    "./applications.module.css": { __esModule: true, default: { page: "page", stateCard: "state", error: "error" } },
  });
  const tree = publicLayout.default({ children: applicationError.default({ retry: () => undefined }) });
  const html = renderToStaticMarkup(await resolveTree(tree));
  assert.equal((html.match(/<main(?:\s|>)/gu) ?? []).length, 1);
  assert.match(html, /role="alert"/u);
  assert.match(html, /<button[^>]*>다시 시도<\/button>/u);
});

test("admin not-found content stays behind its layout authorization and inside one admin shell", async () => {
  const checks = [];
  const adminLayout = load("app/(admin)/admin/layout.tsx", {
    "next/headers": { headers: async () => new Headers({ "x-test-path": "/admin/matches/missing" }) },
    "@/components/admin/admin-shell": adminShell,
    "@/modules/auth/application/admin-request-path": { ADMIN_REQUEST_PATH_HEADER: "x-test-path" },
    "@/modules/auth/application/normalize-internal-next": { normalizeInternalNext: (value) => value },
    "@/modules/auth/infrastructure/server-authorization": { requirePageRole: async (role, path) => { checks.push({ role, path }); return { role: "ADMIN" }; } },
  });
  const html = renderToStaticMarkup(await resolveTree(await adminLayout.default({ children: adminNotFound.default() })));
  assert.deepEqual(checks, [{ role: "ADMIN", path: "/admin/matches/missing" }]);
  assert.equal((html.match(/data-ui-scope="admin"/gu) ?? []).length, 1);
  assert.doesNotMatch(html, /data-ui-scope="public"|class="site-footer"/u);
  assert.equal((html.match(/<main(?:\s|>)/gu) ?? []).length, 1);
  assert.equal((html.match(/<h1(?:\s|>)/gu) ?? []).length, 1);
  assert.match(html, /관리 홈으로 돌아가기/u);
  assert.match(html, /href="\/admin\/search"/u);
});
