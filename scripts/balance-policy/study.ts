import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import type { TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { BASELINE_COMMIT, SNAPSHOT_SHA256, STRATA, hash, hashText } from "../balance-severity/study";
export { BASELINE_COMMIT, SNAPSHOT_SHA256, STRATA, hash, hashText, writeImmutable } from "../balance-severity/study";
export const DIRECTORY = ".private/balance-policy-20261018";
export const PUBLIC_DIRECTORY = "docs/qa-evidence/balance-policy-2026-10-18";
export const PREVIOUS_MANIFESTS = [".private/balance-research/rosters.json", ".private/balance-severity-20261018/rosters.json"] as const;
export type Stage = "tuning" | "validation" | "final";
export type Roster = { id: string; source: "RECOMBINED_REAL_PLAYERS"; stratum: typeof STRATA[number]; playerIds: string[]; split: Stage };
export async function readInputs() {
  const snapshotRaw = await readFile(`${DIRECTORY}/snapshot.json`, "utf8");
  assert.equal(hash(snapshotRaw), SNAPSHOT_SHA256, "SNAPSHOT_CHANGED");
  const manifestRaw = await readFile(`${DIRECTORY}/rosters.json`, "utf8");
  const manifest = JSON.parse(manifestRaw) as { snapshotSha256: string; previousManifests: Record<string, string>; rosters: Roster[] };
  assert.equal(manifest.snapshotSha256, SNAPSHOT_SHA256);
  for (const path of PREVIOUS_MANIFESTS) assert.equal(manifest.previousManifests[path], hash(await readFile(path, "utf8")), "PREVIOUS_STUDY_MANIFEST_CHANGED");
  const snapshot = JSON.parse(snapshotRaw) as { players: TeamBalancePlayer[] };
  return { snapshot, manifest, manifestRaw };
}
export async function inputHashes() {
  const { manifest, manifestRaw } = await readInputs();
  const ownSources = (await readdir("scripts/balance-policy")).filter(name => name.endsWith(".ts") || name === "PROTOCOL.md").sort().map(name => `scripts/balance-policy/${name}`);
  const sources = [...ownSources, "scripts/balance-severity/study.ts", "scripts/balance-severity/metrics.ts", "scripts/balance-research/metrics.ts", "scripts/balance-research/kernel.ts", "src/modules/team-tools/domain/team-balance.ts", "src/modules/team-tools/domain/inhouse-fairness.ts", "src/modules/team-tools/domain/inhouse-joint-search.ts"];
  const baseline = JSON.parse(await readFile(`${DIRECTORY}/baseline/manifest.json`, "utf8")) as { commit: string; files: { name: string; sha256: string }[] };
  assert.equal(baseline.commit, BASELINE_COMMIT);
  const baselineFiles = Object.fromEntries(await Promise.all(baseline.files.map(async file => {
    const raw = await readFile(`${DIRECTORY}/baseline/${file.name}`, "utf8");
    assert.equal(hash(raw), file.sha256, "FROZEN_BASELINE_MANIFEST_MISMATCH");
    return [file.name, hashText(raw)];
  })));
  const pilotManifestSha256 = hash(await readFile(`${DIRECTORY}/pilot-rosters.json`, "utf8"));
  return { snapshotSha256: SNAPSHOT_SHA256, previousManifests: manifest.previousManifests, rosterManifestSha256: hash(manifestRaw), pilotManifestSha256, baselineCommit: BASELINE_COMMIT, baselineFiles, sources: Object.fromEntries(await Promise.all(sources.map(async path => [path, hashText(await readFile(path, "utf8"))]))) };
}
export async function assertLock() {
  const current = await inputHashes();
  assert.deepEqual(current, JSON.parse(await readFile(`${DIRECTORY}/input-lock.json`, "utf8")), "LOCKED_STUDY_INPUT_CHANGED");
  return current;
}
