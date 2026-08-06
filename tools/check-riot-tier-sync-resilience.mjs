import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src/lib/riot/solo-sync.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tierCommitIndex = source.indexOf("await prisma.$transaction([");
const matchPhaseIndex = source.indexOf("if (includeMatches)", tierCommitIndex);
const matchCatchIndex = source.indexOf("catch (matchError)", matchPhaseIndex);
const syncedResultIndex = source.indexOf('status: "synced" as const', matchCatchIndex);

assert(tierCommitIndex >= 0, "Riot sync must persist player tier in a transaction.");
assert(matchPhaseIndex > tierCommitIndex, "Player tier must be persisted before recent matches are fetched.");
assert(matchCatchIndex > matchPhaseIndex, "Recent match failures must be handled separately from tier sync.");
assert(syncedResultIndex > matchCatchIndex, "A recent match failure must still return a successful tier sync result.");
assert(
  source.slice(tierCommitIndex, matchPhaseIndex).includes("currentTier: riotCurrentTier") &&
    source.slice(tierCommitIndex, matchPhaseIndex).includes("peakTier: riotPeakTier"),
  "Both current and peak tiers must be persisted before match sync.",
);
assert(
  source.slice(matchCatchIndex, syncedResultIndex).includes('syncStatus: "SUCCESS"'),
  "Partial match failure must preserve successful Riot tier sync status.",
);

console.log("Riot tier sync resilience check passed.");
