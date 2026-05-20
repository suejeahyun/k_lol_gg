import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();

function runGit(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function getTrackedFiles() {
  const out = runGit("ls-files");
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean);
}

function exists(filePath) {
  return fs.existsSync(path.join(ROOT, filePath));
}

const trackedFiles = getTrackedFiles();
const problems = [];

const forbiddenTrackedExact = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "ALL.zip",
];

for (const file of forbiddenTrackedExact) {
  if (trackedFiles.includes(file)) {
    problems.push(`Git 추적 금지 파일: ${file}`);
  }
}

for (const file of trackedFiles) {
  if (/\.bak(_|\b)/i.test(file)) {
    problems.push(`Git 추적 금지 백업 파일: ${file}`);
  }

  if (/\.zip$/i.test(file)) {
    problems.push(`Git 추적 금지 ZIP 파일: ${file}`);
  }
}

const forbiddenExisting = [
  "ALL.zip",
];

for (const file of forbiddenExisting) {
  if (exists(file)) {
    problems.push(`삭제 필요 파일: ${file}`);
  }
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");

    if (
      entry.isDirectory() &&
      ![
        ".git",
        ".next",
        "node_modules",
        ".vercel",
        "dist",
        "build",
        "coverage",
      ].includes(entry.name)
    ) {
      walk(full, acc);
      continue;
    }

    if (entry.isFile()) {
      acc.push(rel);
    }
  }

  return acc;
}

const files = walk(ROOT);
const secretPatterns = [
  /KLOL-SP-[A-Za-z0-9_-]+/g,
  /klol-recruit-[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
];

const scanExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".txt",
  ".env.example",
]);

for (const file of files) {
  const ext = path.extname(file);
  const base = path.basename(file);

  if (
    file === ".env" ||
    file === ".env.local" ||
    file === ".env.production" ||
    file === ".env.development"
  ) {
    continue;
  }

  if (!scanExtensions.has(ext) && base !== ".env.example") {
    continue;
  }

  const abs = path.join(ROOT, file);
  let content = "";

  try {
    content = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }

  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      problems.push(`SECRET 패턴 노출 의심: ${file}`);
      break;
    }
  }
}

if (problems.length > 0) {
  console.error("보안 노출 점검 실패:");
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log("보안 노출 점검 완료");
