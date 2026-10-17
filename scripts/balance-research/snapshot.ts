import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/platform/db/schema/index";
import { PostgresTeamBalanceRatingProvider } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-rating-provider";
import { TEAM_BALANCE_POSITIONS, type TeamBalanceEligibility } from "../../src/modules/team-tools/domain/team-balance";
import { createResearchPlayerIdentity } from "./anonymize";

// The only database operation in this research suite. It neither collects names,
// account identifiers nor writes production data. UUIDs are transient join keys.
const [envFile, outputDirectory = ".private/balance-research"] = process.argv.slice(2);
if (!envFile) throw new Error("Usage: tsx scripts/balance-research/snapshot.ts <private-env> [private-output-directory]");
const output = resolve(outputDirectory);
if (!output.includes(`${process.platform === "win32" ? "\\" : "/"}.private${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("PRIVATE_OUTPUT_REQUIRED");
const env = parseEnv(await readFile(envFile, "utf8"));
if (!env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
if (/SENSITIVE|ENCRYPTED|redacted/i.test(env.DATABASE_URL)) throw new Error("UNMASKED_DATABASE_URL_REQUIRED");
const priorProductionEvidence = JSON.parse(await readFile("docs/qa-evidence/stable-recruit-codes-2026-10-14/production-migration.json", "utf8"));
let targetUrl: URL;
try { targetUrl = new URL(env.DATABASE_URL); }
catch { throw new Error("DATABASE_URL_INVALID"); }
const targetFingerprint = createHash("sha256").update(targetUrl.host + targetUrl.pathname).digest("hex").slice(0, 16);
assert.equal(priorProductionEvidence.status, "PASS");
assert.equal(targetFingerprint, priorProductionEvidence.targetFingerprint, "TARGET_FINGERPRINT_MISMATCH");
let client: Client | undefined;
let phase = "connect";
async function query(name: string, sql: string) { phase = name; return (await client!.query(sql)).rows; }
function positions(main: string, sub: string[]): TeamBalanceEligibility[] {
  if (main === "ALL") return TEAM_BALANCE_POSITIONS.map(position => ({ position, preference: "AUTO" }));
  if (!TEAM_BALANCE_POSITIONS.includes(main as typeof TEAM_BALANCE_POSITIONS[number])) return [];
  const extras = sub.includes("ALL") ? TEAM_BALANCE_POSITIONS : sub;
  return [{ position: main as typeof TEAM_BALANCE_POSITIONS[number], preference: "MAIN" }, ...TEAM_BALANCE_POSITIONS.filter(p => p !== main && extras.includes(p)).map(position => ({ position, preference: "SUB" as const }))];
}
try {
  client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const [clock] = await query("clock", "SELECT now() AS captured_at, current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation");
  assert.equal(clock.read_only, "on", "READ_ONLY_TRANSACTION_REQUIRED");
  assert.equal(clock.isolation, "repeatable read", "REPEATABLE_READ_REQUIRED");
  const registry = await query("registry", "SELECT id, legacy_id, status, current_tier, peak_tier, created_at, updated_at FROM registry.players ORDER BY legacy_id NULLS LAST,id");
  const active = registry.filter(r => r.status === "ACTIVE");
  // Preserve both independent orders: UUID lexical order for canonical tie-breaks,
  // and legacy order (the active registry loop below) for normalization/anchor.
  // Neither source UUID nor original legacy ID survives this process.
  const identity = createResearchPlayerIdentity(registry);
  const anonymous = identity.anonymous;
  const applications = await query("applications", "SELECT player_id,season_id,apply_date::text,recruit_no,main_position,sub_positions,status,updated_at FROM competition.season_applications ORDER BY updated_at DESC,player_id");
  const drafts = await query("draft-participants", "SELECT p.player_id,p.draft_id,p.eligible_positions_json,p.updated_at,d.created_at,d.saved_at FROM team_tools.team_balance_draft_participants p JOIN team_tools.team_balance_drafts d ON d.id=p.draft_id ORDER BY p.updated_at DESC,p.player_id");
  const games = await query("games", "SELECT g.id AS game_id,s.id AS series_id,s.played_on::text,s.started_at,s.team_balance_draft_id,g.winner_team,p.player_id,p.team,p.position FROM competition.match_participants p JOIN competition.match_games g ON g.id=p.game_id JOIN competition.match_series s ON s.id=g.series_id WHERE s.status='PUBLISHED' ORDER BY s.played_on,g.id,p.team,p.position");
  phase = "rating-provider";
  const provider = await new PostgresTeamBalanceRatingProvider(() => new Date(clock.captured_at)).load(drizzle(client, { schema }), active.map(r => r.id));
  const eligibility = new Map<string, { eligiblePositions: TeamBalanceEligibility[]; source: string; updatedAt: string }>();
  for (const r of applications) if (!["CANCELLED", "REJECTED"].includes(r.status) && !eligibility.has(r.player_id)) eligibility.set(r.player_id, { eligiblePositions: positions(r.main_position, r.sub_positions), source: "LATEST_APPLICATION", updatedAt: new Date(r.updated_at).toISOString() });
  for (const r of drafts) if (!eligibility.has(r.player_id)) eligibility.set(r.player_id, { eligiblePositions: r.eligible_positions_json, source: "LATEST_DRAFT", updatedAt: new Date(r.updated_at).toISOString() });
  const players = active.map((r) => {
    const value = provider.ratings.get(r.id);
    return { playerId: anonymous.get(r.id)!, ...eligibility.get(r.id), eligiblePositions: eligibility.get(r.id)?.eligiblePositions ?? [], rating: value ? { ...value, v1: value.v1 ? { ...value.v1, legacyPlayerId: identity.activeLegacyOrdinal.get(r.id)! } : null } : null };
  });
  const eligibleIds = new Set(players.filter(p => p.eligiblePositions.length).map(p => p.playerId));
  const gameGroups = new Map<string, typeof games>();
  for (const row of games) { const rows = gameGroups.get(row.game_id) ?? []; rows.push(row); gameGroups.set(row.game_id, rows); }
  const history = [...gameGroups.values()].map((rows, i) => ({ gameId: `G${String(i + 1).padStart(5, "0")}`, playedOn: rows[0].played_on, winnerTeam: rows[0].winner_team, participants: rows.map(r => ({ playerId: anonymous.get(r.player_id), team: r.team, position: r.position })), linkedDraft: Boolean(rows[0].team_balance_draft_id) }));
  const groupMap = new Map<string, { source: string; observedOn: string; playerIds: string[]; eligibility?: Record<string, TeamBalanceEligibility[]> }>();
  function add(source: string, observedOn: string, ids: string[], overrides?: Record<string, TeamBalanceEligibility[]>) {
    const playerIds = [...new Set(ids)].sort();
    if (playerIds.length !== 10 || playerIds.some(id => !eligibleIds.has(id))) return;
    const key = playerIds.join("|");
    if (!groupMap.has(key)) groupMap.set(key, { source, observedOn, playerIds, eligibility: overrides });
  }
  for (const h of history) add("OBSERVED_MATCH", h.playedOn, h.participants.map(p => p.playerId!));
  const draftGroups = Map.groupBy(drafts, r => r.draft_id);
  for (const rows of draftGroups.values()) add("OBSERVED_DRAFT", new Date(rows[0].created_at).toISOString().slice(0, 10), rows.map(r => anonymous.get(r.player_id)!), Object.fromEntries(rows.map(r => [anonymous.get(r.player_id), r.eligible_positions_json])));
  const applyGroups = Map.groupBy(applications.filter(r => !["REJECTED", "CANCELLED"].includes(r.status)), r => `${r.season_id}:${r.apply_date}:${r.recruit_no}`);
  for (const rows of applyGroups.values()) add("OBSERVED_APPLICATION", rows[0].apply_date, rows.map(r => anonymous.get(r.player_id)!), Object.fromEntries(rows.map(r => [anonymous.get(r.player_id), positions(r.main_position, r.sub_positions)])));
  const matchAggregate = await query("match-aggregate", "SELECT status,count(*)::int AS series,sum(game_count)::int AS declared_games,min(played_on)::text AS first_day,max(played_on)::text AS last_day,count(*) FILTER(WHERE team_balance_draft_id IS NOT NULL)::int AS draft_linked FROM competition.match_series GROUP BY status ORDER BY status");
  const roleSamples = await query("role-samples", "SELECT p.position,count(*)::int AS samples,count(DISTINCT p.player_id)::int AS players FROM competition.match_participants p JOIN competition.match_games g ON g.id=p.game_id JOIN competition.match_series s ON s.id=g.series_id WHERE s.status='PUBLISHED' GROUP BY p.position ORDER BY p.position");
  const mmr = await query("mmr-state", "SELECT generation,status,formula_version,source_match_count,source_game_count,source_adjustment_count,calculated_at FROM mmr.projection_states");
  const seasonal = await query("season-state", "SELECT p.generation,p.status,p.source_match_count,p.source_game_count,p.calculated_at,s.status AS season_status FROM statistics.season_projection_states p JOIN competition.seasons s ON s.id=p.season_id ORDER BY p.calculated_at");
  const recent = await query("recent-aggregate", "SELECT count(*)::int AS stored,count(*) FILTER(WHERE recent_solo_json IS NOT NULL)::int AS with_recent,count(*) FILTER(WHERE recent_solo_synced_at>=now()-interval '24 hours')::int AS recent_within_24h,min(last_synced_at) AS earliest_sync,max(last_synced_at) AS latest_sync,min(recent_solo_synced_at) AS earliest_recent,max(recent_solo_synced_at) AS latest_recent FROM riot.summaries");
  const draftAggregate = await query("draft-aggregate", "SELECT status,count(*)::int AS count,min(created_at) AS first_created,max(created_at) AS last_created FROM team_tools.team_balance_drafts GROUP BY status ORDER BY status");
  const pregame = await query("pregame-coverage", "SELECT count(*)::int AS linked_series,count(*) FILTER(WHERE eligible)::int AS timestamp_eligible_series FROM (SELECT s.id, count(p.player_id)=10 AND bool_and(s.started_at IS NOT NULL AND d.saved_at<s.started_at AND p.updated_at<s.started_at) AS eligible FROM competition.match_series s JOIN team_tools.team_balance_drafts d ON d.id=s.team_balance_draft_id LEFT JOIN team_tools.team_balance_draft_participants p ON p.draft_id=d.id WHERE s.status='PUBLISHED' GROUP BY s.id) coverage");
  await client.query("ROLLBACK");
  const coverage = { totalPlayers: registry.length, activePlayers: active.length, usableRegisteredPlayers: eligibleIds.size, unregisteredPositionPlayers: active.length - eligibleIds.size, currentTierMissing: players.filter(p => !p.rating?.v1?.currentTier).length, peakTierMissing: players.filter(p => !p.rating?.v1?.peakTier).length, zeroInternalGames: players.filter(p => !p.rating?.v1?.internalGames).length, underFiveInternalGames: players.filter(p => (p.rating?.v1?.internalGames ?? 0) < 5).length, recentSoloConsumed: players.filter(p => p.rating?.v1?.recentSolo).length, overridesPresent: players.filter(p => !p.rating?.v1?.missingSources.includes("BALANCE_OVERRIDE")).length, mmrSamplesAvailable: players.filter(p => (p.rating?.sampleSize ?? 0) > 0).length, currentSnapshotHistoricalUniqueRosters: groupMap.size, historicalGames: history.length, roles: TEAM_BALANCE_POSITIONS.map(position => ({ position, registered: players.filter(p => p.eligiblePositions.some(e => e.position === position)).length, main: players.filter(p => p.eligiblePositions.some(e => e.position === position && e.preference === "MAIN")).length, mmrSamplePlayers: players.filter(p => (p.rating?.positions?.[position]?.sampleSize ?? 0) > 0).length })) };
  const inventory = { capturedAt: new Date(clock.captured_at).toISOString(), transaction: { readOnly: clock.read_only, isolation: clock.isolation }, productionBinding: { targetFingerprint, matchesPriorProductionMigration: true, evidence: "docs/qa-evidence/stable-recruit-codes-2026-10-14/production-migration.json", limitation: "Fresh Vercel DATABASE_URL is masked; current binding corroborated separately using environment metadata." }, baselineCommit: "c679a1849bad2623da1339b87a83ecaa9fff485b", providerGeneration: provider.generation, coverage, matchAggregate, roleSamples, mmr, seasonal, recent, draftAggregate, pregame, limitations: ["Registry updated_at is not a rank-specific observation timestamp.", "Latest registered application/draft positions are observed preferences, not inferred match roles.", "No historical predictions use current MMR, present rank or postgame records.", "Observed participant groups are replayed against one current snapshot, not called historical predictive validation.", "Player-level snapshots remain ignored private files; no source identifiers or account data are persisted."] };
  const snapshot = { inventory, players, observedRosters: [...groupMap.values()], history };
  const text = JSON.stringify(snapshot, null, 2) + "\n";
  const digest = createHash("sha256").update(text).digest("hex");
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "snapshot.json"), text);
  await writeFile(resolve(output, "inventory.json"), JSON.stringify({ ...inventory, snapshotSha256: digest }, null, 2) + "\n");
  console.log(JSON.stringify({ ...inventory, snapshotSha256: digest }, null, 2));
} catch (error) {
  // SQL/driver errors can contain raw parameter values. Never log their message.
  console.error(JSON.stringify({ phase, errorCode: typeof error === "object" && error !== null && "code" in error ? String(error.code) : "READ_ONLY_SNAPSHOT_FAILED" }));
  process.exitCode = 1;
} finally { await client?.end(); }
