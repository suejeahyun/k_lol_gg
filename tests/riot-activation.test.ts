import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { RiotApplicationError } from "../src/modules/riot/application/riot-application";
import { handleRiotSyncCron } from "../src/modules/riot/infrastructure/riot-sync-cron";
import { handleRiotApiProbeRequest } from "../src/modules/riot/infrastructure/riot-api-probe-http";
import { probeRiotApiKey } from "../src/modules/riot/infrastructure/riot-api-probe";
import { unavailableRiotRso } from "../src/modules/riot/infrastructure/unavailable-riot-rso";
import { signJobRequest, verifyJobRequest } from "../src/modules/operations/infrastructure/job-signature";

const secret = "synthetic-riot-activation-secret-000000000";
const cronSecret = "synthetic-riot-cron-secret-000000000000";
function cronRequest(path = "/api/cron/riot-sync", authorization = `Bearer ${cronSecret}`) {
  return new Request(`https://klol.example${path}`, { headers: { authorization } });
}

test("Riot cron rejects invalid requests before runtime access and noops when unconfigured", async () => {
  let loads = 0;
  const dependencies = { cronSecret, jobSecret: secret, getService: () => { loads++; return null; } };
  for (const request of [cronRequest(undefined, "Bearer invalid"), cronRequest("/api/cron/riot-sync?all=1"), cronRequest("/api/cron/other")]) {
    assert.equal((await handleRiotSyncCron(request, dependencies)).status, 401);
  }
  assert.equal(loads, 0);
  const noop = await handleRiotSyncCron(cronRequest(), dependencies);
  assert.equal(noop.status, 200);
  assert.equal(noop.headers.get("cache-control")?.includes("no-store"), true);
  assert.deepEqual(await noop.json(), { job: "riot-sync", state: "UNCONFIGURED", processed: 0 });
});

test("Riot cron drains a bounded sequential batch with a fresh nonce for each job and safe counters", async () => {
  const nonces = new Set<string>();
  let calls = 0;
  let active = false;
  const dependencies = { cronSecret, jobSecret: secret, getService: () => ({ runNextSync: async (input: Parameters<import("../src/modules/riot/application/riot-application").RiotApplicationService["runNextSync"]>[0]) => {
    assert.equal(active, false, "consumer calls must never overlap");
    active = true;
    calls++;
    assert.equal(input.queueDue, true);
    const intent = input.authorizationIntent;
    assert.equal(verifyJobRequest({ request: { method: "POST", path: "/api/internal/jobs/riot-sync", ...intent }, secret, now: new Date(), nonceAlreadyUsed: false }).ok, true);
    assert.equal(nonces.has(intent.nonce), false);
    nonces.add(intent.nonce);
    await Promise.resolve();
    active = false;
    return { status: "PROCESSED" as const, body: { status: "SUCCEEDED", privateIdentifier: "never-echo" } };
  } }) };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await handleRiotSyncCron(cronRequest(), dependencies);
    assert.deepEqual(await response.json(), { job: "riot-sync", state: "PROCESSED", processed: 4, stopped: "LIMIT", outcome: "SUCCEEDED" });
  }
  assert.equal(calls, 8);
});

test("Riot cron stops on idle, admission deadline and provider retry/partial/failure outcomes", async () => {
  for (const stop of ["IDLE", "TIME_BUDGET", "RETRY_WAIT", "PARTIAL", "FAILED"] as const) {
    let elapsed = 0;
    let calls = 0;
    const response = await handleRiotSyncCron(cronRequest(), {
      cronSecret, jobSecret: secret, monotonicNow: () => elapsed,
      getService: () => ({ runNextSync: async (): ReturnType<import("../src/modules/riot/application/riot-application").RiotApplicationService["runNextSync"]> => {
        calls++;
        if (calls === 1) {
          if (stop === "TIME_BUDGET") elapsed = 20_000;
          return { status: "PROCESSED" as const, body: { status: "SUCCEEDED" } };
        }
        assert.equal(calls, 2, "no additional work may follow a stopping outcome");
        return stop === "IDLE" ? { status: "IDLE" as const }
          : { status: "PROCESSED" as const, body: { status: stop, failureCode: "RATE_LIMITED", privateIdentifier: "not-public" } };
      } }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.stopped, stop);
    assert.equal(body.processed, ["IDLE", "TIME_BUDGET"].includes(stop) ? 1 : 2);
    assert.equal(calls, stop === "TIME_BUDGET" ? 1 : 2);
    assert.equal(JSON.stringify(body).includes("not-public"), false);
    assert.equal(JSON.stringify(body).includes("RATE_LIMITED"), false);
  }
});

test("Riot cron preserves the processed count if a later job fails or the feature is disabled", async () => {
  for (const failure of [new Error("provider-secret"), new RiotApplicationError("FEATURE_DISABLED", "disabled")]) {
    let calls = 0;
    const response = await handleRiotSyncCron(cronRequest(), { cronSecret, jobSecret: secret, getService: () => ({ runNextSync: async () => {
      if (++calls === 2) throw failure;
      return { status: "PROCESSED" as const, body: { status: "SUCCEEDED" } };
    } }) });
    const body = await response.json();
    assert.equal(body.processed, 1);
    assert.equal(calls, 2);
    assert.equal(response.status, failure instanceof RiotApplicationError ? 200 : 503);
    assert.equal(JSON.stringify(body).includes("provider-secret"), false);
  }
});

test("disabled Riot cron is a safe noop; unexpected errors stay opaque", async () => {
  for (const [error, status, state] of [[new RiotApplicationError("FEATURE_DISABLED", "disabled"), 200, "DISABLED"], [new Error("secret-provider-response"), 503, undefined]] as const) {
    const response = await handleRiotSyncCron(cronRequest(), { cronSecret, jobSecret: secret, getService: () => ({ runNextSync: async () => { throw error; } }) });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.state, state);
    assert.equal(JSON.stringify(body).includes("secret-provider-response"), false);
  }
});

test("missing RSO never supplies state or verified identity", async () => {
  assert.throws(() => unavailableRiotRso.issueState("id"), (error) => error instanceof RiotApplicationError && error.code === "FEATURE_DISABLED");
  assert.throws(() => unavailableRiotRso.digestState("state"));
  assert.throws(() => unavailableRiotRso.authorizationUrl({ publicState: "state" }));
  await assert.rejects(unavailableRiotRso.exchangeOnce({ exchangeId: "state", authorizationCode: "code" }));
});

test("key probe requests only fixed KR status once, discards body, and exposes no credentials", async () => {
  let calls = 0;
  const result = await probeRiotApiKey(secret, async (input, init) => {
    calls++;
    assert.equal(input, "https://kr.api.riotgames.com/lol/status/v4/platform-data");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get("x-riot-token"), secret);
    return new Response("provider-private-response", { status: 200 });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true, providerStatus: 200, code: "STATUS_ENDPOINT_ACCEPTED" });
  for (const status of [401, 403, 429, 503]) {
    const failed = await probeRiotApiKey(secret, async () => new Response(secret, { status }));
    assert.equal(failed.ok, false);
    assert.equal(JSON.stringify(failed).includes(secret), false);
  }
  assert.deepEqual(await probeRiotApiKey(secret, async () => { throw new Error(secret); }), { ok: false, providerStatus: null, code: "UPSTREAM_UNAVAILABLE" });
});

test("probe HTTP authenticates exact empty request and rejects caller URLs before invocation", async () => {
  const before = process.env.OPERATIONS_JOB_SECRET;
  process.env.OPERATIONS_JOB_SECRET = secret;
  let calls = 0;
  const run = async () => { calls++; return { status: 200, body: { ok: true } }; };
  const request = (body: string, valid = true, path = "/api/internal/jobs/riot-api-probe") => {
    const unsigned = { method: "POST" as const, path: path.split("?")[0]!, nonce: `probe_${randomUUID().replaceAll("-", "")}`, timestampSeconds: Math.floor(Date.now() / 1000), bodyDigestHex: createHash("sha256").update(body).digest("hex") };
    return new Request(`https://klol.example${path}`, { method: "POST", body, headers: { "x-job-nonce": unsigned.nonce, "x-job-timestamp": String(unsigned.timestampSeconds), "x-job-signature": valid ? signJobRequest(unsigned, secret) : "invalid" } });
  };
  try {
    assert.equal((await handleRiotApiProbeRequest(request("{}", false), { run })).status, 401);
    assert.equal((await handleRiotApiProbeRequest(request('{"url":"https://evil.example"}'), { run })).status, 401);
    assert.equal((await handleRiotApiProbeRequest(request("{}", true, "/api/internal/jobs/riot-api-probe?x=1"), { run })).status, 401);
    assert.equal(calls, 0);
    const response = await handleRiotApiProbeRequest(request("{}"), { run });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
    assert.equal(calls, 1);
  } finally {
    if (before === undefined) delete process.env.OPERATIONS_JOB_SECRET;
    else process.env.OPERATIONS_JOB_SECRET = before;
  }
});
