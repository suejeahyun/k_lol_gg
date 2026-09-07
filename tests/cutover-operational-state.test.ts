import assert from "node:assert/strict";
import test from "node:test";

import {
  importV1OperationalState,
  V1_OPERATIONAL_CUTOVER_POLICY,
} from "../scripts/cutover/import-v1-operational-state";
import type { CutoverClient } from "../scripts/cutover/types";

const actorUserAccountId = "00000000-0000-4000-8000-000000000001";

type FakeOptions = Readonly<{
  invalidField?: string;
  alreadyImported?: boolean;
  reconciliationCount?: number;
}>;

function fakeClient(options: FakeOptions = {}) {
  const queries: Array<Readonly<{ sql: string; values: readonly unknown[] }>> = [];
  let afterImport = false;
  const client = {
    async query(statement: unknown, values: readonly unknown[] = []) {
      const sql = String(statement);
      queries.push({ sql, values });
      if (sql.includes("/* preflight:v1-operational-state */")) {
        return {
          rows: [{
            invalid_actor: options.invalidField === "invalid_actor" ? "1" : "0",
            physical_settings: "1",
            invalid_settings_root: options.invalidField === "invalid_settings_root" ? "1" : "0",
            invalid_boolean_settings: options.invalidField === "invalid_boolean_settings" ? "1" : "0",
            invalid_max_message_length: options.invalidField === "invalid_max_message_length" ? "1" : "0",
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("target-before")) {
        return { rows: [{ count: options.alreadyImported ? "1" : "0" }], rowCount: 1 };
      }
      if (sql.includes("/* import:kakao-operation-settings-projection */")) {
        afterImport = true;
        return { rows: [], rowCount: options.alreadyImported ? 0 : 1 };
      }
      if (sql.includes("target-after")) {
        assert.equal(afterImport, true);
        return { rows: [{ count: String(options.reconciliationCount ?? 1) }], rowCount: 1 };
      }
      if (sql.includes("/* count:v1-operational-exclusions */")) {
        return {
          rows: [{ historical_count: "17", ephemeral_count: "9", unmapped_count: "4" }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL: ${sql.slice(0, 120)}`);
    },
  } as unknown as CutoverClient;
  return { client, queries };
}

test("projects only bounded Kakao feature settings and records excluded operational row counts", async () => {
  const fake = fakeClient();
  const result = await importV1OperationalState(fake.client, { actorUserAccountId });

  assert.deepEqual(result, [
    { name: "kakao-operation-settings-projection", sourceCount: 1, targetCount: 1, insertedCount: 1 },
    { name: "excluded-observability-history", sourceCount: 17, targetCount: 0, insertedCount: 0 },
    { name: "excluded-ephemeral-integration-state", sourceCount: 9, targetCount: 0, insertedCount: 0 },
    { name: "excluded-unmapped-settings-and-cache", sourceCount: 4, targetCount: 0, insertedCount: 0 },
  ]);

  const sql = fake.queries.map((query) => query.sql).join("\n");
  assert.match(sql, /update recruiting\.kakao_operation_settings/u);
  assert.match(sql, /disciplineEvidenceEnabled'[\s\S]*?and coalesce\(\(source\.value ->> 'inhouseResultImageEnabled'/u);
  assert.match(sql, /source\.value ->> 'maxMessageLength'/u);
  assert.doesNotMatch(sql, /insert\s+into\s+(audit|riot|operations|auth)\./iu);
  assert.doesNotMatch(sql, /set\s+.*(?:room|sender|token|secret|prompt|raw)/iu);
  assert.deepEqual(fake.queries.filter((query) => query.values.length > 0).map((query) => query.values), [
    [actorUserAccountId],
    [actorUserAccountId],
    [actorUserAccountId],
    [actorUserAccountId],
  ]);
});

test("a clean rerun does not rewrite the already reconciled settings projection", async () => {
  const fake = fakeClient({ alreadyImported: true });
  const result = await importV1OperationalState(fake.client, { actorUserAccountId });
  assert.equal(result[0]?.insertedCount, 0);
  const update = fake.queries.find((query) => query.sql.includes("/* import:kakao-operation-settings-projection */"));
  assert.match(update?.sql ?? "", /target\.updated_by_user_account_id is null/u);
});

for (const invalidField of [
  "invalid_actor",
  "invalid_settings_root",
  "invalid_boolean_settings",
  "invalid_max_message_length",
] as const) {
  test(`rejects ${invalidField} before any target mutation`, async () => {
    const fake = fakeClient({ invalidField });
    await assert.rejects(
      () => importV1OperationalState(fake.client, { actorUserAccountId }),
      new RegExp(invalidField),
    );
    assert.equal(fake.queries.some((query) => query.sql.includes("/* import:")), false);
  });
}

test("fails closed when the target does not exactly reconcile", async () => {
  const fake = fakeClient({ reconciliationCount: 0 });
  await assert.rejects(
    () => importV1OperationalState(fake.client, { actorUserAccountId }),
    /reconciliation failed/u,
  );
  assert.equal(fake.queries.some((query) => query.sql.includes("operational-exclusions")), false);
});

test("the preservation policy explicitly excludes logs, secrets, transient jobs and caches", () => {
  const excluded = V1_OPERATIONAL_CUTOVER_POLICY.filter((entry) => entry.disposition === "DO_NOT_COPY");
  const tables = new Set(excluded.flatMap((entry) => entry.sourceTables));
  for (const table of [
    "AdminLog",
    "RateLimitLog",
    "OperationAiRequest",
    "RiotApiRequestLog",
    "RiotRsoVerificationState",
    "KakaoImageReceiveSession",
    "KakaoInboundImage",
    "DiscordOperationSetting",
    "DiscordBotHeartbeat",
    "DiscordVoiceEvent",
    "AppDataCache",
  ]) assert.equal(tables.has(table), true, `${table} must have an explicit do-not-copy policy`);
  assert.equal(excluded.every((entry) => entry.targetTable === null), true);
});
