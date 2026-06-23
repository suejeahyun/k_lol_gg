import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

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

function slash(path) {
  return path.replaceAll("\\", "/");
}

function read(file) {
  return readFileSync(file, "utf8");
}

function resolveCssImport(fromFile, specifier) {
  if (!specifier || /^(https?:|data:)/i.test(specifier)) return null;
  const resolved = resolve(dirname(fromFile), specifier);
  if (existsSafe(resolved)) return normalize(resolved);
  if (existsSafe(`${resolved}.css`)) return normalize(`${resolved}.css`);
  return null;
}

const cssFiles = walk(stylesDir, (file) => file.endsWith(".css")).map((file) => normalize(file));
const used = new Set();
const queue = [];

function markUsed(file) {
  const normalized = normalize(file);
  if (!cssFiles.includes(normalized)) return;
  if (used.has(normalized)) return;
  used.add(normalized);
  queue.push(normalized);
}

if (existsSafe(globals)) {
  const globalsText = read(globals);
  for (const match of globalsText.matchAll(/@import\s+(?:url\()?['\"]?([^'\")]+)['\"]?\)?\s*;/g)) {
    const imported = resolveCssImport(globals, match[1]);
    if (imported) markUsed(imported);
  }
}

const tsCssRefs = walk(srcDir, (file) => /\.(ts|tsx|js|jsx)$/.test(file));
for (const file of tsCssRefs) {
  const text = read(file);
  for (const cssFile of cssFiles) {
    const relFromFile = slash(relative(dirname(file), cssFile));
    const relFromSrc = slash(relative(srcDir, cssFile));
    const relFromApp = slash(relative(join(root, "src", "app"), cssFile));
    if (
      text.includes(relFromFile) ||
      text.includes(`./${relFromFile}`) ||
      text.includes(relFromSrc) ||
      text.includes(relFromApp)
    ) {
      markUsed(cssFile);
    }
  }
}

while (queue.length > 0) {
  const file = queue.shift();
  const text = read(file);
  for (const match of text.matchAll(/@import\s+(?:url\()?['\"]?([^'\")]+)['\"]?\)?\s*;/g)) {
    const imported = resolveCssImport(file, match[1]);
    if (imported) markUsed(imported);
  }
}

const unused = cssFiles.filter((file) => !used.has(file));

if (unused.length === 0) {
  console.log("미사용 CSS 후보 없음");
} else {
  console.log("미사용 CSS 후보:");
  for (const file of unused) console.log(`- ${slash(relative(root, file))}`);
}
