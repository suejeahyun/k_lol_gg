import assert from "node:assert/strict";
import test from "node:test";
import { TeamBalanceDomainError } from "../src/modules/team-tools/domain/team-balance";
import { TeamBalanceServiceError } from "../src/modules/team-tools/domain/team-balance-draft";
import { teamBalanceErrorResponse } from "../src/modules/team-tools/infrastructure/team-balance-http";

test("fairness failures are actionable 422 problems without leaking domain subjects", async () => {
  for (const [domainCode, publicCode] of [
    ["FAIRNESS_CONSTRAINT", "TEAM_BALANCE_FAIRNESS_CONSTRAINT"],
    ["NO_FEASIBLE_LAYOUT", "NO_FEASIBLE_TEAM_BALANCE"],
  ] as const) {
    const response = teamBalanceErrorResponse(new TeamBalanceDomainError(domainCode, "private-player-subject"));
    assert.equal(response.status, 422);
    assert.match(response.headers.get("content-type")!, /application\/problem\+json/);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    const body = await response.json();
    assert.equal(body.code, publicCode);
    assert.match(body.detail, /포지션/);
    assert.match(body.detail, /3단계/);
    assert.doesNotMatch(JSON.stringify(body), /private-player-subject/);
  }
});

test("fairness HTTP integration preserves malformed-input, revision and permission status codes", () => {
  assert.equal(teamBalanceErrorResponse(new TeamBalanceDomainError("INVALID_LAYOUT")).status, 400);
  assert.equal(teamBalanceErrorResponse(new TeamBalanceServiceError("PRECONDITION_FAILED", "revision")).status, 412);
  assert.equal(teamBalanceErrorResponse(new TeamBalanceServiceError("FORBIDDEN", "actor")).status, 403);
  assert.equal(teamBalanceErrorResponse(new TeamBalanceServiceError("SESSION_STALE", "session")).status, 401);
  assert.equal(teamBalanceErrorResponse(new Error("database unavailable")).status, 503);
});
