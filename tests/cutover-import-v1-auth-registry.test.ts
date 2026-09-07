import assert from "node:assert/strict";
import test from "node:test";

import { importV1AuthRegistry } from "../scripts/cutover/import-v1-auth-registry";
import type { CutoverClient } from "../scripts/cutover/types";

type FakeResult = Readonly<{ rows: readonly Record<string, string>[] }>;

function fakeClient(results: readonly FakeResult[]) {
  const sql: string[] = [];
  let index = 0;
  const client = {
    async query(statement: unknown) {
      assert.equal(typeof statement, "string");
      sql.push(statement as string);
      const result = results[index++];
      assert.ok(result, `unexpected query ${index}`);
      return result;
    },
  } as unknown as CutoverClient;
  return { client, sql, queryCount: () => index };
}

const cleanAccountPreflight = {
  source_count: "2",
  invalid_rows: "0",
  duplicate_login_ids: "0",
};
const cleanPlayerPreflight = {
  source_count: "1",
  invalid_rows: "0",
  missing_accounts: "0",
  duplicate_riot_ids: "0",
  generated_riot_id_collisions: "0",
  duplicate_account_links: "0",
};
const cleanReconciliation = {
  target_account_count: "2",
  target_player_count: "1",
  duplicate_target_account_ids: "0",
  duplicate_target_player_ids: "0",
  missing_target_accounts: "0",
  extra_target_accounts: "0",
  missing_target_players: "0",
  extra_target_players: "0",
  mismatched_accounts: "0",
  mismatched_players: "0",
  mismatched_account_links: "0",
};

test("imports V1 accounts and players through deterministic legacy mappings", async () => {
  const fake = fakeClient([
    { rows: [cleanAccountPreflight] },
    { rows: [cleanPlayerPreflight] },
    { rows: [{ inserted_count: "2" }] },
    { rows: [{ inserted_count: "1" }] },
    { rows: [cleanReconciliation] },
  ]);

  const result = await importV1AuthRegistry(fake.client);

  assert.deepEqual(result, [
    { name: "auth.user_accounts", sourceCount: 2, targetCount: 2, insertedCount: 2 },
    { name: "registry.players", sourceCount: 1, targetCount: 1, insertedCount: 1 },
  ]);
  assert.equal(fake.queryCount(), 5);
  assert.match(fake.sql[2], /source\."passwordHash"/);
  assert.match(fake.sql[2], /on conflict \(legacy_id\) do nothing/i);
  assert.match(fake.sql[3], /pg_temp\.klol_legacy_uuid\('auth\.user_accounts'/);
  assert.match(fake.sql[3], /on conflict \(legacy_id\) do nothing/i);
  assert.doesNotMatch(fake.sql.join("\n"), /adminTotpSecret|discord|public\."Session"/i);
  assert.doesNotMatch(fake.sql.join("\n"), /\b(begin|commit|rollback)\b/i);
});

test("a clean rerun inserts nothing and still reconciles", async () => {
  const fake = fakeClient([
    { rows: [cleanAccountPreflight] },
    { rows: [cleanPlayerPreflight] },
    { rows: [{ inserted_count: "0" }] },
    { rows: [{ inserted_count: "0" }] },
    { rows: [cleanReconciliation] },
  ]);

  const result = await importV1AuthRegistry(fake.client);
  assert.equal(result[0]?.insertedCount, 0);
  assert.equal(result[1]?.insertedCount, 0);
});

test("fails before writes when source identity data is unsafe", async () => {
  const fake = fakeClient([{
    rows: [{ ...cleanAccountPreflight, duplicate_login_ids: "1" }],
  }]);

  await assert.rejects(
    () => importV1AuthRegistry(fake.client),
    /V1 accounts preflight failed: duplicate_login_ids/,
  );
  assert.equal(fake.queryCount(), 1);
});

test("throws on missing relationships so the caller transaction can roll back", async () => {
  const fake = fakeClient([
    { rows: [cleanAccountPreflight] },
    { rows: [{ ...cleanPlayerPreflight, missing_accounts: "1" }] },
  ]);

  await assert.rejects(
    () => importV1AuthRegistry(fake.client),
    /V1 players preflight failed: missing_accounts/,
  );
  assert.equal(fake.queryCount(), 2);
});

test("throws when target legacy IDs or core relationships do not reconcile", async () => {
  const fake = fakeClient([
    { rows: [cleanAccountPreflight] },
    { rows: [cleanPlayerPreflight] },
    { rows: [{ inserted_count: "2" }] },
    { rows: [{ inserted_count: "1" }] },
    { rows: [{ ...cleanReconciliation, missing_target_players: "1", mismatched_account_links: "1" }] },
  ]);

  await assert.rejects(
    () => importV1AuthRegistry(fake.client),
    /missing_target_players, mismatched_account_links/,
  );
});
