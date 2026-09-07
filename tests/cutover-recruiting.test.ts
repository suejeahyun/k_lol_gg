import assert from "node:assert/strict";
import test from "node:test";

import {
  importV1Recruiting,
  V1_RECRUITING_SCHEMA_GAPS,
} from "../scripts/cutover/import-v1-recruiting";
import type { CutoverClient } from "../scripts/cutover/types";

const actorUserAccountId = "00000000-0000-4000-8000-000000000001";
const sourceCounts = Object.freeze({
  "recruiting-parties": 3,
  "recruiting-operation-forms": 8,
  "recruiting-destruction-scrims": 24,
});

function fakeClient(options: Readonly<{ failingIntegrity?: string; shortTarget?: string }> = {}) {
  const targets = new Map<string, number>();
  const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
  const client = {
    async query(statement: unknown, values: readonly unknown[] = []) {
      const sql = String(statement);
      queries.push({ sql, values });
      const integrity = sql.match(/\/\* integrity:([^*]+) \*\//u)?.[1];
      if (integrity) {
        const value = integrity === "recruiting cutover actor"
          ? (options.failingIntegrity === integrity ? 0 : 1)
          : (options.failingIntegrity === integrity ? 1 : 0);
        return { rows: [{ count: String(value) }], rowCount: 1 };
      }
      const count = sql.match(/\/\* count:([^:]+):(source|target) \*\//u);
      if (count) {
        const [, name, side] = count;
        return {
          rows: [{ count: String(side === "source" ? sourceCounts[name as keyof typeof sourceCounts] : targets.get(name!) ?? 0) }],
          rowCount: 1,
        };
      }
      const imported = sql.match(/\/\* import:([^*]+) \*\//u)?.[1];
      if (imported) {
        const total = sourceCounts[imported as keyof typeof sourceCounts];
        targets.set(imported, imported === options.shortTarget ? Math.max(0, total - 1) : total);
        return { rows: [], rowCount: total };
      }
      throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`);
    },
  } as unknown as CutoverClient;
  return { client, queries };
}

test("imports parties and normalized operation forms idempotently in the caller transaction", async () => {
  const { client, queries } = fakeClient();
  const first = await importV1Recruiting(client, { actorUserAccountId });
  const second = await importV1Recruiting(client, { actorUserAccountId });

  assert.deepEqual(first, [
    { name: "recruiting-parties", sourceCount: 3, targetCount: 3, insertedCount: 3 },
    { name: "recruiting-operation-forms", sourceCount: 8, targetCount: 8, insertedCount: 8 },
    { name: "recruiting-destruction-scrims", sourceCount: 24, targetCount: 24, insertedCount: 24 },
  ]);
  assert.deepEqual(second.map((step) => step.insertedCount), [0, 0, 0]);
  assert.equal(queries.some(({ sql }) => /\b(begin|commit|rollback)\b/iu.test(sql)), false);
  assert.equal(queries.filter(({ sql }) => sql.includes("/* import:") && /on conflict/iu.test(sql)).length, 6);
});

test("uses qualified V1 sources, full target UUID kinds, and parameterized reviewer identity", async () => {
  const { client, queries } = fakeClient();
  await importV1Recruiting(client, { actorUserAccountId });
  const sql = queries.map((query) => query.sql).join("\n");

  for (const table of [
    "RecruitParty", "RecruitPartyMember", "RecruitPartyLog", "RecruitPartyDiscordMonitor",
    "KakaoFriendApplication", "KakaoLeaveRequest", "KakaoMeetupRecord", "KakaoSuggestionRequest",
    "DestructionScrimRecruit", "DestructionScrimRecruitLog", "DestructionTournament", "DestructionTeam",
  ]) assert.match(sql, new RegExp(`public\\.\"${table}\"`));
  assert.match(sql, /pg_temp\.klol_legacy_uuid\('recruiting\.parties'/u);
  assert.match(sql, /pg_temp\.klol_legacy_uuid\('recruiting\.operation_forms'/u);
  assert.match(sql, /pg_temp\.klol_legacy_uuid\('recruiting\.scrims'/u);
  assert.match(sql, /pg_temp\.klol_legacy_uuid\('competition\.destruction_competitions'/u);
  assert.match(sql, /pg_temp\.klol_legacy_uuid\('competition\.destruction_teams'/u);
  assert.doesNotMatch(sql, /source\."rawText"|source\."sourceHash"/u);

  const operationInsert = queries.find(({ sql: statement }) => statement.includes("/* import:recruiting-operation-forms */"));
  assert.deepEqual(operationInsert?.values, [actorUserAccountId]);
  assert.match(operationInsert?.sql ?? "", /case when source\.reviewed then \$1::uuid/u);

  const scrimInsert = queries.find(({ sql: statement }) => statement.includes("/* import:recruiting-destruction-scrims */"));
  assert.match(scrimInsert?.sql ?? "", /source\."gameCount" in \(1, 3, 5\)/u);
  assert.match(scrimInsert?.sql ?? "", /select max\(log\."createdAt"\)/u);
  assert.doesNotMatch(scrimInsert?.sql ?? "", /log\."(?:summary|roomName|sender)"/u);
});

test("blocks malformed dates and members before any target write", async () => {
  const { client, queries } = fakeClient({ failingIntegrity: "leave operation payload" });
  await assert.rejects(
    () => importV1Recruiting(client, { actorUserAccountId }),
    /blocked by leave operation payload: 1 problem row/u,
  );
  assert.equal(queries.some(({ sql }) => sql.includes("/* import:")), false);
  assert.match(queries.map((query) => query.sql).join("\n"), /pg_input_is_valid/u);
});

test("rejects invalid or non-SUPER cutover actors", async () => {
  const invalid = fakeClient();
  await assert.rejects(
    () => importV1Recruiting(invalid.client, { actorUserAccountId: "not-a-uuid" }),
    /not a UUID/u,
  );
  assert.equal(invalid.queries.length, 0);

  const missing = fakeClient({ failingIntegrity: "recruiting cutover actor" });
  await assert.rejects(
    () => importV1Recruiting(missing.client, { actorUserAccountId }),
    /expected one approved SUPER_ADMIN/u,
  );
  assert.equal(missing.queries.some(({ sql }) => sql.includes("/* import:")), false);
});

test("reconciliation failure asks the caller to roll back", async () => {
  const { client } = fakeClient({ shortTarget: "recruiting-operation-forms" });
  await assert.rejects(
    () => importV1Recruiting(client, { actorUserAccountId }),
    /recruiting-operation-forms reconciliation failed: source=8, target=7/u,
  );
});

test("documents V1 party, operation-form, and scrim schema gaps", () => {
  assert.equal(V1_RECRUITING_SCHEMA_GAPS.length, 7);
  assert.ok(V1_RECRUITING_SCHEMA_GAPS.some((gap) => gap.includes("RecruitPartyLog")));
  assert.ok(V1_RECRUITING_SCHEMA_GAPS.some((gap) => gap.includes("RecruitPartyDiscordMonitor")));
  assert.ok(V1_RECRUITING_SCHEMA_GAPS.some((gap) => gap.includes("tierText")));
  assert.ok(V1_RECRUITING_SCHEMA_GAPS.some((gap) => gap.includes("rawText")));
  assert.ok(V1_RECRUITING_SCHEMA_GAPS.some((gap) => gap.includes("requesterLineupJson")));
  assert.ok(V1_RECRUITING_SCHEMA_GAPS.some((gap) => gap.includes("DestructionScrimRecruit")));
  assert.ok(V1_RECRUITING_SCHEMA_GAPS.some((gap) => gap.includes("maximum_members")));
});
