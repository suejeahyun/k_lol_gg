import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Audit-only driver: reuse the guarded synthetic PostgreSQL cluster lifecycle,
// and the source runner's exact file order. Do not invoke its browser tail.
process.env.CI = "false";
process.env.V2_USE_CI_POSTGRES_SERVICE = "false";
process.env.V2_DB_CONTRACT_SCOPE = "all";
process.env.V2_SEASON_BROWSER_QA_HOLD = "false";
process.env.V2_ACCOUNT_BROWSER_QA_HOLD = "false";
const workspaceRoot = resolve(import.meta.dirname, "../../..");
const evidenceRoot = import.meta.dirname;
const logPath = resolve(evidenceRoot, "data-reliability-contracts.log");
const summaryPath = resolve(evidenceRoot, "data-reliability-contracts.json");
const { startEphemeralCluster, stopAndRemoveCluster, childTestEnvironment } =
  await import("../../../scripts/test-db/run-data-contracts.ts");
const source = await readFile(resolve(workspaceRoot, "scripts/test-db/run-data-contracts.ts"), "utf8");
const block = source.match(/const allTestFiles = \[([\s\S]*?)\n  \];/u)?.[1];
assert.ok(block, "Could not read current contract test inventory.");
const contractFiles = [...block.matchAll(/"(tests\/[^"]+)"/gu)].map((match) => match[1]);
assert.equal(contractFiles.length, 33, "Review any changed test inventory before running.");
const results = [];
await writeFile(logPath, "Audit-only isolated database contract run; no browser scripts and no external database.\n");

async function runTest(connectionString, file) {
  const child = spawn(process.execPath, [resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs"), "--test", "--test-reporter=tap", resolve(workspaceRoot, file)], {
    cwd: workspaceRoot,
    env: childTestEnvironment(connectionString),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => { output += chunk; });
  }
  const startedAt = Date.now();
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => signal ? reject(new Error(`${file} ended by ${signal}`)) : resolveExit(code ?? 1));
  });
  // Child environments contain only random local credentials. Still redact the
  // generated connection string if a driver unexpectedly includes it in errors.
  const url = new URL(connectionString);
  const sanitized = output.replaceAll(connectionString, "[isolated-test-database]")
    .replaceAll(decodeURIComponent(url.password), "[synthetic-password]");
  await appendFile(logPath, `\nFILE ${file}\n${sanitized}\n`);
  const number = (name) => Number(sanitized.match(new RegExp(`^# ${name} (\\d+)$`, "mu"))?.[1] ?? 0);
  const result = { file, exitCode, tests: number("tests"), pass: number("pass"), fail: number("fail"), skipped: number("skipped"), durationMs: Date.now() - startedAt };
  results.push(result);
  await writeFile(summaryPath, JSON.stringify({ mode: "isolated-contracts-only", results }, null, 2) + "\n");
  console.log(JSON.stringify(result));
}

for (const files of [["tests/database/fresh-install.contract.test.ts"], contractFiles]) {
  let cluster;
  try {
    cluster = await startEphemeralCluster();
    console.log("[audit-db] isolated PostgreSQL cluster started");
    for (const file of files) await runTest(cluster.connectionString, file);
  } finally {
    if (cluster) {
      await stopAndRemoveCluster(cluster);
      console.log("[audit-db] isolated PostgreSQL cluster stopped and removed");
    }
  }
}
const total = results.reduce((sum, result) => ({ tests: sum.tests + result.tests, pass: sum.pass + result.pass, fail: sum.fail + result.fail, skipped: sum.skipped + result.skipped }), { tests: 0, pass: 0, fail: 0, skipped: 0 });
await writeFile(summaryPath, JSON.stringify({ mode: "isolated-contracts-only", files: results.length, ...total, results }, null, 2) + "\n");
console.log(JSON.stringify({ files: results.length, ...total }));
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
