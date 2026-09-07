import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("Kakao admin API splits ADMIN reads from SUPER TOTP mutations", async () => {
  const [settings, stats, health, adapter, repairUi] = await Promise.all([
    read("src/app/api/admin/kakao/settings/route.ts"),
    read("src/app/api/admin/kakao/stats/route.ts"),
    read("src/app/api/admin/kakao/recruit-health/route.ts"),
    read("src/modules/recruiting/kakao-admin/postgres-kakao-admin.ts"),
    read("src/app/(admin)/admin/kakao/kakao-health-repair.tsx"),
  ]);
  assert.match(settings, /requireOperationsApiSession\("ADMIN"\)/u);
  assert.match(settings, /requireOperationsApiSession\("SUPER_ADMIN"\)/u);
  assert.match(health, /requireOperationsApiSession\("ADMIN"\)/u);
  assert.match(health, /requireOperationsApiSession\("SUPER_ADMIN"\)/u);
  assert.match(stats, /getAdminStatus/u);
  assert.match(repairUi, /REPAIR_EXPIRED_SESSIONS/u);
  assert.match(repairUi, /If-Match/u);
  for (const boundary of ["lockTransactionSessionActor", "ADMIN_MUTATION_SESSION_POLICY", "recruitingCommandReceipts", "auditEvents", "recruitingOutbox", "PRECONDITION_FAILED"]) assert.match(adapter, new RegExp(boundary));
  assert.doesNotMatch(settings + health + stats, /KAKAO_WEBHOOK_SECRET_CURRENT|KAKAO_WEBHOOK_ALLOWED_ROOMS|secretCiphertext/u);
});

test("legacy Kakao admin pages permanently redirect to canonical real-state tabs", async () => {
  const expectations = new Map([
    ["src/app/(admin)/admin/kakao/stats/page.tsx", "/admin/kakao?tab=stats"],
    ["src/app/(admin)/admin/kakao/settings/page.tsx", "/admin/kakao?tab=settings"],
    ["src/app/(admin)/admin/kakao/scrims/page.tsx", "/admin/kakao?tab=scrims"],
    ["src/app/(admin)/admin/kakao/season-apply/page.tsx", "/admin/seasons?view=applications"],
    ["src/app/(admin)/admin/kakao/recruits/logs/page.tsx", "/admin/kakao?tab=logs"],
    ["src/app/(admin)/admin/kakao/recruits/settings/page.tsx", "/admin/kakao?tab=health"],
    ["src/app/(admin)/admin/recruits/page.tsx", "/admin/kakao?tab=recruits"],
    ["src/app/(admin)/admin/logs/kakao/page.tsx", "/admin/kakao?tab=logs"],
  ]);
  for (const [path, destination] of expectations) {
    const source = await read(path);
    assert.match(source, /permanentRedirect/u);
    assert.ok(source.includes(destination));
  }

  const recruitsAlias = await read("src/app/(admin)/admin/kakao/recruits/page.tsx");
  assert.match(recruitsAlias, /parseKakaoAdminTabQuery/);
  assert.match(recruitsAlias, /permanentRedirect\(`\/admin\/kakao\?tab=\$\{tab\}`\)/);
  assert.match(recruitsAlias, /notFound\(\)/);
});

test("every canonical Kakao handler checks the stored feature policy", async () => {
  for (const path of ["search-player", "openchat", "scheduled-notice", "season-applications", "image-receive", "managed-forms", "operation-forms", "recruits"]) {
    const source = await read(`src/app/api/integrations/kakao/${path}/route.ts`);
    assert.match(source, /isRuntimeKakaoFeatureEnabled/u);
  }
});

test("owner image session creation honors site and Kakao feature switches", async () => {
  const [matchSession, disciplineSession] = await Promise.all([
    read("src/app/api/me/match-submissions/[code]/kakao-session/route.ts"),
    read("src/app/api/me/discipline/tasks/[taskId]/kakao-session/route.ts"),
  ]);
  assert.match(matchSession, /requireSiteFeature\(request, "matchSubmissions"\)/u);
  assert.match(matchSession, /action === "CREATE".*isRuntimeKakaoFeatureEnabled\("imageReceiveEnabled"\)/su);
  assert.match(disciplineSession, /action === "CREATE".*isRuntimeKakaoFeatureEnabled\("imageReceiveEnabled"\)/su);
});
