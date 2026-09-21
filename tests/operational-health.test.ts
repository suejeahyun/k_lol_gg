import assert from "node:assert/strict";
import test from "node:test";
import { operationalHealthStatuses, type OperationalHealthSnapshot } from "../src/modules/operations/application/operational-health";

function snapshot(): OperationalHealthSnapshot {
  return {
    checkedAt: "2026-09-22T12:00:00+09:00",
    statistics: { pending: 0, failed: 0, oldestPendingAt: null, lastConsumedAt: null },
    dailyClose: { status: "SUCCEEDED", startedAt: "2026-09-22T06:00:00+09:00", completedAt: "2026-09-22T06:00:01+09:00", realStorage: false },
    storage: { status: "SUCCEEDED", startedAt: "2026-08-01T12:00:00+09:00", completedAt: "2026-08-01T12:00:01+09:00", realStorage: true },
    riot: { integrationEnabled: true, siteEnabled: true, apiConfigured: true, rsoConfigured: false, synthetic: false, pending: 0, failed: 0, oldestPendingAt: null, lastCompletedAt: null,
      apiProbe: { status: "SUCCEEDED", startedAt: "2026-09-21T12:00:00+09:00", completedAt: "2026-09-21T12:00:01+09:00", realStorage: false } },
    siteNotices: { enabled: true, configured: true, pending: 0, failed: 0, expiredPending: 0, oldestPendingAt: null, lastAuthenticatedAt: "2026-09-22T11:59:00+09:00", lastAcknowledgedAt: null },
  };
}

test("operational observations separate missing evidence, disabled flags and historical success", () => {
  const value = snapshot();
  assert.deepEqual(operationalHealthStatuses(value), { statistics: "CLEAR", dailyClose: "CLEAR", storage: "CLEAR", riot: "CLEAR", siteNotices: "CLEAR" });
  assert.equal(operationalHealthStatuses({ ...value, storage: null }).storage, "UNVERIFIED");
  assert.equal(operationalHealthStatuses({ ...value, storage: { ...value.storage!, realStorage: false } }).storage, "UNVERIFIED");
  assert.equal(operationalHealthStatuses({ ...value, dailyClose: null }).dailyClose, "UNVERIFIED");
  assert.equal(operationalHealthStatuses({ ...value, riot: { ...value.riot, siteEnabled: null } }).riot, "UNVERIFIED");
  assert.equal(operationalHealthStatuses({ ...value, riot: { ...value.riot, apiProbe: null } }).riot, "UNVERIFIED");
  assert.equal(operationalHealthStatuses({ ...value, riot: { ...value.riot, apiProbe: { ...value.riot.apiProbe!, status: "FAILED" } } }).riot, "ATTENTION");
  for (const patch of [{ integrationEnabled: false }, { siteEnabled: false }]) {
    assert.equal(operationalHealthStatuses({ ...value, riot: { ...value.riot, ...patch, failed: 3 } }).riot, "DISABLED");
  }
  for (const patch of [{ apiConfigured: false }, { synthetic: true }]) {
    assert.equal(operationalHealthStatuses({ ...value, riot: { ...value.riot, ...patch } }).riot, "UNVERIFIED");
  }
  assert.equal(operationalHealthStatuses({ ...value, siteNotices: { ...value.siteNotices, enabled: false } }).siteNotices, "DISABLED");
  assert.equal(operationalHealthStatuses({ ...value, siteNotices: { ...value.siteNotices, configured: false } }).siteNotices, "UNVERIFIED");
});

test("daily close follows the KST 06:00 operating boundary with a 15 minute grace", () => {
  const value = snapshot();
  const previous = { ...value.dailyClose!, startedAt: "2026-09-21T06:00:00+09:00", completedAt: "2026-09-21T06:00:01+09:00" };
  assert.equal(operationalHealthStatuses({ ...value, checkedAt: "2026-09-22T05:59:59+09:00", dailyClose: previous }).dailyClose, "CLEAR");
  assert.equal(operationalHealthStatuses({ ...value, checkedAt: "2026-09-22T06:14:59+09:00", dailyClose: previous }).dailyClose, "CLEAR");
  assert.equal(operationalHealthStatuses({ ...value, checkedAt: "2026-09-22T06:15:00+09:00", dailyClose: previous }).dailyClose, "ATTENTION");
  assert.equal(operationalHealthStatuses({ ...value, dailyClose: { ...previous, status: "FAILED" } }).dailyClose, "ATTENTION");
});

test("bounded queue thresholds and unfinished jobs draw attention without claiming delivery", () => {
  const value = snapshot();
  const old = "2026-09-22T11:00:00+09:00";
  assert.equal(operationalHealthStatuses({ ...value, statistics: { ...value.statistics, pending: 1, oldestPendingAt: "2026-09-22T11:45:00+09:00" } }).statistics, "ATTENTION");
  assert.equal(operationalHealthStatuses({ ...value, statistics: { ...value.statistics, failed: 1 } }).statistics, "ATTENTION");
  assert.equal(operationalHealthStatuses({ ...value, riot: { ...value.riot, failed: 1 } }).riot, "ATTENTION");
  assert.equal(operationalHealthStatuses({ ...value, riot: { ...value.riot, pending: 1, oldestPendingAt: old } }).riot, "ATTENTION");
  assert.equal(operationalHealthStatuses({ ...value, storage: { ...value.storage!, status: "RUNNING", completedAt: null, startedAt: old } }).storage, "ATTENTION");
  assert.equal(operationalHealthStatuses({ ...value, storage: { ...value.storage!, status: "RUNNING", completedAt: null, startedAt: "2026-09-22T11:59:59+09:00" } }).storage, "UNVERIFIED");
  assert.equal(operationalHealthStatuses({ ...value, storage: { ...value.storage!, status: "FAILED" } }).storage, "ATTENTION");
  for (const patch of [{ failed: 1 }, { expiredPending: 1 }, { pending: 1, oldestPendingAt: old }]) {
    assert.equal(operationalHealthStatuses({ ...value, siteNotices: { ...value.siteNotices, ...patch } }).siteNotices, "ATTENTION");
  }
  for (const lastAuthenticatedAt of [null, old]) {
    assert.equal(operationalHealthStatuses({ ...value, siteNotices: { ...value.siteNotices, lastAuthenticatedAt, lastAcknowledgedAt: value.checkedAt } }).siteNotices, "UNVERIFIED");
  }
});
