import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiAdminDir = path.join(root, "src", "app", "api", "admin");
const guardPatterns = [
  "rejectIfNotAdmin",
  "rejectIfNotSuperAdmin",
  "requireAdminRequest",
  "requireSuperAdminRequest",
];
const methodPattern = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile() && entry.name === "route.ts") return [fullPath];
    return [];
  });
}

const publicAdminAuthRoutes = new Set([
  "src/app/api/admin/login/route.ts",
  "src/app/api/admin/logout/route.ts",
]);

const failures = [];
for (const file of walk(apiAdminDir)) {
  const relativeFile = path.relative(root, file).replaceAll(path.sep, "/");
  if (publicAdminAuthRoutes.has(relativeFile)) continue;
  const source = fs.readFileSync(file, "utf8");
  const methods = [...source.matchAll(methodPattern)].map((match) => match[1]);
  if (methods.length === 0) continue;

  const hasGuard = guardPatterns.some((pattern) => source.includes(pattern));
  if (!hasGuard) {
    failures.push({
      file: relativeFile,
      methods: [...new Set(methods)],
    });
  }
}

if (failures.length > 0) {
  console.error("\n[ADMIN API GUARD CHECK FAILED]");
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.methods.join(", ")}`);
  }
  console.error("\n위 route는 관리자 권한 검사를 추가해야 합니다.\n");
  process.exit(1);
}

console.log("[ADMIN API GUARD CHECK PASSED] Mutating /api/admin routes contain an admin guard.");
