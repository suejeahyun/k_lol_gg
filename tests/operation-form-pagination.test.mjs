import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function route() {
  const calls = [];
  let authorized = true;
  const source = readFileSync(new URL("../src/app/api/admin/operation-forms/route.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const modules = {
    "@/modules/recruiting/operation-forms/domain": {
      isOperationFormType: (value) => ["friends", "leaves", "meetups", "suggestions"].includes(value),
      isOperationFormStatus: (value) => ["PENDING", "IN_REVIEW", "COMPLETED", "REJECTED", "CANCELLED"].includes(value),
      OperationFormError: Error,
    },
    "@/modules/recruiting/operation-forms/http": {
      requireOperationFormAdmin: async () => authorized ? { ok: true } : { ok: false, response: new Response(null, { status: 401 }) },
      operationFormReadResponse: (body) => Response.json(body),
      operationFormErrorResponse: () => new Response(null, { status: 400 }),
      operationFormUnavailableResponse: () => new Response(null, { status: 503 }),
    },
    "@/modules/recruiting/operation-forms/runtime": { getRuntimeOperationForms: () => ({ list: async (query) => { calls.push(query); return { items: [], page: query.page }; } }) },
    "@/platform/http": { readValidatedTraceId: () => "synthetic-trace" },
  };
  new Function("require", "exports", output)((name) => { assert.ok(modules[name], name); return modules[name]; }, exports);
  return { get: (query) => exports.GET(new Request(`http://localhost/api/admin/operation-forms${query}`)), calls, deny: () => { authorized = false; } };
}

test("operation form API preserves filters across pages and defaults to the first page", async () => {
  const subject = route();
  assert.equal((await subject.get("")).status, 200);
  assert.equal((await subject.get("?type=suggestions&status=PENDING&page=2")).status, 200);
  assert.deepEqual(subject.calls, [{ formType: undefined, status: undefined, page: 1 }, { formType: "suggestions", status: "PENDING", page: 2 }]);
});

test("operation form API rejects malformed or repeated pagination before loading private rows", async () => {
  const subject = route();
  for (const query of ["?page=0", "?page=-1", "?page=1.5", "?page=1e2", "?page=", "?page=9007199254740992", "?page=1&page=2", "?page=2&other=value"]) {
    assert.equal((await subject.get(query)).status, 400, query);
  }
  assert.deepEqual(subject.calls, []);
  subject.deny();
  assert.equal((await subject.get("?page=2")).status, 401);
  assert.deepEqual(subject.calls, []);
});
