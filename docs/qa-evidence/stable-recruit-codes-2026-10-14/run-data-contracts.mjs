import { spawn } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Reuse the repository's guarded local PostgreSQL lifecycle. No browser/HTTP
// runners, external databases, .env files or production credentials are loaded.
process.env.CI = "false";
process.env.V2_USE_CI_POSTGRES_SERVICE = "false";
const root = resolve(import.meta.dirname, "../../..");
const { startEphemeralCluster, stopAndRemoveCluster, childTestEnvironment } =
  await import("../../../scripts/test-db/run-data-contracts.ts");
const log = resolve(import.meta.dirname, "data-contracts.log");
const files = ["tests/database/kakao-form-snapshots.contract.test.ts", "tests/database/kakao-recruit-form-snapshots.contract.test.ts"];
await writeFile(log, "Isolated PostgreSQL 18 recruitment snapshot contracts; synthetic data only.\n");
let cluster;
const results = [];
try {
  cluster = await startEphemeralCluster();
  for (const file of files) {
    const child = spawn(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), "--test", "--test-reporter=tap", file], {
      cwd: root, env: childTestEnvironment(cluster.connectionString), stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8"); stream.on("data", (chunk) => { output += chunk; });
    }
    const exitCode = await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => signal ? reject(new Error(`${file}: ${signal}`)) : resolveExit(code ?? 1));
    });
    const url = new URL(cluster.connectionString);
    const sanitized = output.replaceAll(cluster.connectionString, "[isolated-database]").replaceAll(decodeURIComponent(url.password), "[synthetic-password]");
    await appendFile(log, `\nFILE ${file}\n${sanitized}`);
    const metric = (key) => Number(sanitized.match(new RegExp(`^# ${key} (\\d+)$`, "mu"))?.[1] ?? 0);
    const result = { file, exitCode, tests: metric("tests"), pass: metric("pass"), fail: metric("fail"), skipped: metric("skipped") };
    results.push(result); console.log(JSON.stringify(result));
  }
} finally {
  if (cluster) {
    await stopAndRemoveCluster(cluster);
    await appendFile(log, "\nIsolated PostgreSQL cluster stopped and disposable directory removed.\n");
    console.log("Isolated PostgreSQL cluster stopped and disposable directory removed.");
  }
}
await writeFile(resolve(import.meta.dirname, "data-contracts.json"), JSON.stringify({ mode: "isolated-local", results }, null, 2) + "\n");
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
