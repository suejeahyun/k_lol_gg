import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool, type PoolClient } from "pg";

import {
  assertChampionImageBackfillReady,
  planChampionImageBackfill,
  type ChampionImageBackfillPlan,
  type ChampionImageRow,
} from "../../src/modules/champions/domain/champion-image-backfill";
import { DATA_DRAGON_VERSION } from "../../src/modules/champions/domain/data-dragon-catalog";

type Backup = Readonly<{
  schemaVersion: 1;
  dataDragonVersion: string;
  createdAt: string;
  rows: readonly Readonly<{
    key: string;
    previousImageUrl: string | null;
    backfilledImageUrl: string;
  }>[];
}>;

type Options = Readonly<{
  apply: boolean;
  backupFile: string | null;
  rollbackFile: string | null;
  confirmVersion: string | null;
}>;

function options(argv: readonly string[]): Options {
  let apply = false;
  let backupFile: string | null = null;
  let rollbackFile: string | null = null;
  let confirmVersion: string | null = null;
  for (const argument of argv) {
    if (argument === "--apply") apply = true;
    else if (argument.startsWith("--backup-file=")) backupFile = argument.slice(14);
    else if (argument.startsWith("--rollback=")) rollbackFile = argument.slice(11);
    else if (argument.startsWith("--confirm-version=")) confirmVersion = argument.slice(18);
    else throw new Error("UNKNOWN_ARGUMENT:" + argument);
  }
  if (apply && rollbackFile) throw new Error("APPLY_AND_ROLLBACK_ARE_MUTUALLY_EXCLUSIVE");
  if (apply && !backupFile) throw new Error("APPLY_REQUIRES_BACKUP_FILE");
  if ((apply || rollbackFile) && confirmVersion !== DATA_DRAGON_VERSION) {
    throw new Error("CONFIRM_VERSION_REQUIRED:" + DATA_DRAGON_VERSION);
  }
  return { apply, backupFile, rollbackFile, confirmVersion };
}

function connectionString(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL_IS_REQUIRED");
  const parsed = new URL(value);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL_MUST_BE_POSTGRESQL");
  }
  return value;
}

async function rows(client: PoolClient, lock: boolean): Promise<readonly ChampionImageRow[]> {
  const result = await client.query(
    'select key, display_name as "displayName", image_url as "imageUrl" ' +
    'from catalog.champions order by key' + (lock ? " for update" : ""),
  );
  return result.rows.map((row) => ({
    key: String(row.key),
    displayName: String(row.displayName),
    imageUrl: row.imageUrl === null ? null : String(row.imageUrl),
  }));
}

function report(mode: string, plan: ChampionImageBackfillPlan): void {
  process.stdout.write(JSON.stringify({
    mode,
    dataDragonVersion: plan.dataDragonVersion,
    databaseRows: plan.databaseRows,
    matchedRows: plan.matchedRows,
    wouldUpdateRows: plan.wouldUpdateRows,
    alreadyCorrectRows: plan.alreadyCorrectRows,
    unmatchedRows: plan.unmatchedRows,
    conflictRows: plan.conflictRows,
    blockingRows: plan.steps.filter((step) => step.action === "UNMATCHED" || step.action === "CONFLICT"),
  }, null, 2) + "\n");
}

function parseBackup(value: unknown): Backup {
  if (!value || typeof value !== "object") throw new Error("INVALID_BACKUP");
  const backup = value as Partial<Backup>;
  if (
    backup.schemaVersion !== 1 ||
    backup.dataDragonVersion !== DATA_DRAGON_VERSION ||
    !Array.isArray(backup.rows)
  ) throw new Error("INVALID_BACKUP");
  for (const row of backup.rows) {
    if (
      !row || typeof row.key !== "string" ||
      (row.previousImageUrl !== null && typeof row.previousImageUrl !== "string") ||
      typeof row.backfilledImageUrl !== "string"
    ) throw new Error("INVALID_BACKUP_ROW");
  }
  return backup as Backup;
}

async function apply(pool: Pool, backupFile: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const plan = planChampionImageBackfill(await rows(client, true));
    report("apply", plan);
    assertChampionImageBackfillReady(plan);
    const backup: Backup = {
      schemaVersion: 1,
      dataDragonVersion: DATA_DRAGON_VERSION,
      createdAt: new Date().toISOString(),
      rows: plan.steps.flatMap((step) => step.action === "UPDATE" && step.expectedImageUrl ? [{
        key: step.key,
        previousImageUrl: step.currentImageUrl,
        backfilledImageUrl: step.expectedImageUrl,
      }] : []),
    };
    const backupPath = resolve(backupFile);
    await writeFile(backupPath, JSON.stringify(backup, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    for (const row of backup.rows) {
      const result = await client.query(
        "update catalog.champions set image_url = $1, revision = revision + 1, updated_at = now() " +
        "where key = $2 and image_url is not distinct from $3",
        [row.backfilledImageUrl, row.key, row.previousImageUrl],
      );
      if (result.rowCount !== 1) throw new Error("CONCURRENT_CHAMPION_UPDATE:" + row.key);
    }
    await client.query("commit");
    process.stdout.write(`Applied ${backup.rows.length} champion image row(s). Backup: ${backupPath}\n`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function rollback(pool: Pool, rollbackFile: string): Promise<void> {
  const backupPath = resolve(rollbackFile);
  const backup = parseBackup(JSON.parse(await readFile(backupPath, "utf8")));
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const row of backup.rows) {
      const result = await client.query(
        "update catalog.champions set image_url = $1, revision = revision + 1, updated_at = now() " +
        "where key = $2 and image_url = $3",
        [row.previousImageUrl, row.key, row.backfilledImageUrl],
      );
      if (result.rowCount !== 1) throw new Error("ROLLBACK_STATE_MISMATCH:" + row.key);
    }
    await client.query("commit");
    process.stdout.write(`Rolled back ${backup.rows.length} champion image row(s).\n`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const selected = options(process.argv.slice(2));
const pool = new Pool({ connectionString: connectionString(), max: 1, connectionTimeoutMillis: 5_000 });
try {
  if (selected.rollbackFile) await rollback(pool, selected.rollbackFile);
  else if (selected.apply) await apply(pool, selected.backupFile!);
  else {
    const client = await pool.connect();
    try {
      const plan = planChampionImageBackfill(await rows(client, false));
      report("dry-run", plan);
      assertChampionImageBackfillReady(plan);
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
