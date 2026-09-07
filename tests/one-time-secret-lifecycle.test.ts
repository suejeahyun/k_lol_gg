import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceLatestRevision,
  isOneTimeSecretRevisionCurrent,
  shouldApplyRevisionProjection,
} from "../src/platform/security/one-time-secret-lifecycle";

test("r1에서 발급한 own r2 응답은 최신 projection과 일회성 비밀번호를 함께 유지한다", () => {
  const latestRevision = 1;
  const responseRevision = 2;

  assert.equal(shouldApplyRevisionProjection({ latestRevision, projectionRevision: responseRevision }), true);
  const nextLatestRevision = advanceLatestRevision(latestRevision, responseRevision);
  assert.equal(nextLatestRevision, 2);
  assert.equal(isOneTimeSecretRevisionCurrent({
    latestRevision: nextLatestRevision,
    issuedRevision: responseRevision,
  }), true);

  const refreshedLatestRevision = advanceLatestRevision(nextLatestRevision, 2);
  assert.equal(shouldApplyRevisionProjection({
    latestRevision: nextLatestRevision,
    projectionRevision: 2,
  }), true);
  assert.equal(isOneTimeSecretRevisionCurrent({
    latestRevision: refreshedLatestRevision,
    issuedRevision: responseRevision,
  }), true);
});

test("r2 비밀번호 표시 중 외부 r3 projection이 도착하면 r2 비밀번호를 폐기한다", () => {
  const issuedRevision = 2;
  assert.equal(shouldApplyRevisionProjection({ latestRevision: 2, projectionRevision: 3 }), true);
  const latestRevision = advanceLatestRevision(2, 3);

  assert.equal(latestRevision, 3);
  assert.equal(isOneTimeSecretRevisionCurrent({ latestRevision, issuedRevision }), false);
});

test("r3 prop이 선반영된 뒤 도착한 늦은 r2 응답은 projection과 비밀번호 모두 거부한다", () => {
  const latestRevision = 3;
  const lateResponseRevision = 2;

  assert.equal(shouldApplyRevisionProjection({
    latestRevision,
    projectionRevision: lateResponseRevision,
  }), false);
  assert.equal(advanceLatestRevision(latestRevision, lateResponseRevision), 3);
  assert.equal(isOneTimeSecretRevisionCurrent({
    latestRevision,
    issuedRevision: lateResponseRevision,
  }), false);
});
