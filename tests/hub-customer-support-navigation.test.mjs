import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

async function renderList(brand) {
  const calls = [];
  const exports = {};
  const source = readFileSync(new URL("../src/components/operation-forms/admin-operation-form-list.tsx", import.meta.url), "utf8");
  const counts = { suggestions: 61, reports: 0 };
  const dependencies = {
    "react/jsx-runtime": jsx, "next/link": { default: "a" }, "@/lib/service-brand": { SERVICE_BRAND: { id: brand } },
    "@/modules/auth/infrastructure/server-authorization": { requirePageRole: async (...args) => { calls.push({ auth: args }); } },
    "@/modules/recruiting/operation-forms/domain": { isOperationFormType: (v) => ["suggestions", "reports"].includes(v), isOperationFormStatus: (v) => v === "PENDING", OPERATION_FORM_STATUSES: ["PENDING"], OPERATION_FORM_TYPES: ["suggestions", "reports"] },
    "@/modules/admin/domain/admin-workspaces": { ADMIN_OPERATION_FORM_LABELS: { suggestions: "문의·건의", reports: "신고" } },
    "@/components/admin/admin-operations.module.css": { default: {} },
    "@/modules/recruiting/operation-forms/runtime": { loadRuntimeOperationForms: async (loader) => ({ state: "ready", data: await loader({ list: async (input) => { calls.push(input); return { counts, items: [], total: 61, page: 2, totalPages: 3 }; } }) }) },
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", code)((id) => { assert.ok(id in dependencies, id); return dependencies[id]; }, exports);
  const html = renderToStaticMarkup(await exports.AdminOperationFormList({ selectedType: "suggestions", selectedStatus: "PENDING", selectedPage: "2" }));
  return { html, calls };
}
test("HUB inquiry filters and pagination stay on the permitted support route", async () => {
  const { html, calls } = await renderList("hub");
  assert.match(html, /action="\/admin\/operation-forms\/suggestions"/u);
  assert.match(html, /href="\/admin\/operation-forms\/suggestions\?status=PENDING"/u);
  assert.match(html, /href="\/admin\/operation-forms\/suggestions\?status=PENDING&amp;page=3"/u);
  assert.doesNotMatch(html, /name="type"|href="\/admin\/discipline"/u);
  assert.match(html, /고객 문의/u); assert.match(html, /고객에게 답변을 발송하지 않습니다/u);
  assert.equal(calls[1].formType, "suggestions");
});
test("community operation-form lists preserve their existing multi-type navigation", async () => {
  const { html } = await renderList("nexus");
  assert.match(html, /action="\/admin\/operation-forms"/u);
  assert.match(html, /name="type"/u); assert.match(html, /href="\/admin\/discipline"/u);
  assert.match(html, /type=suggestions&amp;status=PENDING&amp;page=3/u);
});
