import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { buildPublicRankingView } from "../src/modules/statistics/domain/public-ranking-view";

// Read-only smoke: never signs in, mutates state, or saves player response bodies.
const origin = new URL(process.argv[2]);
assert.ok(origin.origin === "https://k-lol-gg.vercel.app"
  || (origin.protocol === "https:" && /^k-lol-[a-z0-9]+-tjdmswo11-3715s-projects\.vercel\.app$/.test(origin.hostname))
  || origin.hostname === "127.0.0.1");
const output = process.argv[3];
assert.ok(output);
const checks: Array<{ path: string; status: number; durationMs: number; bytes: number }> = [];
async function get(path: string, status = 200) {
  const start = performance.now();
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  const rawBody = await response.text();
  // React SSR separates adjacent text nodes with comments; visible text is continuous.
  const body = rawBody.replace(/<!--[\s\S]*?-->/g, "");
  checks.push({ path, status: response.status, durationMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(rawBody) });
  assert.equal(response.status, status, path);
  assert.doesNotMatch(body, /Application error:|Internal Server Error/);
  return { body, headers: response.headers };
}
const home = (await get("/")).body;
const sections = ["home-title", "home-ranking-title", "tasks-title", "home-overview-title", "home-personal-title", "home-status-title"];
let last = -1;
for (const section of sections) {
  const index = home.indexOf(`id="${section}"`);
  assert.ok(index > last, `Home section order: ${section}`); last = index;
}
for (const path of ["/applications", "/recruits", "/matches", "/competitions/events?q=&status=&format=", "/competitions/destruction?q=&status=&format=", "/rankings", "/tools/team-balance", "/tools/random-team", "/highlights", "/images", "/help", "/start", "/login"]) await get(path);
const code = "MR20000000000000000";
const submit = (await get(`/matches/submit?code=${code}`)).body;
assert.ok(submit.includes(encodeURIComponent(`/matches/submit?code=${code}`)), "Anonymous submission preserves continuation code");
const mmr = JSON.parse((await get("/api/rankings/mmr?pageSize=10")).body);
const first = (await get("/rankings/mmr?pageSize=10")).body;
assert.ok(first.includes("종합 MMR 순위") || mmr.summary.status === "EMPTY" || mmr.players.total === 0);
if (mmr.players.total > 10) {
  assert.match(first, /aria-label="MMR 랭킹 페이지"/);
  const second = (await get("/rankings/mmr?page=2&pageSize=10&position=TOP")).body;
  assert.ok(second.includes("탑 MMR") && second.includes("종합 신뢰도"));
  const missingPage = (await get("/rankings/mmr?page=10000&pageSize=10")).body;
  assert.match(missingPage, /현재 페이지에 플레이어가 없어요/);
  assert.match(missingPage, /첫 페이지로/);
}
assert.match((await get("/rankings/mmr?q=NoPlayerFixture20261005")).body, /검색어에 맞는 플레이어가 없어요|표시할 MMR이 아직 없어요/);
assert.match((await get("/rankings/mmr?page=bad")).body, /검색 조건을 확인해 주세요/);
await get("/api/rankings/mmr?page=bad", 400);
const ranking = JSON.parse((await get("/api/rankings")).body);
const topResponse = await get("/api/stats/top");
assert.match(topResponse.headers.get("cache-control") ?? "", /no-store/);
const top = JSON.parse(topResponse.body).top;
for (const [apiKey, view] of [["winRate", "win-rate"], ["participation", "participation"], ["mvp", "mvp"]] as const) {
  const expected = buildPublicRankingView(ranking.rankings, view).filter(row => view !== "mvp" || row.mvpCount > 0).slice(0, 3).map(row => row.playerId);
  assert.deepEqual(top[apiKey].map((row: { playerId: string }) => row.playerId), expected, `${view} API matches common order`);
}
for (const path of ["/api/admin/users", "/api/admin/matches", "/api/admin/balance-ai/team-overrides", "/api/admin/balance-ai/team-scores", "/api/me/match-submissions", "/api/cron/mmr-projection", "/api/cron/riot-sync", "/api/cron/support-retention"]) await get(path, 401);
assert.equal(JSON.parse((await get("/api/health")).body).status, "ready");
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), origin: origin.origin, passed: true, mmrTotal: mmr.players.total, checks, notes: "HTTP timings are single-run observations, not Web Vitals or a performance benchmark. All requests were anonymous GET." }, null, 2) + "\n");
console.log(`PASS: ${checks.length} read-only HTTP checks, home order, submission return, MMR pages and common ranking order`);
