import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const arguments_ = process.argv.slice(2);
const freshIdentity = arguments_.includes("--fresh-identity");
const positional = arguments_.filter((argument) => argument !== "--fresh-identity");
const [sourceInstallerArgument, outputInstallerArgument] = positional;
if (!sourceInstallerArgument || !outputInstallerArgument) {
  throw new Error("Usage: node scripts/build-private-messengerbot-installer.mjs <approved-private-source> <private-output> [--fresh-identity]");
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
const settingsRegion = sourceInstaller.slice(0, 4_096);
const settingPatterns = [
  /"(KLOL_[A-Z0-9_]+)":"((?:\\.|[^"\\])*)"/g,
  /DataBase\.setDataBase\(\s*"(KLOL_[A-Z0-9_]+)"\s*,\s*"((?:\\.|[^"\\])*)"\s*\)/g,
];
for (const settingPattern of settingPatterns) {
  let match = null;
  while ((match = settingPattern.exec(settingsRegion)) !== null) {
    if (!settingKeys.includes(match[1])) continue;
    const value = JSON.parse(`"${match[2]}"`);
    if (settings.has(match[1]) && settings.get(match[1]) !== value) {
      throw new Error(`Approved private setting is ambiguous: ${match[1]}`);
    }
    settings.set(match[1], value);
  }
}
for (const key of settingKeys) {
  if (!settings.has(key) || !settings.get(key)) throw new Error(`Approved private setting is missing: ${key}`);
}
if (settings.size !== settingKeys.length) throw new Error("Approved private settings are not exact");
if (freshIdentity) settings.set("KLOL_V2_KAKAO_IDENTITY_SECRET", randomBytes(32).toString("base64url"));

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
const installationId = `install-${createHmac("sha256", settings.get("KLOL_V2_KAKAO_IDENTITY_SECRET"))
  .update("installation-id\nKLOL_V41", "utf8").digest("hex").slice(0, 32)}`;
console.log(`Private installer generated: sharedSettingsPreserved=true, identityPreserved=${!freshIdentity}`);
console.log(`Private installer identity: ${freshIdentity ? "fresh" : "preserved"}, installationId=${installationId}`);
console.log(`Private installer characters: ${privateInstaller.length}`);
console.log(`Private installer CRLF projection: ${crlfProjection}`);
console.log(`Private installer bytes: ${Buffer.byteLength(privateInstaller, "utf8")}`);
console.log(`Private installer SHA-256: ${privateSha256}`);
