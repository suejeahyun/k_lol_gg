import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositorySource = readFileSync(
  new URL("../src/modules/matches/infrastructure/postgres-match-repository.ts", import.meta.url),
  "utf8",
);

function methodSource(startMarker, endMarker) {
  const start = repositorySource.indexOf(startMarker);
  const end = repositorySource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `missing source boundary: ${startMarker}`);
  return repositorySource.slice(start, end);
}

test("submission approval durably transfers team-balance provenance into the match aggregate", () => {
  const approval = methodSource("  async approveSubmission(", "  async rejectSubmission(");
  assert.match(approval, /matchSeriesProvenanceFromSubmission\(current\)/);
  assert.match(approval, /teamBalanceDraftId: current\.teamBalanceDraftId/);

  const aggregateInsert = methodSource("  private async insertMatchAggregate(", "  private async assertPublishable(");
  assert.match(aggregateInsert, /teamBalanceDraftId: provenance\.teamBalanceDraftId/);
});

test("ordinary match amendments cannot clear immutable team-balance provenance", () => {
  const update = methodSource("  async updateMatch(", "  async publishMatch(");
  assert.doesNotMatch(update, /teamBalanceDraftId/);
});

test("match changed outbox carries team-balance provenance in its typed row and payload", () => {
  const outbox = methodSource("  private async outbox(", "  async listPublic(");
  assert.equal(outbox.match(/teamBalanceDraftId: row\.teamBalanceDraftId/g)?.length, 2);
});
