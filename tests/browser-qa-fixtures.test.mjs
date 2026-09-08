import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { buildCapturePlan, discoverAppPages, dynamicParameters } from "../scripts/build-page-capture-plan.mjs";

const projectRoot = resolve(import.meta.dirname, "..");

test("capture fixture example resolves every repository page without placeholders", async () => {
  const fixtures = JSON.parse(await readFile(resolve(projectRoot, "docs/qa-evidence/capture-fixtures.example.json"), "utf8"));
  const pages = await discoverAppPages(resolve(projectRoot, "src/app"));
  const requiredParameters = [...new Set([
    ...pages.flatMap((page) => dynamicParameters(page.route).map((item) => item.name)),
    "mmrReviewId", "destructionPlayerId",
  ])].sort();
  assert.deepEqual(Object.keys(fixtures.parameters).sort(), requiredParameters);
  const plan = buildCapturePlan(pages, fixtures);
  assert.ok(plan.length >= pages.length);
  assert.equal(plan.some((entry) => /\[[^\]]+\]|\{\{[^}]+\}\}/u.test(entry.path)), false);
  assert.equal(fixtures.parameters.imageId, fixtures.sourceIds.galleryId);
  assert.equal(fixtures.parameters.assetId, fixtures.sourceIds.privateAssetId);
  assert.equal(fixtures.parameters.id, fixtures.sourceIds.operationFormId);
  assert.equal(fixtures.parameters.tournamentId, fixtures.sourceIds.destructionId);
});

test("browser QA server emits setup credentials, actor identity and fail-fast dynamic source IDs", async () => {
  const source = await readFile(resolve(projectRoot, "scripts/test-db/run-data-contracts.ts"), "utf8");
  for (const evidence of [
    "assertSafeTestDatabase", "setupLoginId", "accountLoginId", "actorPlayerId", "seasonId", "applicationId",
    "championKey", "publishedMatchId", "submissionId", "highlightId", "galleryId", "eventId", "destructionId",
    "disciplineRecordId", "operationFormId", "privateAssetId", "draftId", "mmrReviewId", "destructionPlayerId", "pendingKakaoApplicationId", "requiredFixture",
    'V2_PUBLIC_DATA_SOURCE: "postgres"',
    'V2_BROWSER_QA_MODE: "true"',
    'V2_FAKE_PRIVATE_ASSETS: "1"',
    "V2_BROWSER_QA_PRIVATE_IMAGE_FIXTURE",
  ]) assert.match(source, new RegExp(evidence));
  assert.match(source, /join assets\.private_assets pa on pa\.id = msi\.private_asset_id/u);
  assert.match(source, /update assets\.private_assets/u);
  assert.match(source, /prepareTeamBalanceCaptureFixture\(pool, actorId\)/u);
  assert.match(source, /Browser QA fixture is missing/u);
});
