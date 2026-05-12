import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const candidateFile = path.join(root, "docs", "delete-unused-css-candidates.txt");

if (!fs.existsSync(candidateFile)) {
  console.error("docs/delete-unused-css-candidates.txt 파일이 없습니다.");
  process.exit(1);
}

const candidates = fs
  .readFileSync(candidateFile, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

for (const rel of candidates) {
  const fullPath = path.join(root, rel);
  if (!fullPath.startsWith(root)) continue;
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { force: true });
    console.log(`[deleted] ${rel}`);
  }
}

spawnSync(process.platform === "win32" ? "powershell" : "bash", [
  process.platform === "win32" ? "-NoProfile" : "-lc",
  process.platform === "win32"
    ? "Get-ChildItem -Path src\\styles -Directory -Recurse | Where-Object { -not (Get-ChildItem $_.FullName -Force) } | Remove-Item -Force"
    : "find src/styles -type d -empty -delete",
], { stdio: "inherit", shell: false });
