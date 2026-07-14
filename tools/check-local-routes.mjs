import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env.local", override: false, quiet: true });
dotenv.config({ path: ".env", override: false, quiet: true });

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12000);

const baseChecks = [
  { name: "home", path: "/", expect: [200] },
  { name: "account", path: "/account", expect: [200] },
  { name: "account-tier", path: "/account/tier", expect: [200] },
  { name: "login", path: "/login", expect: [200] },
  { name: "signup", path: "/signup", expect: [200] },
  { name: "players", path: "/players", expect: [200] },
  { name: "rankings", path: "/rankings", expect: [200] },
  { name: "matches", path: "/matches", expect: [200] },
  { name: "progress", path: "/progress", expect: [200] },
  { name: "progress-destruction", path: "/progress/destruction", expect: [200] },
  { name: "progress-event", path: "/progress/event", expect: [200] },
  { name: "participation", path: "/participation", expect: [200] },
  { name: "participation-season", path: "/participation/season", expect: [200] },
  { name: "recruit", path: "/recruit", expect: [200, 402] },
  { name: "team-balance", path: "/players/balance", expect: [200, 302, 307, 308] },
  { name: "team-balance-recommendations", path: "/players/balance/recommendations", expect: [200, 302, 307, 308] },
  { name: "ai-balance", path: "/ai-balance", expect: [200, 402] },
  { name: "ai-balance-players", path: "/ai-balance/players", expect: [200, 402] },
  { name: "random-team", path: "/random-team", expect: [200, 402] },
  { name: "riot-info", path: "/riot-api", expect: [200, 402] },
  { name: "kakao-info", path: "/kakao", expect: [200, 402] },
  { name: "recruit-helper", path: "/recruit-helper", expect: [200, 402] },
  { name: "highlights", path: "/highlights", expect: [200] },
  { name: "images", path: "/images", expect: [200] },
  { name: "me-player", path: "/me/player", expect: [200, 302, 307, 308] },
  { name: "me-riot", path: "/me/riot", expect: [200, 302, 307, 308, 402] },
  { name: "admin-login", path: "/admin/login", expect: [200] },
  { name: "admin-dashboard", path: "/admin", expect: [200] },
  { name: "admin-players", path: "/admin/players", expect: [200] },
  { name: "admin-users", path: "/admin/users", expect: [200] },
  { name: "admin-matches", path: "/admin/matches", expect: [200] },
  { name: "admin-recruits", path: "/admin/recruits", expect: [200] },
  { name: "admin-progress", path: "/admin/progress", expect: [200] },
  { name: "admin-progress-destruction", path: "/admin/progress/destruction", expect: [200] },
  { name: "admin-progress-event", path: "/admin/progress/event", expect: [200] },
  { name: "admin-kakao", path: "/admin/kakao", expect: [200] },
  { name: "admin-kakao-recruits", path: "/admin/kakao/recruits", expect: [200] },
  { name: "admin-kakao-scrims", path: "/admin/kakao/scrims", expect: [200] },
  { name: "admin-kakao-season-apply", path: "/admin/kakao/season-apply", expect: [200] },
  { name: "admin-balance-ai", path: "/admin/balance-ai", expect: [200] },
  { name: "admin-balance-ai-players", path: "/admin/balance-ai/players", expect: [200] },
  { name: "admin-balance-ai-recalculate", path: "/admin/balance-ai/recalculate", expect: [200] },
  { name: "admin-balance-ai-reviews", path: "/admin/balance-ai/reviews", expect: [200] },
  { name: "admin-riot", path: "/admin/riot", expect: [200] },
  { name: "admin-discipline", path: "/admin/discipline", expect: [200] },
  { name: "admin-operation-forms", path: "/admin/operation-forms", expect: [200] },
  { name: "admin-operation-warnings", path: "/admin/operation-forms/warnings", expect: [200] },
  { name: "admin-site-settings", path: "/admin/site-settings", expect: [200] },
  { name: "admin-security", path: "/admin/security", expect: [200] },
  { name: "admin-logs", path: "/admin/logs", expect: [200] },
  { name: "admin-seasons", path: "/admin/seasons", expect: [200] },
  { name: "app-home", path: "/app", expect: [200] },
  { name: "app-account", path: "/app/account", expect: [200] },
  { name: "app-me", path: "/app/me", expect: [200] },
  { name: "app-players", path: "/app/players", expect: [200] },
  { name: "app-matches", path: "/app/matches", expect: [200] },
  { name: "app-recruits", path: "/app/recruits", expect: [200] },
  { name: "app-rankings", path: "/app/rankings", expect: [200] },
  { name: "app-admin", path: "/app/admin", expect: [200] },
  { name: "site-settings-api-public", path: "/api/site-settings", expect: [200], json: true },
  { name: "rankings-api", path: "/api/rankings", expect: [200], json: true },
  { name: "stats-top-api", path: "/api/stats/top", expect: [200], json: true },
  { name: "admin-site-settings-unauthorized", path: "/api/admin/site-settings", expect: [401, 403], json: true },
];

async function discoverDynamicChecks() {
  let prisma = null;

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set");
    }

    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import("@prisma/client"),
      import("@prisma/adapter-pg"),
    ]);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });

    const [player, match, destruction, eventMatch, destructionParticipant] = await Promise.all([
      prisma.player.findFirst({ orderBy: { id: "asc" }, select: { id: true } }),
      prisma.matchSeries.findFirst({ orderBy: { matchDate: "desc" }, select: { id: true } }),
      prisma.destructionTournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
      prisma.eventMatch.findFirst({ orderBy: { eventDate: "desc" }, select: { id: true } }),
      prisma.destructionParticipant.findFirst({
        orderBy: { id: "asc" },
        select: { tournamentId: true, playerId: true },
      }),
    ]);

    const dynamicChecks = [];

    if (player) {
      dynamicChecks.push(
        { name: "player-detail", path: `/players/${player.id}`, expect: [200] },
        { name: "player-riot-detail", path: `/players/${player.id}/riot`, expect: [200, 402] },
        { name: "app-player-detail", path: `/app/players/${player.id}`, expect: [200] },
        { name: "admin-player-detail", path: `/admin/players/${player.id}`, expect: [200] },
        { name: "admin-player-riot", path: `/admin/players/${player.id}/riot`, expect: [200] },
      );
    }

    if (match) {
      dynamicChecks.push(
        { name: "match-detail", path: `/matches/${match.id}`, expect: [200] },
        { name: "app-match-detail", path: `/app/matches/${match.id}`, expect: [200] },
        { name: "admin-match-edit", path: `/admin/matches/${match.id}/edit`, expect: [200] },
        { name: "admin-match-ai-review", path: `/admin/matches/${match.id}/ai-review`, expect: [200] },
      );
    }

    if (destruction) {
      dynamicChecks.push(
        { name: "progress-destruction-detail", path: `/progress/destruction/${destruction.id}`, expect: [200] },
        { name: "participation-destruction-detail", path: `/participation/destruction/${destruction.id}`, expect: [200] },
        { name: "participation-destruction-participants", path: `/participation/destruction/${destruction.id}/participants`, expect: [200] },
        { name: "destruction-auction-live", path: `/destruction-auction-live/${destruction.id}`, expect: [200] },
        { name: "admin-progress-destruction-detail", path: `/admin/progress/destruction/${destruction.id}`, expect: [200] },
      );
    }

    if (destructionParticipant) {
      dynamicChecks.push({
        name: "participation-destruction-participant-detail",
        path: `/participation/destruction/${destructionParticipant.tournamentId}/participants/${destructionParticipant.playerId}`,
        expect: [200],
      });
    }

    if (eventMatch) {
      dynamicChecks.push(
        { name: "progress-event-detail", path: `/progress/event/${eventMatch.id}`, expect: [200] },
        { name: "participation-event-detail", path: `/participation/event/${eventMatch.id}`, expect: [200] },
        { name: "admin-progress-event-detail", path: `/admin/progress/event/${eventMatch.id}`, expect: [200] },
      );
    }

    return dynamicChecks;
  } catch (error) {
    console.warn(
      `동적 라우트 발견을 건너뜁니다: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

function outputDir() {
  const dir = path.resolve("artifacts", "smoke");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isBadHtml(text) {
  const lower = text.toLowerCase();
  return lower.includes("application error") ||
    lower.includes("internal server error") ||
    lower.includes("next_static_gen_bailout");
}

async function request(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      method: check.method || "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: check.headers || {},
      body: check.body,
    });
    const text = await response.text();
    let json = null;
    if (check.json) {
      try {
        json = JSON.parse(text);
      } catch {
        // Reported below as a failure for JSON checks.
      }
    }

    const statusOk = check.expect.includes(response.status);
    const bodyOk = check.json ? json !== null : !isBadHtml(text);

    return {
      name: check.name,
      path: check.path,
      ok: statusOk && bodyOk,
      status: response.status,
      expected: check.expect,
      elapsedMs: Date.now() - startedAt,
      contentType: response.headers.get("content-type"),
      bodyPreview: text.slice(0, 500),
      jsonOk: check.json ? json !== null : undefined,
    };
  } catch (error) {
    return {
      name: check.name,
      path: check.path,
      ok: false,
      status: null,
      expected: check.expect,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const dynamicChecks = await discoverDynamicChecks();
const checks = [...baseChecks, ...dynamicChecks];

const results = [];
for (const check of checks) {
  results.push(await request(check));
}

const failed = results.filter((item) => !item.ok);
const report = {
  baseUrl,
  checkedAt: new Date().toISOString(),
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};

const file = path.join(outputDir(), `local-routes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`스모크 테스트 로그: ${file}`);

if (failed.length > 0) process.exit(1);
