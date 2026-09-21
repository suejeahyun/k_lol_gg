import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { signJobRequest } from "../src/modules/operations/infrastructure/job-signature";
import { handleStorageProbeRequest } from "../src/modules/operations/infrastructure/storage-probe-http";
import type { StorageProbeJobInput } from "../src/modules/operations/infrastructure/storage-probe-runner";

const path = "/api/internal/jobs/storage-probe";
const secret = "synthetic-storage-probe-secret-0123456789";
function request(options: { body?: string; url?: string; method?: string; signature?: string; timestamp?: number } = {}) {
  const body = options.body ?? "{}";
  const timestampSeconds = options.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = `synthetic_${randomUUID().replaceAll("-", "")}`;
  const bodyDigestHex = createHash("sha256").update(body).digest("hex");
  const signature = options.signature ?? signJobRequest({ method: "POST", path, timestampSeconds, nonce, bodyDigestHex }, secret);
  const method = options.method ?? "POST";
  return new Request(options.url ?? `https://v2.example${path}`, { method,
    headers: { "x-job-timestamp": String(timestampSeconds), "x-job-nonce": nonce, "x-job-signature": signature,
      "x-trace-id": "a".repeat(32), "content-type": "application/json" },
    ...(method === "GET" ? {} : { body }) });
}

test("storage probe rejects invalid signature, route, query and body before any job dependency", async (t) => {
  const previous = process.env.OPERATIONS_JOB_SECRET;
  process.env.OPERATIONS_JOB_SECRET = secret;
  t.after(() => { if (previous === undefined) delete process.env.OPERATIONS_JOB_SECRET; else process.env.OPERATIONS_JOB_SECRET = previous; });
  const inputs = [
    new Request(`https://v2.example${path}`, { method: "POST", body: "{}" }),
    request({ signature: "f".repeat(64) }), request({ timestamp: Math.floor(Date.now() / 1000) - 600 }),
    request({ url: `https://v2.example${path}?storageKey=existing` }),
    request({ url: `https://v2.example${path}/other` }), request({ method: "GET" }),
    request({ body: '{"storageKey":"real/content"}' }), request({ body: "[]" }),
    request({ body: "null" }), request({ body: "broken-json" }), request({ body: '"' + "x".repeat(17 * 1024) + '"' }),
  ];
  for (const input of inputs) {
    const response = await handleStorageProbeRequest(input, { runJob: async () => assert.fail("unauthorized request opened storage or database") });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal((await response.json()).code, "JOB_AUTH_FAILED");
  }
  delete process.env.OPERATIONS_JOB_SECRET;
  assert.equal((await handleStorageProbeRequest(request(), { runJob: async () => assert.fail("unconfigured authentication opened dependencies") })).status, 401);
});

test("storage probe uses a generated UUID and exposes only the matching anonymous trace", async (t) => {
  const previous = process.env.OPERATIONS_JOB_SECRET;
  process.env.OPERATIONS_JOB_SECRET = secret;
  t.after(() => { if (previous === undefined) delete process.env.OPERATIONS_JOB_SECRET; else process.env.OPERATIONS_JOB_SECRET = previous; });
  const accepted: StorageProbeJobInput[] = [];
  const response = await handleStorageProbeRequest(request(), { runJob: async (input) => {
    accepted.push(input);
    return { status: 200, body: { job: "storage-probe", storageProvider: "VERCEL_BLOB_PRIVATE", ok: true } };
  } });
  assert.equal(response.status, 200);
  assert.equal(accepted.length, 1);
  assert.match(accepted[0]!.requestId, /^[a-f0-9-]{14}4[a-f0-9-]{21}$/u);
  assert.equal(response.headers.get("x-trace-id"), accepted[0]!.requestId.replaceAll("-", ""));
  assert.notEqual(response.headers.get("x-trace-id"), "a".repeat(32));
  assert.equal(accepted[0]!.requestHashHex, createHash("sha256").update("{}").digest("hex"));
  assert.deepEqual(await response.json(), { job: "storage-probe", storageProvider: "VERCEL_BLOB_PRIVATE", ok: true });
});

test("storage probe preserves replay/rate-limit status and hides job exceptions", async (t) => {
  const previous = process.env.OPERATIONS_JOB_SECRET;
  process.env.OPERATIONS_JOB_SECRET = secret;
  t.after(() => { if (previous === undefined) delete process.env.OPERATIONS_JOB_SECRET; else process.env.OPERATIONS_JOB_SECRET = previous; });
  for (const [status, code] of [[409, "REPLAY"], [429, "RATE_LIMIT"]] as const) {
    const response = await handleStorageProbeRequest(request(), { runJob: async () => ({ status, body: { job: "storage-probe", code } }) });
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    if (status === 429) assert.equal(response.headers.get("retry-after"), "300");
  }
  let expectedTrace = "";
  const failure = await handleStorageProbeRequest(request(), { runJob: async (input) => {
    expectedTrace = input.requestId.replaceAll("-", "");
    throw new Error("synthetic-secret-provider-connection-detail");
  } });
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get("x-trace-id"), expectedTrace);
  const body = await failure.json();
  assert.equal(body.code, "OPERATIONS_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(body), /synthetic-secret|connection-detail/u);
});
