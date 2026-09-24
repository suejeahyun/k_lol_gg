import assert from "node:assert/strict";
import test from "node:test";

import type { MmrCatchUpResult } from "../src/modules/mmr/application/ports/mmr-repository";
import { handleMmrProjectionCron } from "../src/modules/mmr/infrastructure/mmr-projection-cron";

const secret = "synthetic-mmr-cron-secret-00000000";
const path = "https://v2.example/api/cron/mmr-projection";
const now = new Date("2026-09-25T00:00:00Z");
function request(url = path, authorization: string | null = `Bearer ${secret}`, method = "GET") {
  return new Request(url, { method, headers: authorization ? { authorization } : {} });
}

test("MMR cron authenticates the exact route before opening a database service", async () => {
  for (const input of [request(path, null), request(path, "Bearer incorrect"), request(`${path}?generation=2`), request(`${path}/other`), request(path, `Bearer ${secret}`, "POST")]) {
    const response = await handleMmrProjectionCron(input, {
      secret, getService() { assert.fail("rejected requests cannot touch the database"); },
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal((await response.json()).code, "JOB_AUTH_FAILED");
  }
  for (const configuredSecret of [undefined, "too-short"]) {
    assert.equal((await handleMmrProjectionCron(request(), {
      secret: configuredSecret, getService() { assert.fail("invalid cron configuration cannot touch the database"); },
    })).status, 401);
  }
});

test("MMR cron runs one catch-up and allowlists fixed state and operational counters", async () => {
  for (const result of [
    { kind: "IDLE", generation: 4 },
    { kind: "REBUILT", generation: 5, consumedEventCount: 3 },
  ] as const) {
    let called = 0;
    const response = await handleMmrProjectionCron(request(), {
      secret, now: () => now, getService: () => ({ async catchUp(at) {
        called += 1;
        assert.equal(at, now);
        return { ...result, privateField: "must not leak" };
      } }),
    });
    assert.equal(called, 1);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.deepEqual(await response.json(), {
      job: "mmr-projection", kind: result.kind, generation: result.generation,
      consumedEventCount: result.kind === "REBUILT" ? result.consumedEventCount : 0,
    });
  }
});

test("MMR cron reports the required administrator formula transition without pretending it is idle", async () => {
  const response = await handleMmrProjectionCron(request(), {
    secret, getService: () => ({ async catchUp() { return { kind: "ADMIN_RECALCULATION_REQUIRED", generation: 1 }; } }),
  });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "MMR_FORMULA_TRANSITION_REQUIRED");
  assert.match(body.detail, /\/admin\/balance-ai/);
  assert.equal(response.headers.has("retry-after"), false, "an administrator action is required before automatic retries can succeed");
});

test("MMR cron sanitizes service initialization, database and lock timeout failures", async () => {
  for (const getService of [
    () => null,
    () => { throw new Error("private connection string"); },
    () => ({ async catchUp(): Promise<MmrCatchUpResult> { throw new Error("private SQL or member data"); } }),
  ]) {
    const response = await handleMmrProjectionCron(request(), { secret, getService });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
    const body = await response.json();
    assert.equal(body.code, "MMR_JOB_UNAVAILABLE");
    assert.equal(JSON.stringify(body).includes("private"), false);
  }
});
