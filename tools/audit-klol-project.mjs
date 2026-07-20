import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const appDir = join(root, "src", "app");
const srcDir = join(root, "src");

const ROUTE_FILES = new Set(["page.tsx", "route.ts", "layout.tsx"]);
const WATCHLIST_KEYWORDS = ["discord", "board", "clip", "gallery", "notice"];
const PREMIUM_KEYWORDS = ["kakao", "balance-ai", "ai-balance", "random-team", "riot", "recruit"];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function routeFromFile(file) {
  const rel = toPosix(relative(appDir, file));
  const parts = rel.split("/");
  const fileName = parts.pop();
  const routeParts = parts
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
    .map((part) => part.replace(/^\[(.+)\]$/, ":$1"));
  const route = `/${routeParts.join("/")}`.replace(/\/+/g, "/");
  return {
    route: route === "/" ? "/" : route.replace(/\/$/, ""),
    kind: fileName === "route.ts" ? "api" : fileName?.replace(".tsx", "").replace(".ts", ""),
    file: toPosix(relative(root, file)),
  };
}

function countMatches(files, patterns) {
  const hits = [];
  for (const file of files) {
    if (!/\.(ts|tsx|js|mjs|css|md)$/.test(file)) continue;
    const rel = toPosix(relative(root, file));
    let source = "";
    try {
      source = readFileSync(file, "utf8").toLowerCase();
    } catch {
      continue;
    }
    for (const keyword of patterns) {
      if (rel.toLowerCase().includes(keyword) || source.includes(keyword)) {
        hits.push({ keyword, file: rel });
        break;
      }
    }
  }
  return hits;
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

const routeFiles = walk(appDir).filter((file) => ROUTE_FILES.has(file.split(sep).at(-1)));
const routes = routeFiles.map(routeFromFile).sort((a, b) => `${a.kind}:${a.route}`.localeCompare(`${b.kind}:${b.route}`));
const sourceFiles = walk(srcDir);
const watchlistHits = countMatches(sourceFiles, WATCHLIST_KEYWORDS);
const premiumFeatureHits = countMatches(sourceFiles, PREMIUM_KEYWORDS);

const summary = {
  generatedAt: new Date().toISOString(),
  root: toPosix(root),
  counts: {
    pages: routes.filter((item) => item.kind === "page").length,
    apis: routes.filter((item) => item.kind === "api").length,
    layouts: routes.filter((item) => item.kind === "layout").length,
    sourceFiles: sourceFiles.length,
    watchlistKeywordHits: watchlistHits.length,
    premiumFeatureKeywordHits: premiumFeatureHits.length,
  },
  routeGroups: groupBy(routes, (item) => {
    if (item.route.startsWith("/admin")) return "admin";
    if (item.route.startsWith("/app")) return "mobile";
    if (item.route.startsWith("/api")) return "api";
    return "user";
  }),
  routes,
  watchlistHits: watchlistHits.slice(0, 100),
  premiumFeatureHits: premiumFeatureHits.slice(0, 100),
};

if (process.argv.includes("--json-only")) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("K-LOL.GG project audit");
  console.log(`- pages: ${summary.counts.pages}`);
  console.log(`- apis: ${summary.counts.apis}`);
  console.log(`- layouts: ${summary.counts.layouts}`);
  console.log(`- source files: ${summary.counts.sourceFiles}`);
  console.log(`- watchlist keyword hits: ${summary.counts.watchlistKeywordHits}`);
  console.log(`- premium feature keyword hits: ${summary.counts.premiumFeatureKeywordHits}`);
}
