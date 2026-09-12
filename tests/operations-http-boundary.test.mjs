import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("public operations endpoints expose bounded settings and minimum health only", async () => {
  const [settings, health] = await Promise.all([
    source("src/app/api/site-settings/route.ts"),
    source("src/app/api/health/route.ts"),
  ]);
  assert.match(settings, /toPublicSiteSettingsDto/);
  assert.doesNotMatch(settings, /internalMaintenanceNote|aiAllowedRoles/);
  assert.match(health, /status: "ready"/);
  assert.doesNotMatch(health, /DATABASE_URL|latency|host|version/);
});

test("admin mutations and downloads retain strong server authorization boundaries", async () => {
  const [settings, backup, ai] = await Promise.all([
    source("src/app/api/admin/site-settings/route.ts"),
    source("src/app/api/admin/backups/[kind]/route.ts"),
    source("src/app/api/ai/chat/route.ts"),
  ]);
  assert.match(settings, /requireOperationsApiSession\("SUPER_ADMIN"\)/);
  assert.match(settings, /prepareOperationsMutation/);
  assert.match(backup, /requireOperationsApiSession\("SUPER_ADMIN"\)/);
  assert.match(backup, /Content-Disposition/);
  assert.match(ai, /requireOperationsApiSession\("USER"\)/);
  assert.match(ai, /prepareOperationsMutation/);
});

test("internal maintenance requires a signed job and never accepts session authorization", async () => {
  const route = await source("src/app/api/internal/jobs/maintenance/route.ts");
  const verifier = await source("src/modules/operations/infrastructure/signed-job-http.ts");
  assert.match(route, /verifyOperationsJobHttpRequest/);
  assert.doesNotMatch(route, /authorizeApiRole|requireOperationsApiSession|getCurrentSession/);
  assert.match(verifier, /OPERATIONS_JOB_SECRET/);
  assert.match(verifier, /x-job-signature/);
  assert.match(verifier, /x-job-nonce/);
});

test("Vercel invokes only the daily Kakao close GET through an exact Bearer boundary", async () => {
  const [route, verifier, configuration] = await Promise.all([
    source("src/app/api/cron/kakao-daily-close/route.ts"),
    source("src/modules/operations/infrastructure/vercel-kakao-daily-close.ts"),
    source("vercel.json"),
  ]);
  assert.match(route, /export async function GET/);
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /verifyVercelCronBearer/);
  assert.match(route, /runSignedKakaoDailyClose/);
  assert.doesNotMatch(route, /fetch\(|authorizeApiRole|requireOperationsApiSession|getCurrentSession/);
  assert.match(verifier, /timingSafeEqual/);
  assert.match(verifier, /recruitingOperatingDateKey/);
  assert.doesNotMatch(verifier, /OPERATIONS_JOB_SECRET|process\.env|console\./);
  assert.deepEqual(JSON.parse(configuration).crons, [{
    path: "/api/cron/kakao-daily-close",
    schedule: "0 21 * * *",
  }]);
});
