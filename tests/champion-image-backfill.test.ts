import assert from "node:assert/strict";
import test from "node:test";

import {
  assertChampionImageBackfillReady,
  createChampionImageBackfillFixture,
  planChampionImageBackfill,
} from "../src/modules/champions/domain/champion-image-backfill";

test("173-row V1 fixture maps every NULL portrait to a unique official URL", () => {
  const plan = planChampionImageBackfill(createChampionImageBackfillFixture());
  assertChampionImageBackfillReady(plan);
  assert.deepEqual({
    datasetRows: plan.datasetRows,
    databaseRows: plan.databaseRows,
    matchedRows: plan.matchedRows,
    wouldUpdateRows: plan.wouldUpdateRows,
    alreadyCorrectRows: plan.alreadyCorrectRows,
    unmatchedRows: plan.unmatchedRows,
    conflictRows: plan.conflictRows,
  }, {
    datasetRows: 173,
    databaseRows: 173,
    matchedRows: 173,
    wouldUpdateRows: 173,
    alreadyCorrectRows: 0,
    unmatchedRows: 0,
    conflictRows: 0,
  });
  assert.equal(new Set(plan.steps.map((step) => step.expectedImageUrl)).size, 173);
});

test("backfill blocks duplicate identities and unmatched rows", () => {
  const plan = planChampionImageBackfill([
    { key: "v1-1", displayName: "아리", imageUrl: null },
    { key: "v1-2", displayName: "아리", imageUrl: null },
    { key: "v1-3", displayName: "알 수 없음", imageUrl: null },
  ]);
  assert.equal(plan.conflictRows, 2);
  assert.equal(plan.unmatchedRows, 1);
  assert.throws(() => assertChampionImageBackfillReady(plan, 3), /UNMATCHED|CONFLICT/);
});
