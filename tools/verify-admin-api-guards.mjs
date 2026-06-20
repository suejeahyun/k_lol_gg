import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const apiAdminDir = join(root, "src", "app", "api", "admin");
const allowedPublic = new Set([
  join(apiAdminDir, "login", "route.ts"),
  join(apiAdminDir, "logout", "route.ts"),
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (name === "route.ts" || name === "route.tsx") out.push(full);
  }
  return out;
}

const files = walk(apiAdminDir);
const missing = [];

for (const file of files) {
  if (allowedPublic.has(file)) continue;
  const source = readFileSync(file, "utf8");
  const hasGuard =
    source.includes("rejectIfNotAdmin") ||
    source.includes("rejectIfNotSuperAdmin") ||
    source.includes("requireAdminRequest") ||
    source.includes("requireSuperAdminRequest") ||
    source.includes("getAdminOrResponse");

  if (!hasGuard) missing.push(relative(root, file));
}

if (missing.length > 0) {
  console.error("관리자 API guard 누락 후보:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`관리자 API guard 확인 완료: ${files.length}개 route 검사`);
