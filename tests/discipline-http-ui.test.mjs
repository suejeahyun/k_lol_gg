import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("public discipline API exposes aggregate statistics only", async () => {
  const [route, dto] = await Promise.all([source("src/app/api/discipline/stats/route.ts"), source("src/modules/discipline/domain/public-statistics.ts")]);
  assert.match(route, /getPublicStatistics/);
  assert.match(dto, /aggregate-only/);
  assert.doesNotMatch(dto, /targetName|storageKey|sha256/);
});

test("owner and admin evidence boundaries require session, revision, idempotency, and concealed reads", async () => {
  const [upload, review, image, http] = await Promise.all([source("src/app/api/me/discipline/tasks/[taskId]/evidence/route.ts"), source("src/app/api/admin/discipline-tasks/[taskId]/review/route.ts"), source("src/app/api/me/discipline/assets/[assetId]/route.ts"), source("src/modules/discipline/infrastructure/discipline-http.ts")]);
  assert.match(upload, /requireDisciplineApiSession\("USER"\)/);
  assert.match(upload, /prepareDisciplineUpload/);
  assert.match(review, /requireDisciplineApiSession\("SUPER_ADMIN"\)/);
  assert.match(review, /prepareDisciplineJsonMutation/);
  assert.match(http, /readIfMatchRevision/);
  assert.match(http, /readIdempotencyKey/);
  assert.match(http, /hasSameOrigin/);
  assert.match(image, /readPrivateBytes/);
  assert.doesNotMatch(image, /storageKey|sha256|storageProvider/);
});

test("regular administrators may read discipline details but only super administrators may mutate them", async () => {
  const [recordRoute, detailPage, actions, adapter] = await Promise.all([
    source("src/app/api/admin/discipline-records/[recordId]/route.ts"),
    source("src/app/(admin)/admin/discipline/[recordId]/page.tsx"),
    source("src/components/discipline/admin-discipline-actions.tsx"),
    source("src/modules/discipline/infrastructure/postgres-discipline-adapter.ts"),
  ]);
  assert.match(recordRoute, /GET[\s\S]*requireDisciplineApiSession\("ADMIN"\)/);
  assert.equal(recordRoute.match(/requireDisciplineApiSession\("SUPER_ADMIN"\)/g)?.length, 2);
  assert.match(detailPage, /canManage=\{session\.role === "SUPER_ADMIN"\}/);
  assert.match(actions, /징계 기록의 수정·취소와 증빙 검토는 최고 관리자만/);
  assert.match(adapter, /mutateRecord[\s\S]*minimumRole: "SUPER_ADMIN"/);
});

test("asset jobs accept signed requests only and are durably replay-guarded", async () => {
  const [cleanup, recover] = await Promise.all([source("src/app/api/internal/jobs/discipline-assets-cleanup/route.ts"), source("src/app/api/internal/jobs/discipline-assets-recover/route.ts")]);
  for (const route of [cleanup, recover]) {
    assert.match(route, /verifyOperationsJobHttpRequest/);
    assert.match(route, /claimSignedAssetJob/);
    assert.doesNotMatch(route, /authorizeApiRole|getCurrentSession|requireDisciplineApiSession/);
  }
});

test("discipline pages declare real empty, error, and unavailable states", async () => {
  const pages = await Promise.all([source("src/app/(public)/(discipline)/discipline/page.tsx"), source("src/app/(public)/account/discipline/page.tsx"), source("src/app/(admin)/admin/discipline/page.tsx")]);
  for (const page of pages) {
    assert.match(page, /state === "ready"/);
    assert.match(page, /state === "unavailable"/);
    assert.match(page, /role="alert"/);
  }
  assert.match(pages[0], /징계 현황을 확인할 수 없어요/);
  assert.match(pages[2], /필터를 바꾸거나 새 기록을 등록해 주세요/);
});
