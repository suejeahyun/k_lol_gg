import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function getTrackedFiles() {
  const out = runGit(["ls-files"]);
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean);
}

function getDeletedTrackedFiles() {
  const out = runGit(["ls-files", "--deleted"]);
  if (!out) return new Set();
  return new Set(out.split(/\r?\n/).filter(Boolean));
}

function exists(filePath) {
  return fs.existsSync(path.join(ROOT, filePath));
}

const deletedTrackedFiles = getDeletedTrackedFiles();
const trackedFiles = getTrackedFiles().filter((file) => !deletedTrackedFiles.has(file));
const problems = [];

const forbiddenTrackedExact = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.vercel.production",
  "ALL.zip",
];

for (const file of forbiddenTrackedExact) {
  if (trackedFiles.includes(file)) {
    problems.push(`Git 추적 금지 파일: ${file}`);
  }
}

for (const file of trackedFiles) {
  if (/^\.env.*production/i.test(file)) {
    problems.push(`Git 추적 금지 배포 환경 파일: ${file}`);
  }

  if (/^\.env.*vercel/i.test(file)) {
    problems.push(`Git 추적 금지 Vercel 환경 파일: ${file}`);
  }

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

    if (entry.isDirectory() && ![".git", "node_modules"].includes(entry.name)) {
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
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /VERCEL_OIDC_TOKEN\s*=\s*eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
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
  ".html",
  ".map",
  ".log",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
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
    if (fs.statSync(abs).size > 25 * 1024 * 1024) continue;
    content = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }

  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match && !/(?:synthetic|fixture|example|dummy|placeholder|qa[-_])/i.test(match[0])) {
      problems.push(`SECRET 패턴 노출 의심: ${file}`);
      break;
    }
  }
}

const historyPattern = [
  "KLOL-SP-[A-Za-z0-9_-]+",
  "klol-recruit-[A-Za-z0-9_-]+",
  "(^|[^[:alnum:]_])sk-[A-Za-z0-9_-]{20,}",
  "VERCEL_OIDC_TOKEN[[:space:]]*=[[:space:]]*eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}",
  "eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}",
].join("|");
const historyHits = runGit([
  "log",
  "--all",
  "--format=%H",
  "--name-only",
  `-G${historyPattern}`,
  "--",
  ".",
]);
if (historyHits) {
  problems.push("Git history에서 비밀 패턴 변경 이력이 감지되었습니다. 값과 commit 식별자는 출력하지 않았습니다.");
}

if (problems.length > 0) {
  console.error("보안 노출 점검 실패:");
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log("보안 노출 점검 완료");
