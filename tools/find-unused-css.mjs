import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const ignoreDirs = new Set(["node_modules", ".next"]);
const cssFiles = [];
const sourceFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) walk(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".css")) cssFiles.push(fullPath);
    if (/\.(ts|tsx|css)$/.test(entry.name)) sourceFiles.push(fullPath);
  }
}

walk(srcDir);

const corpus = sourceFiles
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

const unused = cssFiles
  .filter((file) => !corpus.includes(path.basename(file)))
  .map((file) => path.relative(root, file).replaceAll(path.sep, "/"))
  .sort();

if (unused.length === 0) {
  console.log("[UNUSED CSS] 후보 없음");
} else {
  console.log("[UNUSED CSS] import 참조가 없는 후보:");
  for (const file of unused) console.log(file);
}
