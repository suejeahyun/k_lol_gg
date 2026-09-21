import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { drainStatisticsProjection } from "../src/modules/statistics/application/drain-statistics-projection";
import type { ClaimedMatchChangedEvent, StatisticsProjectionRepository } from "../src/modules/statistics/application/ports/statistics-projection-repository";
import { handleStatisticsProjectionCron } from "../src/modules/statistics/infrastructure/statistics-projection-cron";

const secret = "synthetic-statistics-cron-secret-000000";
const path = "https://v2.example/api/cron/statistics-projection";
const now = new Date("2026-09-22T00:00:00Z");
function request(url = path, authorization: string | null = `Bearer ${secret}`, method = "GET") {
  return new Request(url, { method, headers: authorization ? { authorization } : {} });
}
function event(): ClaimedMatchChangedEvent {
  return { eventId: randomUUID(), eventType: "MATCH_CHANGED", action: "CREATED", matchId: randomUUID(), matchRevision: 0,
    oldSeasonId: null, newSeasonId: null, inputDigest: Buffer.alloc(32), lockedAt: now };
}
function repository(queue: ClaimedMatchChangedEvent[]): StatisticsProjectionRepository {
  return {
    async claimNextMatchChanged() { return queue.shift() ?? null; },
    async applyClaimedMatchChanged({ event: claimed }) {
      return { eventId: claimed.eventId, kind: "APPLIED", affectedSeasonIds: [], projections: [] };
    },
    async failClaimedMatchChanged() {},
  };
}

test("statistics cron rejects credentials, query overrides, wrong path and method before opening the database", async () => {
  for (const input of [request(path, null), request(path, "Bearer incorrect"), request(`${path}?maximumEvents=100`), request(`${path}/other`), request(path, `Bearer ${secret}`, "POST")]) {
    const response = await handleStatisticsProjectionCron(input, {
      secret, getRepository() { assert.fail("rejected requests cannot touch the database"); },
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal((await response.json()).code, "JOB_AUTH_FAILED");
  }
  for (const configuredSecret of [undefined, "too-short"]) {
    assert.equal((await handleStatisticsProjectionCron(request(), {
      secret: configuredSecret, getRepository() { assert.fail("misconfigured requests cannot touch the database"); },
    })).status, 401);
  }
});

test("authenticated empty queue is a no-op; a request never consumes more than ten events", async () => {
  const empty = await handleStatisticsProjectionCron(request(), { secret, getRepository: () => repository([]) });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { job: "statistics-projection", processed: 0, applied: 0, replayed: 0, failed: 0, stopped: "IDLE" });
  const queue = Array.from({ length: 11 }, event);
  const limited = await handleStatisticsProjectionCron(request(), { secret, getRepository: () => repository(queue) });
  assert.equal(limited.status, 200);
  assert.deepEqual(await limited.json(), { job: "statistics-projection", processed: 10, applied: 10, replayed: 0, failed: 0, stopped: "LIMIT" });
  assert.equal(queue.length, 1);
});

test("time budget finishes the current event and stops before claiming another", async () => {
  let clock = 0;
  const queue = [event(), event()];
  const worker = repository(queue);
  const apply = worker.applyClaimedMatchChanged;
  worker.applyClaimedMatchChanged = async (input) => { clock += 20_000; return apply(input); };
  const response = await handleStatisticsProjectionCron(request(), {
    secret, getRepository: () => worker, monotonicNow: () => clock,
  });
  assert.deepEqual(await response.json(), { job: "statistics-projection", processed: 1, applied: 1, replayed: 0, failed: 0, stopped: "TIME_BUDGET" });
  assert.equal(queue.length, 1);
  await assert.rejects(drainStatisticsProjection(worker, { maximumEvents: 1, maximumDurationMs: 0 }), RangeError);
  await assert.rejects(drainStatisticsProjection(worker, { maximumEvents: 1, maximumDurationMs: 30_001 }), RangeError);
});

test("failed event stops the batch, returns retryable status and exposes no event or raw error", async () => {
  const queue = [event(), event()];
  const worker = repository(queue);
  let released = 0;
  worker.applyClaimedMatchChanged = async () => { throw new Error("synthetic private details"); };
  worker.failClaimedMatchChanged = async () => { released += 1; };
  const response = await handleStatisticsProjectionCron(request(), { secret, getRepository: () => worker });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(await response.json(), { job: "statistics-projection", processed: 1, applied: 0, replayed: 0, failed: 1, stopped: "FAILED" });
  assert.equal(released, 1);
  assert.equal(queue.length, 1);
});

test("database setup, claim and release failures remain retryable without disclosing internals", async () => {
  const failures: (() => StatisticsProjectionRepository | null)[] = [
    () => null,
    () => { throw new Error("private connection configuration"); },
    () => ({ ...repository([]), async claimNextMatchChanged() { throw new Error("private SQL"); } }),
    () => ({ ...repository([event()]), async applyClaimedMatchChanged() { throw new Error("private SQL"); }, async failClaimedMatchChanged() { throw new Error("private SQL"); } }),
  ];
  for (const getRepository of failures) {
    const response = await handleStatisticsProjectionCron(request(), { secret, getRepository });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "STATISTICS_JOB_UNAVAILABLE");
  }
});
