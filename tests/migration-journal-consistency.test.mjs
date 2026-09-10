import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const drizzleDirectory = new URL("../drizzle/", import.meta.url);

test("migration journal has contiguous indices, increasing timestamps, and matching SQL tags", () => {
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", drizzleDirectory), "utf8"));
  assert.ok(Array.isArray(journal.entries), "migration journal entries must be an array");

  const tags = journal.entries.map((entry) => entry.tag);
  const sqlTags = readdirSync(drizzleDirectory)
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .map((name) => name.replace(/\.sql$/u, ""))
    .sort();
  assert.deepEqual(sqlTags, tags, "migration SQL files and journal tags must match exactly");

  for (const [index, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, index, `migration ${entry.tag} must have contiguous idx ${index}`);
    assert.ok(Number.isSafeInteger(entry.when), `migration ${entry.tag} must have a safe integer timestamp`);
    if (index > 0) {
      assert.ok(
        entry.when > journal.entries[index - 1].when,
        `migration ${entry.tag} timestamp must be greater than the previous journal entry`,
      );
    }
  }
});
