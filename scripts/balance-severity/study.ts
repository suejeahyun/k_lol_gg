import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";

export const DIRECTORY = ".private/balance-severity-20261018";
export const PUBLIC_DIRECTORY = "docs/qa-evidence/balance-severity-2026-10-18";
export const BASELINE_COMMIT = "131abbf777a331b056a96ab587957cf654387a78";
export const SNAPSHOT_SHA256 = "aecb6d6f5767f21ec1225427aea5c32e53a657bd4ede4319b50d0e498cd5e75d";
export const STRATA = ["SIMILAR_TIER", "MIXED_TIERS", "MAIN_CONGESTION", "JUNGLE_SHORTAGE", "SUPPORT_SHORTAGE", "LOW_SAMPLE", "UNKNOWN_TIER", "BROAD_POOL"] as const;
export type Stage = "tuning" | "validation" | "final";
export type Roster = { id: string; source: "RECOMBINED_REAL_PLAYERS"; stratum: typeof STRATA[number]; playerIds: string[]; split: Stage };
export const hash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
export const hashText = (text: string) => hash(text.replace(/\r\n/g, "\n"));
export async function writeImmutable(path: string, text: string) {
  try { assert.equal(await readFile(path, "utf8"), text, "FROZEN_INPUT_CHANGED"); }
  catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; await writeFile(path, text, { flag: "wx" }); }
}
export async function readInputs() {
  const snapshotRaw = await readFile(`${DIRECTORY}/snapshot.json`, "utf8");
  assert.equal(hash(snapshotRaw), SNAPSHOT_SHA256, "SNAPSHOT_CHANGED");
  const manifestRaw = await readFile(`${DIRECTORY}/rosters.json`, "utf8");
  const manifest = JSON.parse(manifestRaw) as { snapshotSha256: string; oldManifestSha256: string; rosters: Roster[] };
  assert.equal(manifest.snapshotSha256, SNAPSHOT_SHA256);
  const oldRaw = await readFile(".private/balance-research/rosters.json", "utf8");
  assert.equal(manifest.oldManifestSha256, hash(oldRaw), "PREVIOUS_STUDY_MANIFEST_CHANGED");
  const snapshot = JSON.parse(snapshotRaw) as { players: TeamBalancePlayer[]; capturedAt?: string };
  return { snapshot, manifest, manifestRaw };
}
export async function inputHashes() {
  const { manifest, manifestRaw } = await readInputs();
  const sources = ["scripts/balance-severity/PROTOCOL.md", "scripts/balance-severity/stability.ts", "scripts/balance-severity/prepare.ts", "scripts/balance-severity/pilot.ts", "scripts/balance-severity/publish-report.ts", "scripts/balance-severity/selector.ts", "scripts/balance-severity/oracle.ts", "scripts/balance-severity/metrics.ts", "scripts/balance-severity/gates.ts", "scripts/balance-severity/run.ts", "scripts/balance-severity/study.ts", "scripts/balance-research/kernel.ts", "scripts/balance-research/metrics.ts", "src/modules/team-tools/domain/team-balance.ts", "src/modules/team-tools/domain/inhouse-fairness.ts", "src/modules/team-tools/domain/inhouse-joint-search.ts"];
  const baseline = JSON.parse(await readFile(`${DIRECTORY}/baseline/manifest.json`, "utf8")) as { commit: string; files: { name: string; sha256: string }[] };
  assert.equal(baseline.commit, BASELINE_COMMIT);
  const baselineFiles = Object.fromEntries(await Promise.all(baseline.files.map(async file => {
    const raw = await readFile(`${DIRECTORY}/baseline/${file.name}`, "utf8");
    assert.equal(hash(raw), file.sha256, "FROZEN_BASELINE_MANIFEST_MISMATCH");
    return [file.name, hashText(raw)];
  })));
  return { snapshotSha256: SNAPSHOT_SHA256, oldManifestSha256: manifest.oldManifestSha256, rosterManifestSha256: hash(manifestRaw), baselineCommit: BASELINE_COMMIT, baselineFiles, sources: Object.fromEntries(await Promise.all(sources.map(async path => [path, hashText(await readFile(path, "utf8"))]))) };
}
export async function assertLock() {
  const current = await inputHashes();
  const locked = JSON.parse(await readFile(`${DIRECTORY}/input-lock.json`, "utf8"));
  assert.deepEqual(current, locked, "LOCKED_STUDY_INPUT_CHANGED");
  return current;
}
