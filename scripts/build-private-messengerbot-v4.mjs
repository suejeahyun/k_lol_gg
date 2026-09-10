import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { analyzeRhinoStatic } from "./lib/messengerbot-rhino-static.mjs";

const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateDirectory = resolve(root, ".private");
const publicPath = resolve(root, "integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R.js");
const arguments_ = process.argv.slice(2);
const configureVercel = arguments_.includes("--configure-vercel");
const outputIndex = arguments_.indexOf("--output");
const outputPath = resolve(root, outputIndex >= 0 && arguments_[outputIndex + 1]
  ? arguments_[outputIndex + 1]
  : ".private/KLOL_KAKAO_BOT_V4_UNIFIED_PRIVATE_MESSENGERBOT_R.js");

if (outputPath !== privateDirectory && !outputPath.startsWith(`${privateDirectory}${sep}`)) {
  throw new Error("Private MessengerBot output must stay under .private/");
}
try {
  await access(outputPath);
  throw new Error("Private V4 output already exists; remove it only as part of an explicit key rotation");
} catch (error) {
  if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
}
const relativeOutputPath = relative(root, outputPath).replaceAll("\\", "/");
const ignored = spawnSync("git", ["check-ignore", "--quiet", "--", relativeOutputPath], { cwd: root, windowsHide: true });
const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativeOutputPath], { cwd: root, windowsHide: true });
if (ignored.status !== 0 || tracked.status === 0) throw new Error("Private V4 output path must be ignored and untracked");

const identitySecret = randomBytes(32).toString("base64url");
const signingSecret = randomBytes(32).toString("base64url");
const keyId = "v4-current";
const settings = Object.freeze([
  ["KLOL_V2_BASE_URL", "https://k-lol-gg.vercel.app"],
  ["KLOL_V4_KAKAO_IDENTITY_SECRET", identitySecret],
  ["KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT", signingSecret],
  ["KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT", keyId],
  ["KLOL_V4_BOT_SELF_NAME_RECRUIT", "K-LOL 구인구직 도우미"],
  ["KLOL_V4_BOT_SELF_NAME_FEATURES", "Klol"],
]);

function configureProductionEnvironment(name, value, sensitive) {
  if (!/^[A-Z0-9_]+$/u.test(name)) throw new Error("Invalid Vercel environment variable name");
  const cliArguments = [
    "vercel", "env", "add", name, "production", "--force", "--yes",
    sensitive ? "--sensitive" : "--no-sensitive",
    "--project", "k-lol-gg", "--scope", "tjdmswo11-3715s-projects",
  ];
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npx";
  const spawnArguments = process.platform === "win32"
    ? ["/d", "/s", "/c", `npx.cmd ${cliArguments.join(" ")}`]
    : cliArguments;
  const result = spawnSync(executable, spawnArguments, { input: `${value}\n`, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    const detail = String(result.error?.message || result.stderr || result.stdout || "unknown CLI error").replaceAll(value, "[REDACTED]").trim();
    throw new Error(`Vercel Production environment update failed for ${name}: ${detail}`);
  }
}

if (configureVercel) {
  configureProductionEnvironment("KAKAO_V4_IDENTITY_SECRET", identitySecret, true);
  configureProductionEnvironment("KAKAO_V4_WEBHOOK_SECRET_CURRENT", signingSecret, true);
  configureProductionEnvironment("KAKAO_V4_WEBHOOK_KEY_ID_CURRENT", keyId, false);
}

const publicSource = (await readFile(publicPath, "utf8")).replace(/\r\n?/gu, "\n");
const preamble = [
  "/* PRIVATE LOCAL INSTALLER. DO NOT COMMIT OR SHARE. */",
  "var KLOL_V4_PRIVATE_SETTINGS_APPLIED = (function () {",
  ...settings.map(([name, value]) => `  DataBase.setDataBase(${JSON.stringify(name)}, ${JSON.stringify(value)});`),
  "  return true;",
  "}());",
  "",
].join("\n");
const output = `${preamble}${publicSource}`;
const program = acorn.parse(output, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
const findings = analyzeRhinoStatic(program);
if ((output.match(/function\s+response\s*\(/gu) ?? []).length !== 1) throw new Error("Private V4 output must define one response callback");
if (output.length >= 40_000 || output.length + (output.match(/\n/gu) ?? []).length >= 40_000) throw new Error("Private V4 output exceeds the release budget");
if (findings.statementCandidates.length || findings.unsafeSequenceOperands.length || findings.voidExpressions.length || findings.bareAssignmentConditions.length) {
  throw new Error("Private V4 output contains Rhino static warning candidates");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, { encoding: "utf8", flag: "wx" });
console.log(`Private V4 one-paste installer generated under .private (${output.length} characters).`);
console.log(`Vercel Production V4 keyring configured: ${configureVercel ? "yes" : "no"}.`);
