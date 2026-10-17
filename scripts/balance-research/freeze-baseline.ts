import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const commit = process.argv[2] ?? "c679a1849bad2623da1339b87a83ecaa9fff485b";
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("FULL_BASELINE_COMMIT_REQUIRED");
const directory = process.argv[3] ?? ".private/balance-research/baseline";
await mkdir(directory, { recursive: true });
const files = [];
for (const name of ["team-balance.ts", "inhouse-fairness.ts", "inhouse-joint-search.ts"]) {
  const source = execFileSync("git", ["show", `${commit}:src/modules/team-tools/domain/${name}`], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const destination = `${directory}/${name}`;
  try {
    const existing = await readFile(destination, "utf8");
    assert.equal(existing.replace(/\r\n/g, "\n"), source.replace(/\r\n/g, "\n"), "An existing frozen baseline differs; refusing to overwrite.");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    await writeFile(destination, source);
  }
  files.push({ name, sha256: createHash("sha256").update(await readFile(destination)).digest("hex") });
}
await writeFile(`${directory}/manifest.json`, JSON.stringify({ commit, files }, null, 2) + "\n");
console.log(JSON.stringify({ commit, files }));
