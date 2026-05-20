import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const targetExtensions = new Set([".ts", ".tsx"]);
const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next"].includes(entry.name)) continue;
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !targetExtensions.has(path.extname(entry.name))) continue;
    inspectFile(fullPath);
  }
}

function hasTakeNear(source, index) {
  const snippet = source.slice(index, index + 800);
  return /\btake\s*:/.test(snippet) || /\bskip\s*:/.test(snippet);
}

function inspectFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const matches = source.matchAll(/\.findMany\s*\(/g);
  for (const match of matches) {
    if (hasTakeNear(source, match.index ?? 0)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    findings.push(`${path.relative(root, file).replaceAll(path.sep, "/")}:${line}`);
  }
}

walk(srcDir);

if (findings.length > 0) {
  console.warn("\n[UNBOUNDED findMany REPORT]");
  console.warn("아래 조회는 목록 데이터 증가 시 pagination/select 검토가 필요합니다.");
  for (const item of findings) console.warn(`- ${item}`);
  console.warn("\n보고용 스크립트입니다. 실패 처리하지 않습니다.\n");
} else {
  console.log("[UNBOUNDED findMany REPORT] No obvious unbounded findMany calls found.");
}
