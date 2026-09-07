import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAdminImportLatestProjection,
  planAdminImportUploadFailure,
} from "../src/modules/matches/infrastructure/admin-import-retry";

test("ambiguous admin import failures preserve the exact upload key", () => {
  for (const uploadStatus of [null, 408, 425, 429, 500, 503]) {
    assert.deepEqual(planAdminImportUploadFailure({
      uploadStatus,
      currentRevision: 3,
    }), { kind: "REPLAY_SAME_KEY" });
  }
  for (const uploadStatus of [409, 412]) {
    assert.deepEqual(planAdminImportUploadFailure({
      uploadStatus,
      currentRevision: 3,
      latest: null,
    }), { kind: "REPLAY_SAME_KEY" });
  }
});

test("a verified latest projection is the only conflict path that changes revision or opens review", () => {
  assert.deepEqual(planAdminImportUploadFailure({
    uploadStatus: 412,
    currentRevision: 3,
    latest: { revision: 4, status: "AWAITING_UPLOAD" },
  }), { kind: "RETRY_NEW_KEY", revision: 4 });
  assert.deepEqual(planAdminImportUploadFailure({
    uploadStatus: 409,
    currentRevision: 3,
    latest: { revision: 3, status: "AWAITING_UPLOAD" },
  }), { kind: "REPLAY_SAME_KEY" });
  assert.deepEqual(planAdminImportUploadFailure({
    uploadStatus: 409,
    currentRevision: 3,
    latest: { revision: 4, status: "PENDING_REVIEW" },
  }), { kind: "OPEN_REVIEW", revision: 4 });
});

test("latest projection parser rejects malformed or unknown state", () => {
  assert.deepEqual(parseAdminImportLatestProjection({
    submission: { revision: 5, status: "PENDING_REVIEW", privateStorageKey: "must-not-be-read" },
  }), { revision: 5, status: "PENDING_REVIEW" });
  assert.equal(parseAdminImportLatestProjection({ submission: { revision: -1, status: "PENDING_REVIEW" } }), null);
  assert.equal(parseAdminImportLatestProjection({ submission: { revision: 1, status: "UNKNOWN" } }), null);
  assert.equal(parseAdminImportLatestProjection({ submission: null }), null);
});

test("definitive client rejection retains replay while allowing an explicit file reselection", () => {
  assert.deepEqual(planAdminImportUploadFailure({
    uploadStatus: 400,
    currentRevision: 1,
  }), { kind: "RETRY_OR_RESELECT" });
});
