import assert from "node:assert/strict";
import test from "node:test";

import { PostgresEventAdapter } from "../src/modules/competitions/events/infrastructure/postgres-event-adapters";
import type { EventTransactionContext } from "../src/modules/competitions/events/application/ports";
import type { V2Database } from "../src/platform/db/database";

function failingDatabase(failures: unknown[]) {
  let transactions = 0;
  const options: unknown[] = [];
  const database = {
    async transaction(work: (transaction: object) => Promise<unknown>, configuration: unknown) {
      const current = transactions++;
      options.push(configuration);
      const result = await work(Object.freeze({ attempt: current }));
      if (current < failures.length) throw failures[current];
      return result;
    },
  } as unknown as V2Database;
  return { database, options, attempts: () => transactions };
}

test("event transaction retries a rolled-back serialization failure with a fresh context", async () => {
  const fixture = failingDatabase([new Error("driver wrapper", { cause: { code: "40001" } })]);
  const adapter = new PostgresEventAdapter(fixture.database);
  const contexts: EventTransactionContext[] = [];
  const result = await adapter.dependencies.unitOfWork.transaction(async (context) => {
    contexts.push(context);
    return "committed receipt";
  });
  assert.equal(result, "committed receipt");
  assert.equal(fixture.attempts(), 2);
  assert.notEqual(contexts[0], contexts[1], "A failed snapshot must never be reused");
  assert.deepEqual(fixture.options, [{ isolationLevel: "serializable" }, { isolationLevel: "serializable" }]);
  for (const context of contexts) {
    await assert.rejects(adapter.dependencies.repository.loadForUpdate(context, "unused"), /escaped its unit of work/u);
  }
});

test("event transaction retries deadlocks but bounds repeated database contention", async () => {
  const failure = Object.assign(new Error("deadlock"), { code: "40P01" });
  const fixture = failingDatabase([failure, failure, failure, failure]);
  const adapter = new PostgresEventAdapter(fixture.database);
  await assert.rejects(adapter.dependencies.unitOfWork.transaction(async () => "not committed"), (error) => error === failure);
  assert.equal(fixture.attempts(), 3);
});

test("event transaction does not retry validation or unrelated database errors", async () => {
  for (const failure of [new TypeError("FORBIDDEN"), Object.assign(new Error("constraint"), { code: "23505" })]) {
    const fixture = failingDatabase([failure]);
    const adapter = new PostgresEventAdapter(fixture.database);
    await assert.rejects(adapter.dependencies.unitOfWork.transaction(async () => "not committed"), (error) => error === failure);
    assert.equal(fixture.attempts(), 1);
  }
});
