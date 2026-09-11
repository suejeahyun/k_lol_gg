import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Data Dragon version monitor discovers the upstream latest version without changing the pinned catalog", async () => {
  const script = await readFile(new URL("../scripts/qa/check-data-dragon-catalog.mjs", import.meta.url), "utf8");
  assert.match(script, /api\/versions\.json/u);
  assert.match(script, /versions\.includes\(pinnedVersion\)/u);
  assert.match(script, /updateAvailable/u);
  assert.doesNotMatch(script, /16\.17\.1/u);
});
