import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../src/platform/db/schema/index";
import type { V2Database } from "../src/platform/db/database";
import { mmrPlayerProfiles, mmrPlayerPositionProfiles } from "../src/platform/db/schema/mmr";
import { players } from "../src/platform/db/schema/registry";
import { PostgresMmrRepository } from "../src/modules/mmr/infrastructure/postgres-mmr-repository";
import { MMR_FORMULA_VERSION, MMR_POSITIONS, rebuildMmrProjection } from "../src/modules/mmr/domain/mmr-projection";
import { loadMmrReadonlyLedger, mmrReadonlySourceEvidence } from "./mmr-readonly-source";

function changeSummary(values: number[], divisor = 1) {
  return {
    compared: values.length,
    changed: values.filter((value) => value !== 0).length,
    increased: values.filter((value) => value > 0).length,
    decreased: values.filter((value) => value < 0).length,
    unchanged: values.filter((value) => value === 0).length,
    minimum: values.length ? Math.min(...values) / divisor : null,
    maximum: values.length ? Math.max(...values) / divisor : null,
    mean: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length / divisor).toFixed(4)) : null,
  };
}

async function main() {
  const environmentFile = process.argv[2];
  assert.ok(environmentFile, "Pass the existing verified production environment file path as the first argument");
  const environment = parseEnv(readFileSync(environmentFile, "utf8"));
  assert.ok(environment.DATABASE_URL, "Required existing database binding is absent");
  const client = new Client({ connectionString: environment.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const settings = (await client.query("select current_setting('transaction_read_only') as read_only, current_setting('transaction_isolation') as isolation, transaction_timestamp() as snapshot_at")).rows[0];
    assert.equal(settings.read_only, "on");
    assert.equal(settings.isolation, "repeatable read");
    const database = drizzle(client, { schema }) as V2Database;
    const repository = new PostgresMmrRepository(database);
    const before = await repository.getSummary();
    assert.equal(before.status, "READY");
    const ledger = await loadMmrReadonlyLedger(database);
    const projected = rebuildMmrProjection({ generation: before.generation + 1, matches: ledger.matches, manualAdjustments: ledger.adjustments });
    const oldProfiles = await database.select({ playerId: mmrPlayerProfiles.playerId, overallScoreBp: mmrPlayerProfiles.overallScoreBp, sampleSize: mmrPlayerProfiles.sampleSize, confidenceBp: mmrPlayerProfiles.confidenceBp }).from(mmrPlayerProfiles).where(eq(mmrPlayerProfiles.generation, before.generation));
    const oldPositions = await database.select({ playerId: mmrPlayerPositionProfiles.playerId, position: mmrPlayerPositionProfiles.position, scoreBp: mmrPlayerPositionProfiles.scoreBp, sampleSize: mmrPlayerPositionProfiles.sampleSize }).from(mmrPlayerPositionProfiles).where(eq(mmrPlayerPositionProfiles.generation, before.generation));
    const activeRows = await database.select({ id: players.id }).from(players).where(eq(players.status, "ACTIVE"));
    const activeIds = new Set(activeRows.map((row) => row.id));
    const oldById = new Map(oldProfiles.map((row) => [row.playerId, row]));
    const newById = new Map(projected.profiles.map((row) => [row.playerId, row]));
    const common = projected.profiles.filter((row) => oldById.has(row.playerId));
    const activeBefore = oldProfiles.filter((row) => activeIds.has(row.playerId));
    const activeAfter = projected.profiles.filter((row) => activeIds.has(row.playerId));
    const byScore = (a: { playerId: string; overallScoreBp: number; sampleSize: number }, b: { playerId: string; overallScoreBp: number; sampleSize: number }) => b.overallScoreBp - a.overallScoreBp || b.sampleSize - a.sampleSize || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
    const oldRanks = new Map([...activeBefore].sort(byScore).map((row, index) => [row.playerId, index + 1]));
    const newRanks = new Map([...activeAfter].sort(byScore).map((row, index) => [row.playerId, index + 1]));
    const sharedActive = activeAfter.filter((row) => oldRanks.has(row.playerId));
    const positionChanges = MMR_POSITIONS.map((position) => {
      const comparable = oldPositions.filter((row) => row.position === position && newById.has(row.playerId));
      return { position, scorePoints: changeSummary(comparable.map((row) => newById.get(row.playerId)!.positions[position].scoreBp - row.scoreBp), 100), sample: changeSummary(comparable.map((row) => newById.get(row.playerId)!.positions[position].sampleSize - row.sampleSize)) };
    });
    const summaryAfterReads = await repository.getSummary();
    assert.deepEqual(summaryAfterReads, before);
    const repeat = rebuildMmrProjection({ generation: before.generation + 1, matches: ledger.matches, manualAdjustments: ledger.adjustments });
    assert.deepEqual(repeat, projected);
    await client.query("ROLLBACK");
    const evidence = {
      checkedAt: new Date().toISOString(),
      mode: "READ_ONLY_PREVIEW_NO_PUBLICATION",
      databaseBinding: "Existing production binding previously verified by matching authenticated storage-probe runId; connection details omitted",
      snapshot: { at: settings.snapshot_at, readOnly: settings.read_only === "on", isolation: settings.isolation, endedWith: "ROLLBACK" },
      sourceEvidence: { ...mmrReadonlySourceEvidence, mapper: "Exact private loadLedger implementation extracted from current repository; SELECT only", summary: "Actual PostgresMmrRepository.getSummary", rankOrdering: "ACTIVE profiles only; overall score descending, overall sample descending, playerId ascending; same as repository listPlayers" },
      before,
      preview: { generation: projected.generation, formulaVersion: MMR_FORMULA_VERSION, sourceMatchCount: projected.sourceMatchCount, sourceGameCount: projected.sourceGameCount, sourceAdjustmentCount: projected.sourceAdjustmentCount, profileCount: projected.profiles.length, playerMatchResultEventCount: projected.matchEvents.length },
      coverage: { beforeProfiles: oldProfiles.length, afterProfiles: projected.profiles.length, commonProfiles: common.length, addedProfiles: projected.profiles.filter((row) => !oldById.has(row.playerId)).length, removedProfiles: oldProfiles.filter((row) => !newById.has(row.playerId)).length, activeBefore: activeBefore.length, activeAfter: activeAfter.length, sharedActive: sharedActive.length },
      commonProfileChanges: { overallScorePoints: changeSummary(common.map((row) => row.overallScoreBp - oldById.get(row.playerId)!.overallScoreBp), 100), sample: changeSummary(common.map((row) => row.sampleSize - oldById.get(row.playerId)!.sampleSize)), confidencePercentagePoints: changeSummary(common.map((row) => row.confidenceBp - oldById.get(row.playerId)!.confidenceBp), 100) },
      activeRankChanges: { signConvention: "positive = rank improved; includes effects of newly included players", ...changeSummary(sharedActive.map((row) => oldRanks.get(row.playerId)! - newRanks.get(row.playerId)!)) },
      positionChanges,
      verification: { sameSnapshotSummaryUnchanged: true, pureReplayDeterministic: true, operationalMutationCalled: false, operationalAuthenticationMutated: false, rawPersonalDataWritten: false },
      limitations: ["This preview combines formula change and previously unconsumed published match data; it does not isolate formula-only impact.", "The execution may see later source events; refresh this read-only preview before a delayed approval.", "No new generation or receipt was published. Production still requires actual authorized SUPER_ADMIN command execution."]
    };
    const target = process.argv[3] ?? "docs/qa-evidence/service-followup-2026-10-06/mmr-transition-impact.json";
    writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ evidence: target, before: evidence.before, preview: evidence.preview, coverage: evidence.coverage, commonProfileChanges: evidence.commonProfileChanges, activeRankChanges: evidence.activeRankChanges }));
  } finally { await client.end(); }
}
main().catch((error: unknown) => {
  const candidate = error as { code?: unknown; name?: unknown };
  console.error(JSON.stringify({ result: "FAILED", name: typeof candidate?.name === "string" ? candidate.name : "Error", code: typeof candidate?.code === "string" && /^[A-Z0-9_]{1,40}$/u.test(candidate.code) ? candidate.code : "REDACTED" }));
  process.exitCode = 1;
});
