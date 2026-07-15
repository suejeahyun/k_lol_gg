import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const args = new Set(process.argv.slice(2));
const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg?.split("=")[1] === "release" ? "release" : "debug";
const task = mode === "release" ? "assembleRelease" : "assembleDebug";
const androidDir = join(root, "android");
const downloadDir = join(root, "public", "downloads", "android");
const latestJsonPath = join(downloadDir, "latest.json");

function run(command, commandArgs, options = {}) {
  const useShell = process.platform === "win32";
  const result = spawnSync(useShell ? [command, ...commandArgs].join(" ") : command, useShell ? [] : commandArgs, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: useShell,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`${command} ${commandArgs.join(" ")} failed with status ${result.status}`);
  }
}

function getJavaExecutableName() {
  return process.platform === "win32" ? "java.exe" : "java";
}

function getJavaMajor(javaHome) {
  if (!javaHome) return 0;

  try {
    const releaseFile = readFileSync(join(javaHome, "release"), "utf8");
    const version = releaseFile.match(/JAVA_VERSION="(\d+)/)?.[1];
    if (version) return Number(version);
  } catch {
    // Fall back to the directory name below.
  }

  return Number(String(javaHome).match(/jdk[-_ ]?(\d+)/i)?.[1] ?? 0);
}

function hasJavaHome(javaHome) {
  return Boolean(javaHome) && getJavaMajor(javaHome) >= 21 && existsSync(join(javaHome, "bin", getJavaExecutableName()));
}

function findJavaHome() {
  if (hasJavaHome(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }

  if (process.platform !== "win32") {
    return null;
  }

  const roots = [
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Java",
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Eclipse Adoptium") : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Java") : null,
  ].filter(Boolean);
  const candidates = [];

  for (const rootDir of roots) {
    if (!existsSync(rootDir)) continue;

    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(rootDir, entry.name);
      const normalized = entry.name.toLowerCase();
      if ((normalized.includes("jdk") || normalized.includes("temurin")) && hasJavaHome(fullPath)) {
        candidates.push(fullPath);
      }
    }
  }

  return candidates.sort().reverse()[0] ?? null;
}

function withJavaEnv(extraEnv = {}) {
  const javaHome = findJavaHome();
  if (!javaHome) return extraEnv;

  const currentPath = process.env.Path || process.env.PATH || "";
  const javaPath = `${join(javaHome, "bin")};${currentPath}`;

  return {
    ...extraEnv,
    JAVA_HOME: javaHome,
    Path: javaPath,
    PATH: javaPath,
  };
}

function hasAndroidHome(androidHome) {
  return (
    Boolean(androidHome) &&
    existsSync(join(androidHome, "platforms", "android-36")) &&
    existsSync(join(androidHome, "build-tools", "36.0.0"))
  );
}

function findAndroidHome() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "win32" && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
    process.platform === "win32" ? "C:\\Android\\Sdk" : null,
  ].filter(Boolean);

  return candidates.find((candidate) => hasAndroidHome(candidate)) ?? null;
}

function withAndroidEnv(extraEnv = {}) {
  const androidHome = findAndroidHome();
  if (!androidHome) return extraEnv;

  const currentPath = extraEnv.Path || extraEnv.PATH || process.env.Path || process.env.PATH || "";
  const androidPath = `${join(androidHome, "cmdline-tools", "latest", "bin")};${join(androidHome, "platform-tools")};${currentPath}`;

  return {
    ...extraEnv,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
    Path: androidPath,
    PATH: androidPath,
  };
}

function findBuiltApk() {
  const candidates =
    mode === "release"
      ? [
          join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk"),
          join(androidDir, "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk"),
        ]
      : [join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk")];

  return candidates.find((candidate) => existsSync(candidate));
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function resolveBuildNumber() {
  const value = Number(process.env.KLOL_ANDROID_BUILD_NUMBER || 1);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("KLOL_ANDROID_BUILD_NUMBER must be a positive integer.");
  }
  return value;
}

function resolveReleaseSigningEnv() {
  if (mode !== "release") return {};

  const keystorePath = process.env.KLOL_ANDROID_KEYSTORE_PATH?.trim();
  const keystorePassword = process.env.KLOL_ANDROID_KEYSTORE_PASSWORD?.trim();
  const keyAlias = process.env.KLOL_ANDROID_KEY_ALIAS?.trim();
  const explicitKeyPassword = process.env.KLOL_ANDROID_KEY_PASSWORD?.trim();
  const keyPassword = explicitKeyPassword || keystorePassword;

  const missing = [
    ["KLOL_ANDROID_KEYSTORE_PATH", keystorePath],
    ["KLOL_ANDROID_KEYSTORE_PASSWORD", keystorePassword],
    ["KLOL_ANDROID_KEY_ALIAS", keyAlias],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      [
        "Release APK signing is not configured.",
        `Missing env: ${missing.join(", ")}`,
        "Set these variables in your local PowerShell session before running npm run android:build:release.",
        "Never commit keystore files or passwords.",
      ].join(" "),
    );
  }

  const absoluteKeystorePath = resolve(keystorePath);
  if (!existsSync(absoluteKeystorePath)) {
    throw new Error(`KLOL_ANDROID_KEYSTORE_PATH does not exist: ${absoluteKeystorePath}`);
  }

  return {
    KLOL_ANDROID_KEYSTORE_PATH: absoluteKeystorePath,
    KLOL_ANDROID_KEYSTORE_PASSWORD: keystorePassword,
    KLOL_ANDROID_KEY_ALIAS: keyAlias,
    KLOL_ANDROID_KEY_PASSWORD: keyPassword,
  };
}

function writeLatest(apkFileName, apkSize) {
  const isRelease = mode === "release";
  const notes = isRelease
    ? [
        "Android APK 직접 배포용 빌드입니다.",
        "설치 중 보안 안내가 나오면 ‘알 수 없는 앱 설치 허용’을 켜주세요.",
        "APK 안에는 DB, Riot, OpenAI, Kakao 같은 민감한 키가 포함되지 않습니다.",
      ]
    : [
        "디버그 테스트용 APK입니다. 실제 방 배포 전 release 빌드를 권장합니다.",
        "설치 중 보안 안내가 나오면 ‘알 수 없는 앱 설치 허용’을 켜주세요.",
        "APK 안에는 DB, Riot, OpenAI, Kakao 같은 민감한 키가 포함되지 않습니다.",
      ];

  const metadata = {
    available: true,
    channel: mode,
    version: packageJson.version,
    buildNumber: resolveBuildNumber(),
    apkUrl: `/downloads/android/${apkFileName}`,
    apkSize,
    updatedAt: new Date().toISOString(),
    minAndroidVersion: "Android 8.0+",
    notes,
  };

  writeFileSync(latestJsonPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

if (!existsSync(androidDir)) {
  run("npx", ["cap", "add", "android"]);
}

const androidBuildNumber = String(resolveBuildNumber());
const androidVersionName = process.env.KLOL_ANDROID_VERSION_NAME || packageJson.version;
const releaseSigningEnv = resolveReleaseSigningEnv();

if (!args.has("--skip-sync")) {
  run("npx", ["cap", "sync", "android"]);
}

run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", [task], {
  cwd: androidDir,
  env: withAndroidEnv(withJavaEnv({
    KLOL_ANDROID_BUILD_NUMBER: androidBuildNumber,
    KLOL_ANDROID_VERSION_NAME: androidVersionName,
    ...releaseSigningEnv,
  })),
});

const builtApk = findBuiltApk();
if (!builtApk) {
  throw new Error(`APK output not found after ${task}`);
}

if (mode === "release" && basename(builtApk).includes("unsigned")) {
  throw new Error(
    [
      "Release APK is unsigned and cannot be used for direct distribution.",
      "Configure Android release signing first, or build a debug APK for internal testing.",
    ].join(" "),
  );
}

mkdirSync(downloadDir, { recursive: true });

const suffix = mode;
const apkFileName = `klol-${packageJson.version}-${suffix}.apk`;
const targetApk = resolve(downloadDir, apkFileName);

copyFileSync(builtApk, targetApk);
writeLatest(apkFileName, formatSize(statSync(targetApk).size));

console.log(`\nAPK copied: ${targetApk}`);
console.log(`Release metadata updated: ${latestJsonPath}`);
