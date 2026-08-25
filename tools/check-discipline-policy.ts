import assert from "node:assert/strict";
import {
  CAUTIONS_PER_WARNING,
  DISCIPLINE_RESOLUTION_DAYS,
  WARNINGS_PER_BAN_REVIEW,
  disciplineResolutionDueAt,
  requiredResolutionGameCount,
} from "../src/lib/discipline/policy";

assert.equal(CAUTIONS_PER_WARNING, 3);
assert.equal(WARNINGS_PER_BAN_REVIEW, 3);
assert.equal(requiredResolutionGameCount("GENERAL"), 10);
assert.equal(requiredResolutionGameCount("INHOUSE"), 15);
assert.equal(DISCIPLINE_RESOLUTION_DAYS, 30);
assert.equal(
  disciplineResolutionDueAt(new Date("2026-08-26T00:00:00.000Z")).toISOString(),
  "2026-09-25T00:00:00.000Z",
);

console.log("Discipline policy checks passed.");
