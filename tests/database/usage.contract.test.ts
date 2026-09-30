import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { PostgresUsageRepository } from "../../src/modules/usage/infrastructure/postgres-usage";
import { usageRange, type UsageEvent } from "../../src/modules/usage/domain/usage";

test("usage storage: idempotency, KST days, visits, identity transitions, staff exclusions and durable limits", async () => {
  const connectionString = process.env.TEST_DATABASE_URL!;
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString);
  const repo = new PostgresUsageRepository(pool);
  const a = randomUUID(), b = randomUUID(), admin = randomUUID(), visitor = randomUUID();
  const event = (route = "/players", kind: UsageEvent["kind"] = "page", target: string | null = null): UsageEvent => ({ id: randomUUID(), route, kind, target });
  const now = new Date("2026-09-30T02:00:00Z");
  const range = usageRange("2026-09-01", "2026-09-30", now);
  try {
    if (!(await pool.query("SELECT to_regnamespace('usage') AS schema")).rows[0].schema) {
      const folder = resolve(".tmp/usage-upgrade-migrations");
      await mkdir(resolve(folder, "meta"), { recursive: true });
      const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
      journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag !== "0047_usage_analytics");
      for (const entry of journal.entries) await copyFile(`drizzle/${entry.tag}.sql`, resolve(folder, `${entry.tag}.sql`));
      await writeFile(resolve(folder, "meta/_journal.json"), JSON.stringify(journal));
      await applyMigrations(database, folder);
      assert.equal((await pool.query("SELECT to_regnamespace('usage') AS schema")).rows[0].schema, null);
    }
    await applyMigrations(database);
    await applyMigrations(database);
    // Isolated database only; other contract fixtures may share the cluster.
    await pool.query("TRUNCATE usage.events, usage.visitors");
    await pool.query("UPDATE usage.collection SET first_event_at=NULL,bucket_at='2026-09-01',bucket_count=0");
    for (const [id, role] of [[a, "USER"], [b, "USER"], [admin, "SUPER_ADMIN"]]) await pool.query(`INSERT INTO auth.user_accounts(id,login_id,login_id_normalized,role,status) VALUES($1::uuid,$1::text,$1::text,$2,'APPROVED')`, [id, role]);
    assert.equal((await repo.report(range)).coverage.firstEventAt, null);
    const first = event();
    const stamp = new Date("2026-09-01T14:50:00Z");
    assert.equal(await repo.record(first, visitor, a, stamp), "saved");
    assert.deepEqual(await Promise.all([repo.record(first, visitor, a, stamp), repo.record(first, visitor, a, stamp)]), ["duplicate", "duplicate"]);
    await repo.record(event("/players", "click", "/players/:id"), visitor, a, new Date("2026-09-01T14:59:00Z"));
    await repo.record(event("/players/:id"), visitor, a, new Date("2026-09-01T15:01:00Z"));
    await repo.record(event("/rankings"), visitor, a, new Date("2026-09-01T15:31:00Z"));
    await repo.record(event(), visitor, b, new Date("2026-09-01T15:32:00Z"));
    await repo.record(event(), randomUUID(), a, new Date("2026-09-01T15:33:00Z"));
    await repo.record(event(), randomUUID(), null, new Date("2026-09-01T15:34:00Z"));
    await repo.record(event(), randomUUID(), admin, new Date("2026-09-01T15:35:00Z"));
    const report = await repo.report(range);
    assert.equal(report.summary.members, 2);
    assert.equal(report.summary.browsers, 3);
    assert.equal(report.summary.guests, 1);
    assert.equal(report.summary.views, 6);
    assert.equal(report.summary.visits, 5);
    assert.equal(report.daily.find((d) => d.date === "2026-09-01")?.browsers, 1);
    assert.equal(report.daily.find((d) => d.date === "2026-09-02")?.members, 2);
    assert.equal(report.daily.find((d) => d.date === "2026-09-03")?.browsers, 0);
    assert.equal(report.monthly[0].averageVisits, 2);
    assert.equal(report.monthly[0].medianVisits, 2);
    assert.equal(report.monthly[0].averageDays, 1.5);
    assert.equal(report.monthly[0].returningMembers, 1);
    assert.deepEqual(report.paths.map((p) => [p.from,p.to]), [["/players","/players/:id"]]);
    assert.equal((await repo.report(range, [b])).summary.members, 1);
    assert.equal((await repo.report(usageRange("2026-08-01", "2026-08-31", now))).summary.views, 0);
    await pool.query("UPDATE usage.visitors SET bucket_at=$1,bucket_count=120 WHERE id=$2", [now,visitor]);
    assert.equal(await repo.record(event(), visitor, a, now), "limited");
    assert.equal(await repo.record(event(), visitor, a, new Date(now.getTime()+60000)), "saved");
    await pool.query("UPDATE usage.collection SET bucket_at=$1,bucket_count=6000", [now]);
    assert.equal(await repo.record(event(), randomUUID(), null, now), "limited");
  } finally { await pool.end(); }
});
