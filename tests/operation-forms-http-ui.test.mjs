import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  webhook: "src/app/api/integrations/kakao/operation-forms/route.ts",
  adminApi: "src/app/api/admin/operation-forms/[formType]/[id]/route.ts",
  adapter: "src/modules/recruiting/operation-forms/postgres-operation-forms.ts",
  list: "src/components/operation-forms/admin-operation-form-list.tsx",
  detail: "src/app/(admin)/admin/operation-forms/[formType]/[id]/page.tsx",
  legacy: "src/app/(admin)/admin/kakao/operation-forms/[formType]/page.tsx",
};

async function source(name) { return readFile(new URL(`../${files[name]}`, import.meta.url), "utf8"); }

test("signed operation-form submit retains raw-body HMAC and durable replay boundaries", async () => {
  const [webhook, adapter] = await Promise.all([source("webhook"), source("adapter")]);
  for (const evidence of ["readBoundedKakaoRawBody", "verifyKakaoWebhook", "readIdempotencyKey", "exactEnvelope", "verification.intent.bodyDigestHex"]) assert.match(webhook, new RegExp(evidence));
  for (const evidence of ["claimKakaoNonce", "claimReceipt", "recruitingNonceBindings", "recruitingCommandReceipts", "withTransaction", "appendEvent"]) assert.match(adapter, new RegExp(evidence));
  assert.doesNotMatch(webhook, /request\.json\(\)/u);
});

test("admin mutation requires ADMIN session, same-origin, If-Match and idempotency", async () => {
  const [api, http, adapter] = await Promise.all([
    source("adminApi"), readFile(new URL("../src/modules/recruiting/operation-forms/http.ts", import.meta.url), "utf8"), source("adapter"),
  ]);
  assert.match(api, /requireOperationFormAdmin/u); assert.match(api, /prepareOperationFormMutation/u);
  for (const evidence of ["hasSameOrigin", "readIfMatchRevision", "readIdempotencyKey"]) assert.match(http, new RegExp(evidence));
  assert.match(adapter, /lockTransactionSessionActor/u); assert.match(adapter, /ADMIN_MUTATION_SESSION_POLICY/u);
  assert.match(adapter, /deletedAt/u); assert.doesNotMatch(adapter, /\.delete\(operationForms\)/u);
});

test("admin pages expose filtered empty/error/unavailable states and compatibility routes", async () => {
  const [list, detail, legacy] = await Promise.all([source("list"), source("detail"), source("legacy")]);
  for (const text of ["조건에 맞는 신청이 없습니다", "저장소 연결을 준비 중입니다", "신청서를 불러오지 못했습니다"]) assert.match(list, new RegExp(text));
  assert.match(list, /aria-current/u); assert.match(list, /<table/u); assert.match(detail, /AdminOperationFormActions/u);
  assert.match(legacy, /permanentRedirect/u); assert.match(legacy, /\/admin\/operation-forms\?type=/u);
});
