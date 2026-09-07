import assert from "node:assert/strict";
import test from "node:test";

import type { Pool, PoolClient } from "pg";

import {
  IN_PLACE_CUTOVER_ACK,
  runV1ToV2Cutover,
  validateCutoverEnvironment,
} from "../scripts/cutover/apply-v1-to-v2";
import type { CutoverStepResult } from "../scripts/cutover/types";

const environment = {
  DATABASE_URL: "postgresql://cutover.invalid/database",
  V2_IN_PLACE_CUTOVER_ACK: IN_PLACE_CUTOVER_ACK,
};

function step(name: string): CutoverStepResult {
  return { name, sourceCount: 1, targetCount: 1, insertedCount: 1 };
}

function harness(options: Readonly<{ failPhase?: string }> = {}) {
  const events: string[] = [];
  const transactionStatements: string[] = [];
  let connectionNumber = 0;
  const clients = [0, 1].map((clientIndex) => ({
    async query(sql: unknown) {
      assert.equal(typeof sql, "string");
      const statement = String(sql);
      transactionStatements.push(`${clientIndex}:${statement.trim().split(/\s+/).slice(0, 4).join(" ")}`);
      if (statement.includes("information_schema.tables")) {
        return { rows: [
          { table_name: "AdminLog" },
          { table_name: "AppDataCache" },
          { table_name: "DestructionMatch" },
          { table_name: "DestructionMatchMvpVote" },
          { table_name: "DestructionParticipant" },
          { table_name: "DestructionParticipantReplacement" },
          { table_name: "DestructionParticipationApply" },
          { table_name: "DestructionScrimRecruit" },
          { table_name: "DestructionScrimRecruitLog" },
          { table_name: "DestructionTeam" },
          { table_name: "DestructionTournament" },
          { table_name: "DisciplineResolutionTask" },
          { table_name: "DiscordAccountLinkLog" },
          { table_name: "DiscordBotHeartbeat" },
          { table_name: "DiscordOperationLog" },
          { table_name: "DiscordOperationSetting" },
          { table_name: "DiscordVoiceEvent" },
          { table_name: "EventMatch" },
          { table_name: "EventParticipant" },
          { table_name: "EventParticipationApply" },
          { table_name: "EventTeam" },
          { table_name: "EventTournamentMatch" },
          { table_name: "GalleryImage" },
          { table_name: "Highlight" },
          { table_name: "InhouseResultImage" },
          { table_name: "InhouseResultSubmission" },
          { table_name: "KakaoFriendApplication" },
          { table_name: "KakaoImageReceiveSession" },
          { table_name: "KakaoInboundImage" },
          { table_name: "KakaoLeaveRequest" },
          { table_name: "KakaoMeetupRecord" },
          { table_name: "KakaoOperationSetting" },
          { table_name: "KakaoSuggestionRequest" },
          { table_name: "OperationAiRequest" },
          { table_name: "PlayerRiotAccount" },
          { table_name: "PlayerSoloRankSnapshot" },
          { table_name: "PrivateAsset" },
          { table_name: "RecruitParty" },
          { table_name: "RecruitPartyDiscordMonitor" },
          { table_name: "RecruitPartyLog" },
          { table_name: "RecruitPartyMember" },
          { table_name: "RateLimitLog" },
          { table_name: "RiotAccountLinkLog" },
          { table_name: "RiotApiRequestLog" },
          { table_name: "RiotApiStatus" },
          { table_name: "RiotSyncJob" },
          { table_name: "UserDisciplineRecord" },
        ] };
      }
      if (statement.includes("from auth.user_accounts")) {
        assert.match(statement, /order by legacy_id asc nulls last, id asc/i);
        return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }] };
      }
      return { rows: [] };
    },
    release() {
      events.push(`release-${clientIndex}`);
    },
  })) as unknown as PoolClient[];
  const pool = {
    async connect() {
      events.push(`connect-${connectionNumber}`);
      return clients[connectionNumber++];
    },
    async end() {
      events.push("pool-end");
    },
  } as unknown as Pool;
  const fail = (phase: string) => {
    if (options.failPhase === phase) throw new Error(`failed-${phase}`);
  };
  const dependencies = {
    createPool: () => pool,
    preflight: async () => {
      events.push("preflight");
      fail("preflight");
      return step("database-preflight");
    },
    migrate: async () => {
      events.push("migrate");
      fail("migrate");
    },
    installUuidFunction: async () => {
      events.push("uuid");
      fail("uuid");
    },
    importAuthRegistry: async () => {
      events.push("auth");
      fail("auth");
      return [step("auth")];
    },
    importCoreRecords: async () => {
      events.push("core");
      fail("core");
      return [step("core")];
    },
    importTeamTools: async () => {
      events.push("team-tools");
      fail("team-tools");
      return [step("team-tools")];
    },
    importAccountExtensions: async (_client: unknown, input: { actorUserAccountId: string }) => {
      assert.equal(input.actorUserAccountId, "00000000-0000-4000-8000-000000000001");
      events.push("extensions");
      fail("extensions");
      return [step("extensions")];
    },
    importCompetitions: async (_client: unknown, input: { actorUserAccountId: string }) => {
      assert.equal(input.actorUserAccountId, "00000000-0000-4000-8000-000000000001");
      events.push("competitions");
      fail("competitions");
      return [step("competitions")];
    },
    importRecruiting: async (_client: unknown, input: { actorUserAccountId: string }) => {
      assert.equal(input.actorUserAccountId, "00000000-0000-4000-8000-000000000001");
      events.push("recruiting");
      fail("recruiting");
      return [step("recruiting")];
    },
    importMediaSubmissions: async (_client: unknown, input: { actorUserAccountId: string }) => {
      assert.equal(input.actorUserAccountId, "00000000-0000-4000-8000-000000000001");
      events.push("media");
      fail("media");
      return [step("media")];
    },
    importOperationalState: async (_client: unknown, input: { actorUserAccountId: string }) => {
      assert.equal(input.actorUserAccountId, "00000000-0000-4000-8000-000000000001");
      events.push("operational");
      fail("operational");
      return [step("operational")];
    },
  };
  return { events, transactionStatements, dependencies };
}

test("requires the exact destructive cutover acknowledgement and PostgreSQL URL", () => {
  assert.throws(
    () => validateCutoverEnvironment({ DATABASE_URL: environment.DATABASE_URL }),
    /V2_IN_PLACE_CUTOVER_ACK/,
  );
  assert.throws(
    () => validateCutoverEnvironment({ ...environment, V2_IN_PLACE_CUTOVER_ACK: "yes" }),
    /V2_IN_PLACE_CUTOVER_ACK/,
  );
  assert.throws(
    () => validateCutoverEnvironment({ ...environment, DATABASE_URL: "https://database.invalid" }),
    /PostgreSQL/,
  );
  assert.equal(validateCutoverEnvironment(environment), environment.DATABASE_URL);
});

test("orders read-only preflight, migration, and one repeatable-read import transaction", async () => {
  const run = harness();
  const results = await runV1ToV2Cutover(environment, run.dependencies);

  assert.deepEqual(run.events, [
    "connect-0", "preflight", "release-0", "migrate",
    "connect-1", "uuid", "auth", "core", "team-tools", "extensions", "competitions", "recruiting", "media", "operational", "release-1", "pool-end",
  ]);
  assert.deepEqual(results.map((result) => result.name), [
    "database-preflight", "auth", "core", "team-tools", "extensions", "competitions", "recruiting", "media", "operational",
  ]);
  assert.ok(run.transactionStatements.some((statement) =>
    statement === "0:begin transaction isolation level",
  ));
  assert.ok(run.transactionStatements.some((statement) =>
    statement === "1:begin transaction isolation level",
  ));
  assert.equal(run.transactionStatements.filter((statement) => statement.endsWith(":commit")).length, 2);
  assert.equal(run.transactionStatements.filter((statement) => statement.endsWith(":rollback")).length, 0);
});

test("rolls back the import transaction and closes the pool on phase failure", async () => {
  const run = harness({ failPhase: "core" });
  await assert.rejects(
    () => runV1ToV2Cutover(environment, run.dependencies),
    /failed-core/,
  );
  assert.ok(run.transactionStatements.some((statement) => statement === "1:rollback"));
  assert.equal(run.transactionStatements.some((statement) => statement === "1:commit"), false);
  assert.equal(run.events.at(-1), "pool-end");
});

test("rolls back read-only preflight before migration when the source check fails", async () => {
  const run = harness({ failPhase: "preflight" });
  await assert.rejects(
    () => runV1ToV2Cutover(environment, run.dependencies),
    /failed-preflight/,
  );
  assert.ok(run.transactionStatements.some((statement) => statement === "0:rollback"));
  assert.equal(run.events.includes("migrate"), false);
  assert.equal(run.events.at(-1), "pool-end");
});
