import assert from "node:assert/strict";
import test from "node:test";
import { handleCommunitySitesCron } from "../src/modules/community-sites/infrastructure/community-sites-cron";
import { validateProvisioningStepResult, type CommunitySiteProvisioningStepResult } from "../src/modules/community-sites/infrastructure/provisioning-worker";

test("provider steps cannot regress, invent success, or persist credentials as resource metadata", () => {
  assert.equal(validateProvisioningStepResult("QUEUED", { checkpoint: "DATABASE_CREATED", resources: { neonProjectId: "synthetic-id" } }).checkpoint, "DATABASE_CREATED");
  assert.equal(validateProvisioningStepResult("DEPLOYMENT_CREATED", { checkpoint: "DEPLOYMENT_CREATED", resources: {}, pending: true }).pending, true);
  const invalid: CommunitySiteProvisioningStepResult[] = [
    { checkpoint: "QUEUED", resources: {} },
    { checkpoint: "UNKNOWN", resources: {} },
    { checkpoint: "VERIFIED", resources: {}, completed: true },
    { checkpoint: "DEPLOYMENT_READY", resources: {}, completed: true, origin: "https://synthetic.example" },
    { checkpoint: "VERIFIED", resources: {}, completed: true, origin: "https://synthetic.example/path" },
    { checkpoint: "VERIFIED", resources: {}, completed: true, pending: true, origin: "https://synthetic.example" },
    { checkpoint: "DATABASE_READY", resources: { databaseUrl: "postgres://synthetic.invalid" } },
    { checkpoint: "DATABASE_READY", resources: { projectId: "postgres://synthetic.invalid" } },
    { checkpoint: "DATABASE_READY", resources: { accessToken: "do-not-persist" } },
  ];
  for (const value of invalid) assert.throws(() => validateProvisioningStepResult("DATABASE_CREATED", value), /INVALID_PROVIDER_RESULT/);
});
test("cron rejects missing/incorrect bearer, extra query, non-hub runtime before work and redacts job identity", async () => {
  const secret = "synthetic-cron-secret-with-at-least-32-characters";
  let calls = 0;
  const run = async () => { calls += 1; return { kind: "completed" as const, jobId: "private-job-id" }; };
  const request = (authorization?: string, suffix = "") => new Request(`https://hub.example/api/cron/community-sites${suffix}`, { headers: authorization ? { authorization } : {} });
  for (const req of [request(), request("Bearer incorrect"), request(`Bearer ${secret}`, "?force=true")]) {
    assert.equal((await handleCommunitySitesCron(req, { enabled: true, secret, run })).status, 401);
  }
  assert.equal((await handleCommunitySitesCron(request(`Bearer ${secret}`), { enabled: false, secret, run })).status, 503);
  assert.equal(calls, 0);
  const response = await handleCommunitySitesCron(request(`Bearer ${secret}`), { enabled: true, secret, run });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { job: "community-sites", kind: "completed" });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const failed = await handleCommunitySitesCron(request(`Bearer ${secret}`), { enabled: true, secret, run: async () => { throw new Error("sensitive provider value"); } });
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /sensitive provider value/);
});
