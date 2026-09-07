import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_IMPORT_RECOVERY_TTL_MS,
  clearAdminImportRecovery,
  loadAdminImportRecovery,
  parseAdminImportRecovery,
  saveAdminImportRecovery,
  serializeAdminImportRecovery,
} from "../src/modules/matches/infrastructure/admin-import-recovery";

const submissionId = "20000000-0000-4000-8000-000000000000";
const now = Date.UTC(2026, 8, 1, 0, 0, 0);

test("admin import recovery stores only minimal expiring non-secret metadata", () => {
  const raw = serializeAdminImportRecovery({
    submissionId,
    revision: 2,
    uploadKey: "admin-import-upload-safe-key-12345",
  }, now);
  assert.deepEqual(parseAdminImportRecovery(raw, now), {
    submissionId,
    revision: 2,
    uploadKey: "admin-import-upload-safe-key-12345",
    expiresAt: now + ADMIN_IMPORT_RECOVERY_TTL_MS,
  });
  for (const forbidden of ["bytes", "base64", "ocr", "storageKey", "memberName", "userAccountId", "sha256", "fileName"]) {
    assert.equal(raw.includes(forbidden), false);
  }
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["expiresAt", "revision", "submissionId", "uploadKey"]);
});

test("admin import recovery is best-effort when session storage is unavailable", () => {
  const unavailable = {
    getItem() { throw new DOMException("blocked", "SecurityError"); },
    setItem() { throw new DOMException("blocked", "QuotaExceededError"); },
    removeItem() { throw new DOMException("blocked", "SecurityError"); },
  };
  assert.equal(loadAdminImportRecovery(now, unavailable), null);
  assert.equal(saveAdminImportRecovery({
    submissionId,
    revision: 0,
    uploadKey: "admin-import-upload-safe-key-12345",
  }, now, unavailable), false);
  assert.equal(clearAdminImportRecovery(unavailable), false);
});

test("admin import recovery rejects expired, corrupt and expanded state", () => {
  const valid = serializeAdminImportRecovery({
    submissionId,
    revision: 0,
    uploadKey: "admin-import-upload-safe-key-12345",
  }, now);
  assert.equal(parseAdminImportRecovery(valid, now + ADMIN_IMPORT_RECOVERY_TTL_MS), null);
  assert.equal(parseAdminImportRecovery("{broken", now), null);
  assert.equal(parseAdminImportRecovery(JSON.stringify({ ...JSON.parse(valid), bytes: "secret" }), now), null);
  assert.equal(parseAdminImportRecovery(JSON.stringify({ ...JSON.parse(valid), expiresAt: now + ADMIN_IMPORT_RECOVERY_TTL_MS + 1 }), now), null);
});
