import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("recovery command explicitly runs the import-safe database harness", async () => {
  const wrapper = await readFile(new URL("../scripts/test-db/run-recovery-drill.ts", import.meta.url), "utf8");
  const harness = await readFile(new URL("../scripts/test-db/run-data-contracts.ts", import.meta.url), "utf8");
  assert.match(wrapper, /V2_DB_CONTRACT_SCOPE = "recovery"/u);
  assert.ok(wrapper.indexOf('V2_DB_CONTRACT_SCOPE = "recovery"') < wrapper.indexOf('import("./run-data-contracts")'));
  assert.match(wrapper, /await runDataContracts\(\)/u);
  assert.match(harness, /export async function runDataContracts\(\)/u);
  assert.match(harness, /if \(process\.argv\[1\].+fileURLToPath\(import\.meta\.url\)\) await runDataContracts\(\)/u);
});
