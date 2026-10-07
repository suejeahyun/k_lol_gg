import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { asc, eq, inArray } from "drizzle-orm";
import ts from "typescript";
import type { V2Database } from "../src/platform/db/database";
import { matchGames, matchParticipants, matchSeries } from "../src/platform/db/schema/matches";
import { mmrManualAdjustments } from "../src/platform/db/schema/mmr";
import type { MmrManualAdjustmentSource, MmrMatchSource } from "../src/modules/mmr/domain/mmr-projection";

export type MmrReadonlyLedger = { matches: MmrMatchSource[]; adjustments: MmrManualAdjustmentSource[] };
const repositorySource = readFileSync(new URL("../src/modules/mmr/infrastructure/postgres-mmr-repository.ts", import.meta.url), "utf8");
const mapperSource = repositorySource.slice(repositorySource.indexOf("async function loadLedger("), repositorySource.indexOf("async function pendingSourceRows("));
const canonicalSource = repositorySource.slice(repositorySource.indexOf("function canonicalJson("), repositorySource.indexOf("async function currentState("));
assert.match(mapperSource, /^async function loadLedger/u);
assert.match(canonicalSource, /^function canonicalJson/u);
assert.doesNotMatch(mapperSource, /\.(?:insert|update|delete|execute)\(/u);
const sourceModule = { exports: {} as {
  loadLedger: (database: V2Database) => Promise<MmrReadonlyLedger>;
  canonicalJson: (value: unknown) => string;
} };
vm.runInNewContext(ts.transpileModule(`${canonicalSource}\n${mapperSource}\nexports.loadLedger = loadLedger; exports.canonicalJson = canonicalJson;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: sourceModule.exports, asc, eq, inArray, matchSeries, matchGames, matchParticipants, mmrManualAdjustments });

export const loadMmrReadonlyLedger = sourceModule.exports.loadLedger;
export const canonicalMmrJson = sourceModule.exports.canonicalJson;
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const mmrReadonlySourceEvidence = {
  mapperSha256: sha256(mapperSource),
  canonicalJsonSha256: sha256(canonicalSource),
  calculatorSha256: sha256(readFileSync(new URL("../src/modules/mmr/domain/mmr-projection.ts", import.meta.url), "utf8")),
};
