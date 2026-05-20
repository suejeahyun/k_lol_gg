import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcDir = join(root, "src");
const stylesDir = join(root, "src", "styles");
const globals = join(root, "src", "app", "globals.css");

function existsSafe(path) {
  try { statSync(path); return true; } catch { return false; }
}
function walk(dir, pred = () => true) {
  if (!existsSafe(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, pred));
    else if (pred(full)) out.push(full);
  }
  return out;
}

const cssFiles = walk(stylesDir, (file) => file.endsWith(".css"));
const sourceText = [
  existsSafe(globals) ? readFileSync(globals, "utf8") : "",
  ...walk(srcDir, (file) => /\.(ts|tsx|css)$/.test(file)).map((file) => readFileSync(file, "utf8")),
].join("\n");

const unused = cssFiles.filter((file) => {
  const relFromApp = relative(join(root, "src", "app"), file).replaceAll("\\", "/");
  const relFromSrc = relative(srcDir, file).replaceAll("\\", "/");
  return !sourceText.includes(relFromApp) && !sourceText.includes(relFromSrc);
});

if (unused.length === 0) {
  console.log("미사용 CSS 후보 없음");
} else {
  console.log("미사용 CSS 후보:");
  for (const file of unused) console.log(`- ${relative(root, file).replaceAll("\\", "/")}`);
}
