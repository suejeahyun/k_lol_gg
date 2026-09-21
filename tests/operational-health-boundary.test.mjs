import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("operational diagnostics remain admin-only server rendering with no polling or mutation", async () => {
  const [page, panel, reader, publicHealth, publicSettings] = await Promise.all([
    source("src/app/(admin)/admin/page.tsx"), source("src/app/(admin)/admin/operational-health.tsx"),
    source("src/modules/operations/infrastructure/postgres-operational-health.ts"),
    source("src/app/api/health/route.ts"), source("src/app/api/site-settings/route.ts"),
  ]);
  assert.ok(page.indexOf('await requirePageRole("ADMIN", "/admin")') < page.indexOf("repository.getOperationalHealth()"));
  assert.doesNotMatch(page + panel, /["']use client["']|setInterval|setTimeout|useEffect|fetch\(/u);
  assert.match(reader, /accessMode: "read only"/u);
  assert.match(reader, /statement_timeout = '5s'/u);
  assert.match(reader, /lock_timeout = '1s'/u);
  assert.doesNotMatch(reader, /\.insert\(|\.update\(|\.delete\(|\.select\(\)/u);
  assert.doesNotMatch(publicHealth + publicSettings, /[Oo]perationalHealth|siteNotices|maintenanceRuns|riotSyncJobs/u);
  assert.match(panel, /실제 휴대폰 수신은 미확인/u);
  assert.match(panel, /빈 대기열 호출 기록/u);
  assert.match(panel, /최근 인증 요청/u);
  assert.match(panel, /외부로 장애 알림을 보내지 않습니다/u);
});
