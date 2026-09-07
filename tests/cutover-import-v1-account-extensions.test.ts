import assert from "node:assert/strict";
import test from "node:test";

import { importV1AccountExtensions } from "../scripts/cutover/import-v1-account-extensions";
import type { CutoverClient } from "../scripts/cutover/types";

type FakeResult = Readonly<{ rows: readonly Record<string, string>[] }>;

function fakeClient(results: readonly FakeResult[]) {
  const calls: Array<Readonly<{ sql: string; values: unknown[] | undefined }>> = [];
  let index = 0;
  const client = {
    async query(statement: unknown, values?: unknown[]) {
      assert.equal(typeof statement, "string");
      calls.push({ sql: statement as string, values });
      const result = results[index++];
      assert.ok(result, `unexpected query ${index}`);
      return result;
    },
  } as unknown as CutoverClient;
  return { client, calls, queryCount: () => index };
}

const cleanDiscipline = {
  record_source_count: "2",
  task_source_count: "1",
  invalid_actor: "0",
  invalid_records: "0",
  missing_record_accounts: "0",
  missing_record_players: "0",
  mismatched_record_identities: "0",
  invalid_tasks: "0",
  unsupported_task_states: "0",
};
const cleanRiot = {
  link_source_count: "1",
  summary_source_count: "1",
  invalid_links: "0",
  missing_link_players: "0",
  missing_link_owners: "0",
  summaries_without_links: "0",
  invalid_summaries: "0",
};
const cleanReconciliation = {
  target_record_count: "2",
  target_task_count: "1",
  target_link_count: "1",
  target_summary_count: "1",
  missing_records: "0",
  missing_tasks: "0",
  missing_links: "0",
  missing_summaries: "0",
  mismatched_records: "0",
  mismatched_tasks: "0",
  mismatched_links: "0",
  mismatched_summaries: "0",
};

const actorUserAccountId = "00000000-0000-4000-8000-000000000001";

function successfulResults(inserted = "1"): FakeResult[] {
  return [
    { rows: [cleanDiscipline] },
    { rows: [cleanRiot] },
    { rows: [{ inserted_count: inserted === "0" ? "0" : "2" }] },
    { rows: [{ inserted_count: inserted }] },
    { rows: [{ inserted_count: inserted }] },
    { rows: [{ inserted_count: inserted }] },
    { rows: [cleanReconciliation] },
  ];
}

test("imports supported discipline and public Riot projections", async () => {
  const fake = fakeClient(successfulResults());
  const result = await importV1AccountExtensions(fake.client, { actorUserAccountId });

  assert.deepEqual(result, [
    { name: "discipline.records", sourceCount: 2, targetCount: 2, insertedCount: 2 },
    { name: "discipline.resolution_tasks", sourceCount: 1, targetCount: 1, insertedCount: 1 },
    { name: "riot.account_links", sourceCount: 1, targetCount: 1, insertedCount: 1 },
    { name: "riot.summaries", sourceCount: 1, targetCount: 1, insertedCount: 1 },
  ]);
  assert.equal(fake.queryCount(), 7);
  assert.deepEqual(fake.calls[0]?.values, [actorUserAccountId]);
  assert.match(fake.calls[4]?.sql ?? "", /protected_puuid[\s\S]*?null/i);
  assert.match(fake.calls[4]?.sql ?? "", /'DISCONNECTED'::riot\.link_status/);
  assert.match(fake.calls[5]?.sql ?? "", /public\."PlayerSoloRankSnapshot"/);
  assert.doesNotMatch(fake.calls.map((call) => call.sql).join("\n"), /"puuid"|RiotRsoVerificationState|RiotApiRequestLog|adminTotpSecret|public\."Session"/i);
  assert.doesNotMatch(fake.calls.map((call) => call.sql).join("\n"), /\b(begin|commit|rollback)\b/i);
});

test("a clean rerun inserts no rows and still reconciles", async () => {
  const fake = fakeClient(successfulResults("0"));
  const result = await importV1AccountExtensions(fake.client, { actorUserAccountId });
  assert.deepEqual(result.map((step) => step.insertedCount), [0, 0, 0, 0]);
});

test("rejects an actor that cannot own imported discipline records before writes", async () => {
  const fake = fakeClient([{ rows: [{ ...cleanDiscipline, invalid_actor: "1" }] }]);
  await assert.rejects(
    () => importV1AccountExtensions(fake.client, { actorUserAccountId }),
    /V1 discipline preflight failed: invalid_actor/,
  );
  assert.equal(fake.queryCount(), 1);
});

test("does not silently drop discipline task states that need evidence migration", async () => {
  const fake = fakeClient([{ rows: [{ ...cleanDiscipline, unsupported_task_states: "3" }] }]);
  await assert.rejects(
    () => importV1AccountExtensions(fake.client, { actorUserAccountId }),
    /unsupported_task_states/,
  );
  assert.equal(fake.queryCount(), 1);
});

test("rejects Riot summaries that cannot be represented without a safe link", async () => {
  const fake = fakeClient([
    { rows: [cleanDiscipline] },
    { rows: [{ ...cleanRiot, summaries_without_links: "1" }] },
  ]);
  await assert.rejects(
    () => importV1AccountExtensions(fake.client, { actorUserAccountId }),
    /summaries_without_links/,
  );
  assert.equal(fake.queryCount(), 2);
});

test("throws when imported extension rows fail reconciliation", async () => {
  const results = successfulResults();
  results[6] = { rows: [{ ...cleanReconciliation, mismatched_links: "1" }] };
  const fake = fakeClient(results);
  await assert.rejects(
    () => importV1AccountExtensions(fake.client, { actorUserAccountId }),
    /mismatched_links/,
  );
});
