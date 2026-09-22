import { createHash, createHmac, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeRhinoStatic } from "./lib/messengerbot-rhino-static.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateRoot = resolve(root, ".private");
const output = resolve(privateRoot, "KLOL_SITE_NOTICE_COMPANION_PRIVATE.js");
const setupPath = resolve(privateRoot, "site-notice-setup.json");
const enabled = process.argv.includes("--enable");
if (process.argv.slice(2).some((arg) => arg !== "--enable")) throw new Error("Only --enable is accepted; default is OFF.");
for (const path of [output, setupPath]) {
  if (!path.startsWith(privateRoot + sep)) throw new Error("Private output path is invalid");
  const relativePath = relative(root, path).replaceAll("\\", "/");
  if (spawnSync("git", ["check-ignore", "--quiet", "--", relativePath], { cwd: root, windowsHide: true }).status !== 0 ||
      spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], { cwd: root, windowsHide: true }).status === 0) throw new Error("Private output must be ignored and untracked");
}
const approvedSource = await readFile(resolve(privateRoot, "KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js"), "utf8");
const settings = {};
for (const key of ["KLOL_V2_BASE_URL", "KLOL_V4_KAKAO_IDENTITY_SECRET", "KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT", "KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT"]) {
  const match = new RegExp(`DataBase\\.setDataBase\\("${key}",\\s*("(?:\\\\.|[^"\\\\])*")\\);`, "u").exec(approvedSource);
  if (!match) throw new Error(`Approved private setting missing: ${key}`);
  settings[key] = JSON.parse(match[1]);
}
let priorSetup = null;
try { priorSetup = JSON.parse(await readFile(setupPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw new Error("Existing private setup must be reviewed before regenerating"); }
const targetId = priorSetup?.targetId ?? randomBytes(16).toString("hex");
if (!/^[a-f0-9]{32}$/u.test(targetId)) throw new Error("Private target identity is invalid");
const registrationCode = randomBytes(16).toString("hex");
const setupRevision = randomBytes(16).toString("hex");
const targetHash = createHmac("sha256", settings.KLOL_V4_KAKAO_IDENTITY_SECRET).update(`site-notice-target\n${targetId}`).digest("hex");
const source = await readFile(resolve(root, "integrations/messengerbot-r/site-notices/KLOL_SITE_NOTICE_COMPANION.js"), "utf8");
const allSettings = { ...settings, KLOL_SITE_NOTICE_ENABLED: String(enabled), KLOL_SITE_NOTICE_TARGET_ID: targetId,
  KLOL_SITE_NOTICE_REGISTRATION_CODE: registrationCode };
const preamble = [
  "var KLOL_SITE_NOTICE_SETUP_FAILED = false;",
  "try {",
  `if (String(DataBase.getDataBase("KLOL_SITE_NOTICE_SETUP_REVISION") || "") !== ${JSON.stringify(setupRevision)}) {`,
  ...Object.entries(allSettings).map(([key, value]) => `DataBase.setDataBase(${JSON.stringify(key)}, ${JSON.stringify(value)});`),
  `DataBase.setDataBase("KLOL_SITE_NOTICE_SETUP_REVISION", ${JSON.stringify(setupRevision)});`,
  "}",
  "} catch (ignoredSetupFailure) { KLOL_SITE_NOTICE_SETUP_FAILED = true; }",
].join("\n");
const artifact = preamble + "\n" + source;
const acorn = createRequire(import.meta.url)("next/dist/compiled/acorn");
const findings = analyzeRhinoStatic(acorn.parse(artifact, { ecmaVersion: 5 }));
if (Object.values(findings).some((items) => items.length)) throw new Error("Companion has Rhino static warning candidates");
if (artifact.length >= 65535 || artifact.replace(/\n/g, "\r\n").length >= 65535) throw new Error("Companion exceeds phone editor limit");
await mkdir(resolve(privateRoot, "backups"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const path of [output, setupPath]) {
  try { await copyFile(path, resolve(privateRoot, "backups", relative(privateRoot, path) + "." + stamp)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
await writeFile(output, artifact, "utf8");
await writeFile(setupPath, JSON.stringify({ targetId, registrationCode, setupRevision, targetHash, enabled,
  serverEnvironment: { KAKAO_SITE_NOTICE_ENABLED: "false", KAKAO_SITE_NOTICE_TARGET_HASH: targetHash },
  registrationMessage: "사이트알림연동 " + registrationCode,
  note: "serverEnvironment는 기본 OFF 예시이며 운영 상태 조회가 아님. 등록 전에 운영자가 서버 targetHash 일치와 ENABLED=true 반영을 확인. 실제 충원 수신은 별도 검증. 재등록은 이 빌드를 다시 실행해 새 코드를 발급. 기존 파일 재컴파일은 코드를 복구하지 않음." }, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ artifact: ".private/KLOL_SITE_NOTICE_COMPANION_PRIVATE.js", setup: ".private/site-notice-setup.json", enabled,
  characters: artifact.length, sha256: createHash("sha256").update(artifact).digest("hex") }));
