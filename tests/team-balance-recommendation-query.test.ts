import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTeamBalanceDraftDetailQuery,
  parseTeamBalanceDraftsPageQuery,
  parseTeamBalanceRecommendationApiQuery,
} from "../src/modules/team-tools/infrastructure/team-recommendation-query";

const id = "10000000-0000-4000-8000-000000000001";

test("recommendation list and detail queries use exact draft/team allowlists", () => {
  assert.deepEqual(parseTeamBalanceDraftsPageQuery({ view: "recommendations", draftId: id, team: "BLUE" }), { view: "recommendations", draftId: id, team: "BLUE" });
  assert.equal(parseTeamBalanceDraftsPageQuery({ view: "recommendations", draftId: [id, id] }), null);
  assert.equal(parseTeamBalanceDraftsPageQuery({ view: "recommendations", team: "GREEN" }), null);
  assert.deepEqual(parseTeamBalanceDraftDetailQuery({ tab: "recommendations" }), { tab: "recommendations", team: "RED" });
  assert.equal(parseTeamBalanceDraftDetailQuery({ tab: ["recommendations", "recommendations"] }), null);
  assert.equal(parseTeamBalanceDraftDetailQuery({ tab: "recommendations", next: "https://example.com" }), null);
});

test("recommendation API requires one explicit RED or BLUE team", () => {
  assert.equal(parseTeamBalanceRecommendationApiQuery("http://local/path?team=RED"), "RED");
  assert.equal(parseTeamBalanceRecommendationApiQuery("http://local/path"), null);
  assert.equal(parseTeamBalanceRecommendationApiQuery("http://local/path?team=RED&team=BLUE"), null);
  assert.equal(parseTeamBalanceRecommendationApiQuery("http://local/path?team=GREEN"), null);
});
