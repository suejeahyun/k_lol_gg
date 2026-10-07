import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../src/platform/db/schema/index";
import type { V2Database } from "../src/platform/db/database";
import { mmrMatchResultEvents, mmrPlayerPositionProfiles, mmrPlayerProfiles, mmrProjectionStates } from "../src/platform/db/schema/mmr";
import { PostgresMmrRepository } from "../src/modules/mmr/infrastructure/postgres-mmr-repository";
import { MMR_FORMULA_VERSION, MMR_POSITIONS, rebuildMmrProjection } from "../src/modules/mmr/domain/mmr-projection";
import { canonicalMmrJson, loadMmrReadonlyLedger, mmrReadonlySourceEvidence, sha256 } from "./mmr-readonly-source";

type Digest = { count: number; sha256: string };
type Baseline = {
  version: 1;
  mode: "before";
  status: "PASS";
  targetFingerprint: string;
  sourceEvidence: typeof mmrReadonlySourceEvidence;
  summary: { generation: number; formulaVersion: string };
  generationOne: Record<string, Digest>;
  manualAdjustments: Digest;
  pendingEvents: Digest;
  ledgerChecksum: string;
  preview: { sourceMatchCount: number; sourceGameCount: number; sourceAdjustmentCount: number };
};

function digestRows(rows: readonly unknown[]): Digest {
  const values = rows.map(canonicalMmrJson).sort();
  return { count: values.length, sha256: sha256(values.join("\n")) };
}
const same = (left: unknown, right: unknown) => canonicalMmrJson(left) === canonicalMmrJson(right);

async function immutableGeneration(client: Client, generation: number) {
  const result: Record<string, Digest> = {};
  for (const [table, column] of [
    ["player_profiles", "generation"], ["player_position_profiles", "generation"],
    ["match_result_events", "generation"], ["projection_runs", "result_generation"],
  ]) {
    const rows = await client.query(`SELECT to_jsonb(t) AS payload FROM mmr.${table} t WHERE ${column}=$1`, [generation]);
    result[table] = digestRows(rows.rows.map((row) => row.payload));
  }
  return result;
}

let stage = "arguments";
async function main() {
  const [mode, environmentFile, output, baselineFile] = process.argv.slice(2);
  assert.ok(mode === "before" || mode === "after");
  assert.ok(environmentFile && output);
  assert.ok(!existsSync(output), "Use a new evidence filename; existing evidence is never overwritten");
  const baseline: Baseline | null = mode === "after" ? JSON.parse(readFileSync(baselineFile, "utf8")) as Baseline : null;
  if (mode === "after") assert.ok(baseline?.version === 1 && baseline.mode === "before" && baseline.status === "PASS");
  const environment = parseEnv(readFileSync(environmentFile, "utf8"));
  assert.ok(environment.DATABASE_URL);
  const target = new URL(environment.DATABASE_URL);
  const targetFingerprint = sha256(target.host + target.pathname).slice(0, 16);
  if (baseline) assert.equal(targetFingerprint, baseline.targetFingerprint);
  const client = new Client({ connectionString: environment.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    stage = "readonly_snapshot";
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const settings = (await client.query("SELECT current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,transaction_timestamp() AS snapshot_at")).rows[0];
    assert.equal(settings.read_only, "on");
    assert.equal(settings.isolation, "repeatable read");
    const database = drizzle(client, { schema }) as V2Database;
    const repository = new PostgresMmrRepository(database);
    const summary = await repository.getSummary();
    const state = (await database.select().from(mmrProjectionStates).where(eq(mmrProjectionStates.key, "GLOBAL")))[0];
    assert.ok(state);
    stage = "source_replay";
    const ledger = await loadMmrReadonlyLedger(database);
    const ledgerChecksum = sha256(canonicalMmrJson(ledger));
    const projection = rebuildMmrProjection({ generation: mode === "before" ? summary.generation + 1 : summary.generation, matches: ledger.matches, manualAdjustments: ledger.adjustments });
    const preview = { sourceMatchCount: projection.sourceMatchCount, sourceGameCount: projection.sourceGameCount, sourceAdjustmentCount: projection.sourceAdjustmentCount, profileCount: projection.profiles.length, positionCount: projection.profiles.length * MMR_POSITIONS.length, eventCount: projection.matchEvents.length };
    const generationOne = await immutableGeneration(client, 1);
    const manualAdjustments = digestRows((await client.query("SELECT to_jsonb(t) AS payload FROM mmr.manual_adjustments t")).rows.map((row) => row.payload));
    const pendingEvents = digestRows((await client.query(`SELECT e.id AS "outboxEventId",e.aggregate_id AS "matchId",e.match_revision::text AS "matchRevision",encode(e.input_digest,'hex') AS "inputDigest"
      FROM competition.match_recalculation_outbox e LEFT JOIN mmr.consumer_receipts r ON r.outbox_event_id=e.id WHERE r.outbox_event_id IS NULL`)).rows);
    const checks: Record<string, boolean> = { ready: summary.status === "READY", pendingCountConsistent: summary.pendingSourceCount === pendingEvents.count };
    let verification: Record<string, unknown> = {};
    if (mode === "before") {
      checks.legacyGenerationOne = summary.generation === 1 && summary.formulaVersion === "V1_INTERNAL_MMR_1";
      checks.legacyProfilesExist = generationOne.player_profiles.count > 0;
      checks.transitionRequired = summary.formulaTransition === "ADMIN_RECALCULATION_REQUIRED";
    } else if (baseline) {
      stage = "published_projection_comparison";
      checks.sameCalculationSource = same(baseline.sourceEvidence, mmrReadonlySourceEvidence);
      checks.generationAdvancedOnce = summary.generation === baseline.summary.generation + 1;
      checks.newFormulaActive = summary.formulaVersion === MMR_FORMULA_VERSION && summary.formulaTransition === null;
      checks.generationOnePreserved = same(generationOne, baseline.generationOne);
      checks.manualAdjustmentsUnchanged = same(manualAdjustments, baseline.manualAdjustments);
      checks.sourceLedgerUnchangedSinceBefore = ledgerChecksum === baseline.ledgerChecksum;
      checks.publishedChecksumMatchesReplay = state.sourceChecksum?.toString("hex") === ledgerChecksum;
      checks.sourceCountsMatchReplay = summary.sourceMatchCount === preview.sourceMatchCount && summary.sourceGameCount === preview.sourceGameCount && summary.sourceAdjustmentCount === preview.sourceAdjustmentCount;
      checks.pendingZero = pendingEvents.count === 0;
      const profiles = await database.select({ playerId: mmrPlayerProfiles.playerId, generation: mmrPlayerProfiles.generation, overallScoreBp: mmrPlayerProfiles.overallScoreBp, confidenceBp: mmrPlayerProfiles.confidenceBp, sampleSize: mmrPlayerProfiles.sampleSize, formulaVersion: mmrPlayerProfiles.formulaVersion }).from(mmrPlayerProfiles).where(eq(mmrPlayerProfiles.generation, summary.generation));
      const positions = await database.select({ playerId: mmrPlayerPositionProfiles.playerId, position: mmrPlayerPositionProfiles.position, scoreBp: mmrPlayerPositionProfiles.scoreBp, sampleSize: mmrPlayerPositionProfiles.sampleSize }).from(mmrPlayerPositionProfiles).where(eq(mmrPlayerPositionProfiles.generation, summary.generation));
      const events = await database.select({ sourceEventId: mmrMatchResultEvents.sourceEventId, matchId: mmrMatchResultEvents.matchId, gameId: mmrMatchResultEvents.gameId, gameNumber: mmrMatchResultEvents.gameNumber, playerId: mmrMatchResultEvents.playerId, team: mmrMatchResultEvents.team, position: mmrMatchResultEvents.position, won: mmrMatchResultEvents.won, expectedWinRateBp: mmrMatchResultEvents.expectedWinRateBp, actualPerformanceBp: mmrMatchResultEvents.actualPerformanceBp, overallDeltaBp: mmrMatchResultEvents.overallDeltaBp, positionDeltaBp: mmrMatchResultEvents.positionDeltaBp, formulaVersion: mmrMatchResultEvents.formulaVersion }).from(mmrMatchResultEvents).where(eq(mmrMatchResultEvents.generation, summary.generation));
      const expectedProfiles = projection.profiles.map((profile) => ({ playerId: profile.playerId, generation: profile.generation, overallScoreBp: profile.overallScoreBp, confidenceBp: profile.confidenceBp, sampleSize: profile.sampleSize, formulaVersion: MMR_FORMULA_VERSION }));
      const expectedPositions = projection.profiles.flatMap((profile) => MMR_POSITIONS.map((position) => ({ playerId: profile.playerId, position, ...profile.positions[position] })));
      checks.profilesMatchReplay = same(digestRows(profiles), digestRows(expectedProfiles));
      checks.positionsMatchReplay = same(digestRows(positions), digestRows(expectedPositions));
      checks.eventsMatchReplay = same(digestRows(events), digestRows(projection.matchEvents));
      stage = "admin_run_and_receipts";
      const runs = (await client.query(`SELECT r.trigger,r.base_generation::int AS "baseGeneration",r.result_generation::int AS "resultGeneration",r.actor_user_account_id IS NOT NULL AS "hasActor",u.role AS "currentActorRole",encode(r.source_checksum,'hex') AS checksum,r.source_match_count AS "sourceMatchCount",r.source_game_count AS "sourceGameCount",r.source_adjustment_count AS "sourceAdjustmentCount"
        FROM mmr.projection_runs r LEFT JOIN auth.user_accounts u ON u.id=r.actor_user_account_id WHERE r.result_generation=$1`, [summary.generation])).rows;
      checks.adminRun = runs.length === 1 && runs[0].trigger === "ADMIN" && runs[0].baseGeneration === baseline.summary.generation && runs[0].hasActor && runs[0].currentActorRole === "SUPER_ADMIN";
      checks.runChecksumAndCounts = runs.length === 1 && runs[0].checksum === ledgerChecksum && runs[0].sourceMatchCount === preview.sourceMatchCount && runs[0].sourceGameCount === preview.sourceGameCount && runs[0].sourceAdjustmentCount === preview.sourceAdjustmentCount;
      const receipts = (await client.query(`SELECT r.outbox_event_id AS "outboxEventId",r.match_id AS "matchId",r.match_revision::text AS "matchRevision",encode(r.input_digest,'hex') AS "inputDigest"
        FROM mmr.consumer_receipts r JOIN mmr.projection_runs p ON p.id=r.run_id AND p.result_generation=r.generation WHERE r.generation=$1`, [summary.generation])).rows;
      checks.beforePendingConsumedExactly = same(digestRows(receipts), baseline.pendingEvents);
      const audit = (await client.query(`SELECT count(*)::int AS count FROM mmr.projection_runs r JOIN mmr.outbox o ON o.run_id=r.id AND o.generation=r.result_generation JOIN audit.events a ON a.request_id=o.request_id AND a.actor_user_account_id=r.actor_user_account_id
        WHERE r.result_generation=$1 AND o.event_type='MMR_PROJECTION_REBUILT' AND a.action='MMR_PROJECTION_REBUILT' AND a.target_type='MMR_PROJECTION' AND a.target_id='GLOBAL' AND (a.before_json->>'generation')::int=$2 AND (a.after_json->>'generation')::int=$1 AND a.after_json->>'formulaVersion'=$3 AND a.after_json->>'sourceChecksum'=$4`, [summary.generation, baseline.summary.generation, MMR_FORMULA_VERSION, ledgerChecksum])).rows[0].count;
      checks.auditAndOutboxLinked = audit === 1;
      const commands = (await client.query(`SELECT count(*)::int AS count FROM mmr.command_receipts c JOIN mmr.projection_runs r ON r.actor_user_account_id=c.actor_user_account_id
        WHERE r.result_generation=$1 AND c.scope='admin:mmr:recalculate' AND c.response_status=200 AND (c.response_json->>'generation')::int=$1 AND (c.response_json->>'revision')::int=$1 AND (c.response_json->>'consumedEventCount')::int=$2`, [summary.generation, baseline.pendingEvents.count])).rows[0].count;
      checks.successfulAdminCommandReceipt = commands === 1;
      verification = { publishedProfiles: digestRows(profiles), publishedPositions: digestRows(positions), publishedEvents: digestRows(events), consumedEvents: digestRows(receipts), adminRunCount: runs.length, linkedAuditCount: audit, successfulCommandReceiptCount: commands };
    }
    checks.sameSnapshotSummaryUnchanged = same(summary, await repository.getSummary());
    await client.query("ROLLBACK");
    stage = "aggregate_evidence";
    const report = { version: 1, mode, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", checkedAt: new Date().toISOString(), snapshot: { at: settings.snapshot_at, readOnly: true, isolation: settings.isolation, timezone: "UTC", endedWith: "ROLLBACK" }, targetFingerprint, sourceEvidence: mmrReadonlySourceEvidence, summary, ledgerChecksum, preview, generationOne, manualAdjustments, pendingEvents, checks, verification, limitations: ["Only aggregate counts and SHA256 digests are retained; source rows and identities stay in process memory.", "An after check fails closed if source events or generation changed after the before snapshot; inspect concurrency before diagnosing a product failure.", "Current actor role is checked at verification time; no session, credential or authorization data is changed.", "Provider cron execution must be checked separately; this script invokes no cron or mutation."] };
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ mode, status: report.status, generation: summary.generation, checks }));
    if (report.status !== "PASS") process.exitCode = 1;
  } finally { await client.end(); }
}

main().catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  console.error(JSON.stringify({ status: "FAILED", stage, code: typeof code === "string" && /^[A-Z0-9_]{1,40}$/u.test(code) ? code : "REDACTED" }));
  process.exitCode = 1;
});
