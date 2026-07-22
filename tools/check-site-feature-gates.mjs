import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve("src/app");

// Layouts can provide inherited guards, but they are not independently
// reachable feature endpoints and should not be reported as missing a guard.
const routeFiles = ["page.tsx", "route.ts"];
const pageGuardPattern = /PremiumFeatureGate|isSiteFeatureEnabled/;
const apiGuardPattern = /requireSiteFeature|isSiteFeatureEnabled/;

const rules = [
  {
    feature: "kakao",
    patterns: [
      /\/api\/kakao\//,
      /\/api\/admin\/kakao\//,
      /\/\(admin\)\/admin\/kakao\//,
      /\/\(admin\)\/admin\/logs\/kakao\//,
      /\/\(user\)\/kakao\//,
      /\/\(user\)\/recruit-helper\//,
    ],
  },
  {
    feature: "recruit",
    patterns: [
      /\/api\/recruits\//,
      /\/api\/admin\/recruits\//,
      /\/api\/admin\/destruction-scrim-recruits\//,
      /\/api\/kakao\/party-recruits\//,
      /\/api\/kakao\/destruction-scrim-recruits\//,
      /\/api\/kakao\/recruit\//,
      /\/\(user\)\/recruit\//,
      /\/\(admin\)\/admin\/recruits\//,
      /\/app\/recruits\//,
      /\/app\/admin\/recruits\//,
    ],
  },
  {
    feature: "balanceAi",
    patterns: [
      /\/api\/team-balance\//,
      /\/api\/players\/balance\//,
      /\/api\/admin\/balance\//,
      /\/api\/admin\/balance-ai\//,
      /\/api\/admin\/players\/\[playerId\]\/balance-profile\//,
      /\/api\/event-matches\/balance\//,
      /\/api\/admin\/backup\/balance-ai\.csv\//,
      /\/\(user\)\/ai-balance\//,
      /\/\(user\)\/players\/balance\//,
      /\/\(admin\)\/admin\/balance\//,
      /\/\(admin\)\/admin\/balance-ai\//,
    ],
  },
  {
    feature: "riot",
    patterns: [
      /\/api\/riot\//,
      /\/api\/admin\/riot\//,
      /\/\(user\)\/riot-api\//,
      /\/\(user\)\/me\/riot\//,
      /\/\(user\)\/app\/me\/riot\//,
      /\/\(user\)\/players\/\[playerId\]\/riot\//,
      /\/\(admin\)\/admin\/riot\//,
      /\/\(admin\)\/admin\/players\/\[playerId\]\/riot\//,
    ],
  },
  {
    feature: "randomTeam",
    patterns: [
      /\/\(user\)\/random-team\//,
    ],
  },
  {
    feature: "aiAssistant",
    patterns: [
      /\/api\/ai\/chat\//,
    ],
  },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (routeFiles.includes(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function toRoutePath(filePath) {
  return `/${path.relative("src/app", filePath).replace(/\\/g, "/")}`;
}

function expectedFeature(routePath) {
  return rules.find((rule) => rule.patterns.some((pattern) => pattern.test(routePath))) ?? null;
}

const missing = [];

function routeHasPageGuard(filePath, content) {
  if (pageGuardPattern.test(content)) return true;

  let dir = path.dirname(filePath);
  while (dir.startsWith(appRoot)) {
    const layoutPath = path.join(dir, "layout.tsx");
    if (layoutPath !== filePath && fs.existsSync(layoutPath)) {
      const layoutContent = fs.readFileSync(layoutPath, "utf8");
      if (pageGuardPattern.test(layoutContent)) return true;
    }
    const nextDir = path.dirname(dir);
    if (nextDir === dir) break;
    dir = nextDir;
  }

  return false;
}

for (const filePath of walk(appRoot)) {
  const routePath = toRoutePath(filePath);
  const rule = expectedFeature(routePath);
  if (!rule) continue;

  const content = fs.readFileSync(filePath, "utf8");
  const isApi = routePath.endsWith("/route.ts");
  const guarded = isApi ? apiGuardPattern.test(content) : routeHasPageGuard(filePath, content);

  if (!guarded) {
    missing.push({ routePath, feature: rule.feature, expected: isApi ? "requireSiteFeature" : "PremiumFeatureGate/isSiteFeatureEnabled" });
  }
}

if (missing.length > 0) {
  console.error("유료 기능 잠금 누락 후보가 있습니다.");
  for (const item of missing) {
    console.error(`- ${item.routePath}: feature=${item.feature}, expected=${item.expected}`);
  }
  process.exit(1);
}

console.log("유료 기능 잠금 점검 완료");
