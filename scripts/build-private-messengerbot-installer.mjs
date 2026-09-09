import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [sourceInstallerArgument, outputInstallerArgument] = process.argv.slice(2);
if (!sourceInstallerArgument || !outputInstallerArgument) {
  throw new Error("Usage: node scripts/build-private-messengerbot-installer.mjs <approved-private-source> <private-output>");
}

const root = process.cwd();
const sourceInstallerPath = resolve(root, sourceInstallerArgument);
const outputInstallerPath = resolve(root, outputInstallerArgument);
const mobilePath = resolve(root, "integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js");
const settingKeys = [
  "KLOL_V2_BASE_URL",
  "KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT",
  "KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT",
  "KLOL_V2_KAKAO_IDENTITY_SECRET",
];

const [sourceInstaller, mobile] = await Promise.all([
  readFile(sourceInstallerPath, "utf8"),
  readFile(mobilePath, "utf8"),
]);
const settings = new Map();
const settingPattern = /"(KLOL_[A-Z0-9_]+)":"((?:\\.|[^"\\])*)"/g;
const settingsRegion = sourceInstaller.slice(0, 4_096);
let match = null;
while ((match = settingPattern.exec(settingsRegion)) !== null) {
  if (!settingKeys.includes(match[1]) || settings.has(match[1])) continue;
  settings.set(match[1], JSON.parse(`"${match[2]}"`));
}
for (const key of settingKeys) {
  if (!settings.has(key) || !settings.get(key)) throw new Error(`Approved private setting is missing: ${key}`);
}
if (settings.size !== settingKeys.length) throw new Error("Approved private settings are not exact");

const canonicalSettings = settingKeys.map((key) => `${key}\0${settings.get(key)}`).join("\0");
const settingFingerprint = createHash("sha256").update(canonicalSettings, "utf8").digest("hex");
const preamble = settingKeys
  .map((key) => `DataBase.setDataBase(${JSON.stringify(key)},${JSON.stringify(settings.get(key))});`)
  .join("");
const privateInstaller = `${preamble}\n${mobile}`;
const crlfProjection = privateInstaller.length + (privateInstaller.match(/\n/g) || []).length;
if (privateInstaller.length >= 65_535 || crlfProjection >= 65_535) {
  throw new Error(`Private installer exceeds the MessengerBot R limit: LF=${privateInstaller.length}, CRLF=${crlfProjection}`);
}
await writeFile(outputInstallerPath, privateInstaller, "utf8");
const privateSha256 = createHash("sha256").update(privateInstaller, "utf8").digest("hex");
console.log(`Private installer generated: settingsPreserved=true, settingsFingerprint=${settingFingerprint}`);
console.log(`Private installer characters: ${privateInstaller.length}`);
console.log(`Private installer CRLF projection: ${crlfProjection}`);
console.log(`Private installer bytes: ${Buffer.byteLength(privateInstaller, "utf8")}`);
console.log(`Private installer SHA-256: ${privateSha256}`);
