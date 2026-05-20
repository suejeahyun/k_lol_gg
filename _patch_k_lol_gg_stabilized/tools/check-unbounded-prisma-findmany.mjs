import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcDir = join(root, "src");
const allowed = [
  "src/lib/stats/recalculate.ts",
  "src/lib/balance/internal-mmr.ts",
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

const warnings = [];
for (const file of walk(srcDir)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (allowed.includes(rel)) continue;
  const source = readFileSync(file, "utf8");
  const regex = /\.findMany\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let match;
  while ((match = regex.exec(source))) {
    const body = match[1];
    if (!/\btake\s*:/.test(body) && !/\bcursor\s*:/.test(body)) {
      warnings.push(`${rel}:${lineNumber(source, match.index)}`);
    }
  }
}

if (warnings.length > 0) {
  console.warn("무제한 findMany 후보입니다. 대량 데이터 API는 take/pagination을 적용하세요:");
  for (const item of warnings.slice(0, 120)) console.warn(`- ${item}`);
  if (warnings.length > 120) console.warn(`...외 ${warnings.length - 120}개`);
}

console.log("findMany 점검 완료");
