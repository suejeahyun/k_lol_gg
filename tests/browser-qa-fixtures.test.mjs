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
    "disciplineRecordId", "operationFormId", "privateAssetId", "draftId", "mmrReviewId", "destructionPlayerId", "requiredFixture",
    'V2_PUBLIC_DATA_SOURCE: "postgres"',
    'V2_FAKE_PRIVATE_ASSETS: ""',
  ]) assert.match(source, new RegExp(evidence));
  assert.match(source, /to_regclass\('assets\.private_assets'\)/u);
  assert.match(source, /owner_user_account_id = \$1/u);
  assert.match(source, /Browser QA fixture is missing/u);
});
