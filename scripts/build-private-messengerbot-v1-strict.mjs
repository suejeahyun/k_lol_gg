import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { analyzeRhinoStatic } from "./lib/messengerbot-rhino-static.mjs";

const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateDirectory = resolve(root, ".private");
const settingsSourcePath = resolve(privateDirectory, "KLOL_KAKAO_BOT_V4_UNIFIED_PRIVATE_MESSENGERBOT_R.js");
const publicPath = resolve(root, "integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js");
const outputPath = resolve(privateDirectory, "KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js");

if (outputPath !== privateDirectory && !outputPath.startsWith(`${privateDirectory}${sep}`)) {
  throw new Error("Private MessengerBot output must stay under .private/");
}
const relativeOutputPath = relative(root, outputPath).replaceAll("\\", "/");
const ignored = spawnSync("git", ["check-ignore", "--quiet", "--", relativeOutputPath], { cwd: root, windowsHide: true });
const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativeOutputPath], { cwd: root, windowsHide: true });
if (ignored.status !== 0 || tracked.status === 0) throw new Error("Private V1 strict output path must be ignored and untracked");

function privateSetting(source, name) {
  const escapedName = JSON.stringify(name).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = source.match(new RegExp(`DataBase\\.setDataBase\\(${escapedName},\\s*(\"(?:\\\\.|[^\"\\\\])*\")\\);`, "u"));
  if (!match) throw new Error(`Private MessengerBot setting is missing: ${name}`);
  return JSON.parse(match[1]);
}

const settingsSource = await readFile(settingsSourcePath, "utf8");
const settings = [
  "KLOL_V2_BASE_URL",
  "KLOL_V4_KAKAO_IDENTITY_SECRET",
  "KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT",
  "KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT",
].map((name) => [name, privateSetting(settingsSource, name)]);
const publicSource = (await readFile(publicPath, "utf8")).replace(/\r\n?/gu, "\n");
const preamble = [
  "/* PRIVATE LOCAL V1-STRICT INSTALLER. DO NOT COMMIT OR SHARE. */",
  "var KLOL_V1_PRIVATE_SETTINGS_APPLIED = (function () {",
  ...settings.map(([name, value]) => `  DataBase.setDataBase(${JSON.stringify(name)}, ${JSON.stringify(value)});`),
  "  return true;",
  "}());",
  "",
].join("\n");
const output = `${preamble}${publicSource}`;
const program = acorn.parse(output, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
const findings = analyzeRhinoStatic(program);
if ((output.match(/function\s+response\s*\(/gu) ?? []).length !== 1) throw new Error("Private V1 strict output must define one response callback");
if (findings.statementCandidates.length || findings.unsafeSequenceOperands.length || findings.voidExpressions.length || findings.bareAssignmentConditions.length) {
  throw new Error("Private V1 strict output contains Rhino static warning candidates");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, "utf8");
console.log(`Private V1 strict one-paste installer refreshed under .private (${output.length} characters).`);
