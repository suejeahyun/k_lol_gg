import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function commandExists(command, args = ["--version"], env = {}) {
  const useShell = process.platform === "win32" && !/[\\/]/.test(command);
  const result = spawnSync(useShell ? [command, ...args].join(" ") : command, useShell ? [] : args, {
    env: { ...process.env, ...env },
    shell: useShell,
    stdio: "pipe",
    encoding: "utf8",
  });

  return {
    ok: result.status === 0,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
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

function checkJava() {
  const pathJava = commandExists("java", ["-version"]);
  if (pathJava.ok && /version "2[1-9]\./.test(pathJava.output)) return pathJava;

  const javaHome = findJavaHome();
  if (!javaHome) return pathJava;

  const java = commandExists(join(javaHome, "bin", getJavaExecutableName()), ["-version"], {
    JAVA_HOME: javaHome,
  });

  return {
    ok: java.ok,
    output: java.ok ? `${java.output.split("\n")[0]} (detected: ${javaHome})` : pathJava.output,
  };
}

function hasAndroidHome(androidHome) {
  return (
    Boolean(androidHome) &&
    existsSync(join(androidHome, "platforms", "android-36")) &&
    existsSync(join(androidHome, "build-tools", "36.0.0"))
  );
}

function checkAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "win32" && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
    process.platform === "win32" ? "C:\\Android\\Sdk" : null,
  ].filter(Boolean);

  const androidHome = candidates.find((candidate) => hasAndroidHome(candidate));

  return {
    ok: Boolean(androidHome),
    output: androidHome ? `${androidHome} (platform android-36, build-tools 36.0.0)` : "ANDROID_HOME / Android SDK 36",
  };
}

const checks = [
  {
    label: "Node.js",
    ...commandExists("node", ["--version"]),
  },
  {
    label: "npm",
    ...commandExists("npm", ["--version"]),
  },
  {
    label: "Java",
    ...checkJava(),
  },
  {
    label: "Android SDK",
    ...checkAndroidSdk(),
  },
  {
    label: "Android project",
    ok: existsSync(join(process.cwd(), "android", "gradlew.bat")) || existsSync(join(process.cwd(), "android", "gradlew")),
    output: "android/gradlew",
  },
  {
    label: "Capacitor config",
    ok: existsSync(join(process.cwd(), "capacitor.config.ts")),
    output: "capacitor.config.ts",
  },
];

for (const check of checks) {
  console.log(`${check.ok ? "OK" : "MISSING"} ${check.label}${check.output ? ` - ${check.output.split("\n")[0]}` : ""}`);
}

const failed = checks.filter((check) => !check.ok);

if (failed.length > 0) {
  console.log("\nAndroid APK 빌드 전 필요한 항목이 부족합니다.");
  if (failed.some((check) => check.label === "Java")) {
    console.log("Java가 없으면 JDK 21 이상을 설치하고 JAVA_HOME/PATH를 설정해야 합니다.");
    console.log("Windows 예: winget install EclipseAdoptium.Temurin.21.JDK");
  }
  process.exitCode = 1;
}
