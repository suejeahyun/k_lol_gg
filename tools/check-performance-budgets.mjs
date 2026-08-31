import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const routeStatsPath = path.join(projectRoot, ".next", "diagnostics", "route-bundle-stats.json");
const CORE_ROUTE_BUDGET_BYTES = 650 * 1024;
const PUBLIC_ROUTE_BUDGET_BYTES = 850 * 1024;
const coreRoutes = new Set([
  "/",
  "/recruit",
  "/players",
  "/matches",
  "/rankings",
  "/app",
  "/app/recruits",
  "/coin-toss",
  "/random-team",
  "/ai-balance",
  "/discipline",
  "/highlights",
]);

const assetBudgets = [
  {
    relativePath: "public/images/theme/bloom/klol-bloom-hero-v1.webp",
    maxBytes: 160 * 1024,
  },
  {
    relativePath: "public/images/theme/bloom/klol-sallangi-mascot-v1.webp",
    maxBytes: 100 * 1024,
  },
];

let routeStats;
try {
  routeStats = JSON.parse(await readFile(routeStatsPath, "utf8"));
} catch {
  console.error("성능 예산 점검 전에 npm run build를 실행해야 합니다.");
  process.exit(1);
}

const failures = [];
for (const entry of routeStats) {
  if (!entry || typeof entry.route !== "string") continue;
  if (typeof entry.firstLoadUncompressedJsBytes !== "number") continue;

  if (
    coreRoutes.has(entry.route) &&
    entry.firstLoadUncompressedJsBytes > CORE_ROUTE_BUDGET_BYTES
  ) {
    failures.push(
      `${entry.route}: 핵심 화면 JS ${entry.firstLoadUncompressedJsBytes}바이트 ` +
        `(예산 ${CORE_ROUTE_BUDGET_BYTES}바이트)`,
    );
  }

  const isPublicRoute = !entry.route.startsWith("/admin") && !entry.route.startsWith("/api");
  if (isPublicRoute && entry.firstLoadUncompressedJsBytes > PUBLIC_ROUTE_BUDGET_BYTES) {
    failures.push(
      `${entry.route}: 공개 화면 JS ${entry.firstLoadUncompressedJsBytes}바이트 ` +
        `(예산 ${PUBLIC_ROUTE_BUDGET_BYTES}바이트)`,
    );
  }
}

for (const asset of assetBudgets) {
  const assetPath = path.join(projectRoot, asset.relativePath);
  const assetStat = await stat(assetPath);
  if (assetStat.size > asset.maxBytes) {
    failures.push(
      `${asset.relativePath}: ${assetStat.size}바이트 (예산 ${asset.maxBytes}바이트)`,
    );
  }
}

if (failures.length > 0) {
  console.error("성능 예산을 초과했습니다:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("핵심 화면 JS와 Bright Bloom 이미지 성능 예산 통과");
