import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { Pool, type PoolClient } from "pg";

import { createDatabase } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { importV1AccountExtensions } from "./import-v1-account-extensions";
import { importV1AuthRegistry } from "./import-v1-auth-registry";
import { importV1Competitions } from "./import-v1-competitions";
import { importV1CoreRecords } from "./import-v1-core-records";
import { importV1MediaSubmissions } from "./import-v1-media-submissions";
import { importV1OperationalState } from "./import-v1-operational-state";
import { importV1Recruiting } from "./import-v1-recruiting";
import { importV1TeamTools } from "./import-v1-team-tools";
import {
  assertV1SourceDatabase,
  installTemporaryLegacyUuidFunction,
} from "./preflight-v1-database";
import type { CutoverStepResult } from "./types";

export const IN_PLACE_CUTOVER_ACK = "CREATE_V2_SCHEMA_AND_IMPORT_V1";
export const CUTOVER_ACTOR_SELECTION_RULE = "legacy_id 오름차순, UUID 오름차순";

type CutoverEnvironment = Readonly<{
  DATABASE_URL?: string;
  V2_IN_PLACE_CUTOVER_ACK?: string;
}>;

type CutoverDependencies = Readonly<{
  createPool: (connectionString: string) => Pool;
  preflight: (client: PoolClient) => Promise<CutoverStepResult>;
  migrate: (pool: Pool) => Promise<void>;
  installUuidFunction: (client: PoolClient) => Promise<void>;
  importAuthRegistry: typeof importV1AuthRegistry;
  importCoreRecords: typeof importV1CoreRecords;
  importTeamTools: typeof importV1TeamTools;
  importAccountExtensions: typeof importV1AccountExtensions;
  importCompetitions: typeof importV1Competitions;
  importRecruiting: typeof importV1Recruiting;
  importMediaSubmissions: typeof importV1MediaSubmissions;
  importOperationalState: typeof importV1OperationalState;
}>;

const REQUIRED_EXTENSION_TABLES = Object.freeze([
  "AdminLog",
  "AppDataCache",
  "DestructionMatch",
  "DestructionMatchMvpVote",
  "DestructionParticipant",
  "DestructionParticipantReplacement",
  "DestructionParticipationApply",
  "DestructionScrimRecruit",
  "DestructionScrimRecruitLog",
  "DestructionTeam",
  "DestructionTournament",
  "DisciplineResolutionTask",
  "DiscordAccountLinkLog",
  "DiscordBotHeartbeat",
  "DiscordOperationLog",
  "DiscordOperationSetting",
  "DiscordVoiceEvent",
  "EventMatch",
  "EventParticipant",
  "EventParticipationApply",
  "EventTeam",
  "EventTournamentMatch",
  "GalleryImage",
  "Highlight",
  "InhouseResultImage",
  "InhouseResultSubmission",
  "KakaoFriendApplication",
  "KakaoImageReceiveSession",
  "KakaoInboundImage",
  "KakaoLeaveRequest",
  "KakaoMeetupRecord",
  "KakaoOperationSetting",
  "KakaoSuggestionRequest",
  "OperationAiRequest",
  "PlayerRiotAccount",
  "PlayerSoloRankSnapshot",
  "PrivateAsset",
  "RecruitParty",
  "RecruitPartyDiscordMonitor",
  "RecruitPartyLog",
  "RecruitPartyMember",
  "RateLimitLog",
  "RiotAccountLinkLog",
  "RiotApiRequestLog",
  "RiotApiStatus",
  "RiotSyncJob",
  "UserDisciplineRecord",
]);

const defaultDependencies: CutoverDependencies = {
  createPool: (connectionString) => new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 0,
    application_name: "klol-v2-in-place-cutover",
  }),
  preflight: assertV1SourceDatabase,
  migrate: async (pool) => applyMigrations(createDatabase(pool)),
  installUuidFunction: installTemporaryLegacyUuidFunction,
  importAuthRegistry: importV1AuthRegistry,
  importCoreRecords: importV1CoreRecords,
  importTeamTools: importV1TeamTools,
  importAccountExtensions: importV1AccountExtensions,
  importCompetitions: importV1Competitions,
  importRecruiting: importV1Recruiting,
  importMediaSubmissions: importV1MediaSubmissions,
  importOperationalState: importV1OperationalState,
};

export function validateCutoverEnvironment(environment: CutoverEnvironment): string {
  if (environment.V2_IN_PLACE_CUTOVER_ACK !== IN_PLACE_CUTOVER_ACK) {
    throw new Error("V2_IN_PLACE_CUTOVER_ACK does not contain the exact required acknowledgement.");
  }
  const connectionString = environment.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  }
  return connectionString;
}

async function assertSourcePrerequisites(client: PoolClient): Promise<void> {
  const tables = await client.query<{ table_name: string }>(`
    select table_name
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
       and table_name = any($1::text[])
     order by table_name
  `, [REQUIRED_EXTENSION_TABLES]);
  const found = new Set(tables.rows.map((row) => row.table_name));
  const missing = REQUIRED_EXTENSION_TABLES.filter((table) => !found.has(table));
  if (missing.length > 0) {
    throw new Error(`V1 extension preflight failed; missing tables: ${missing.join(", ")}`);
  }
}

async function selectCutoverActor(client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>(`
    select id::text as id
      from auth.user_accounts
     where role = 'SUPER_ADMIN'
       and status = 'APPROVED'
       and deleted_at is null
     order by legacy_id asc nulls last, id asc
     limit 1
  `);
  const actorUserAccountId = result.rows[0]?.id;
  if (!actorUserAccountId) {
    throw new Error("Cutover requires an active approved SUPER_ADMIN account.");
  }
  return actorUserAccountId;
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("rollback").catch(() => undefined);
}

export async function runV1ToV2Cutover(
  environment: CutoverEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    V2_IN_PLACE_CUTOVER_ACK: process.env.V2_IN_PLACE_CUTOVER_ACK,
  },
  dependencyOverrides: Partial<CutoverDependencies> = {},
): Promise<readonly CutoverStepResult[]> {
  const connectionString = validateCutoverEnvironment(environment);
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const pool = dependencies.createPool(connectionString);

  try {
    const preflightClient = await pool.connect();
    let preflightComplete = false;
    let preflightResult: CutoverStepResult;
    try {
      await preflightClient.query("begin transaction isolation level repeatable read read only");
      preflightResult = await dependencies.preflight(preflightClient);
      await assertSourcePrerequisites(preflightClient);
      await preflightClient.query("commit");
      preflightComplete = true;
    } catch (error) {
      if (!preflightComplete) await rollback(preflightClient);
      throw error;
    } finally {
      preflightClient.release();
    }

    await dependencies.migrate(pool);

    const importClient = await pool.connect();
    let importComplete = false;
    try {
      await importClient.query("begin transaction isolation level repeatable read");
      await dependencies.installUuidFunction(importClient);
      const authRegistry = await dependencies.importAuthRegistry(importClient);
      const actorUserAccountId = await selectCutoverActor(importClient);
      const coreRecords = await dependencies.importCoreRecords(importClient);
      const teamTools = await dependencies.importTeamTools(importClient);
      const accountExtensions = await dependencies.importAccountExtensions(importClient, {
        actorUserAccountId,
      });
      const competitions = await dependencies.importCompetitions(importClient, {
        actorUserAccountId,
      });
      const recruiting = await dependencies.importRecruiting(importClient, {
        actorUserAccountId,
      });
      const mediaSubmissions = await dependencies.importMediaSubmissions(importClient, {
        actorUserAccountId,
      });
      const operationalState = await dependencies.importOperationalState(importClient, {
        actorUserAccountId,
      });
      await importClient.query("commit");
      importComplete = true;
      return Object.freeze([
        preflightResult,
        ...authRegistry,
        ...coreRecords,
        ...teamTools,
        ...accountExtensions,
        ...competitions,
        ...recruiting,
        ...mediaSubmissions,
        ...operationalState,
      ]);
    } catch (error) {
      if (!importComplete) await rollback(importClient);
      throw error;
    } finally {
      importClient.release();
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  try {
    const phases = await runV1ToV2Cutover();
    process.stdout.write(`${JSON.stringify({
      status: "complete",
      actorSelectionRule: CUTOVER_ACTOR_SELECTION_RULE,
      phases: phases.map(({ name, sourceCount, targetCount, insertedCount }) => ({
        name,
        sourceCount,
        targetCount,
        insertedCount,
      })),
    })}\n`);
  } catch {
    // Never echo a driver error: it may contain connection or source details.
    process.stderr.write(`${JSON.stringify({ status: "failed", code: "CUTOVER_FAILED" })}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) await main();
