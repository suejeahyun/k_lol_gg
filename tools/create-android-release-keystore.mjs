import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const keystorePath = resolve(process.env.KLOL_ANDROID_KEYSTORE_PATH || "android/secure/klol-release.keystore");
const keyAlias = process.env.KLOL_ANDROID_KEY_ALIAS || "klol-release";
const storePassword = process.env.KLOL_ANDROID_KEYSTORE_PASSWORD || randomBytes(24).toString("base64url");
const keyPassword = process.env.KLOL_ANDROID_KEY_PASSWORD || storePassword;

function getKeytoolExecutableName() {
  return process.platform === "win32" ? "keytool.exe" : "keytool";
}

function findKeytool() {
  const executable = getKeytoolExecutableName();

  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, "bin", executable))) {
    return join(process.env.JAVA_HOME, "bin", executable);
  }

  if (process.platform === "win32") {
    const roots = [
      "C:\\Program Files\\Eclipse Adoptium",
      "C:\\Program Files\\Java",
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Eclipse Adoptium") : null,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Java") : null,
    ].filter(Boolean);

    for (const root of roots) {
      if (!existsSync(root)) continue;
      const candidates = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, "bin", executable))
        .filter((candidate) => existsSync(candidate))
        .sort()
        .reverse();

      if (candidates[0]) return candidates[0];
    }
  }

  return "keytool";
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    shell: false,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    if (result.error) throw result.error;
    throw new Error(`${command} failed with status ${result.status}`);
  }
}

if (existsSync(keystorePath) && !args.has("--force")) {
  throw new Error(`Keystore already exists: ${keystorePath}. Use --force only if you intentionally want to replace it.`);
}

mkdirSync(dirname(keystorePath), { recursive: true });

run(findKeytool(), [
  "-genkeypair",
  "-v",
  "-keystore",
  keystorePath,
  "-storepass",
  storePassword,
  "-alias",
  keyAlias,
  "-keypass",
  keyPassword,
  "-keyalg",
  "RSA",
  "-keysize",
  "2048",
  "-validity",
  "10000",
  "-dname",
  "CN=K-LOL.GG, OU=K-LOL.GG, O=K-LOL.GG, L=Seoul, S=Seoul, C=KR",
  "-noprompt",
]);

console.log("");
console.log("Android release keystore created.");
console.log(`Keystore: ${keystorePath}`);
console.log("");
console.log("Save these PowerShell env commands in your private notes:");
console.log(`$env:KLOL_ANDROID_KEYSTORE_PATH="${keystorePath}"`);
console.log(`$env:KLOL_ANDROID_KEYSTORE_PASSWORD="${storePassword}"`);
console.log(`$env:KLOL_ANDROID_KEY_ALIAS="${keyAlias}"`);
console.log(`$env:KLOL_ANDROID_KEY_PASSWORD="${keyPassword}"`);
console.log("");
console.log("Do not commit the keystore file or passwords.");
