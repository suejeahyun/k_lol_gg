import assert from "node:assert/strict";
import test from "node:test";
import { RiotApiGateway } from "../src/modules/riot/infrastructure/riot-api-gateway";
import { RIOT_PARTIAL_CODES, claimRiotSyncJob, createRiotSyncJob, finishRiotSyncJob } from "../src/modules/riot/domain/riot-integration";
import { resolvePublicRiotProfileState } from "../src/modules/riot/application/riot-query";
import { normalizeRiotMatch } from "../src/modules/riot/domain/riot-match-normalizer";
import { analyticsMatch, analyticsPuuid } from "./fixtures/riot-analytics";
import { publicRiotSyncDiagnosticLabel } from "../src/modules/competitions/core/public-display-labels";

const now = new Date("2026-10-07T00:00:00Z");
const input = { puuid: analyticsPuuid, cachedMatches: [], historyBefore: null, historyComplete: false, now };
function gateway(request: typeof fetch, monotonicNow = () => 0) {
  return new RiotApiGateway({ apiKey: "synthetic-diagnostic-api-key", platformBaseUrl: "https://kr.api.riotgames.com", regionalBaseUrl: "https://asia.api.riotgames.com", fetch: request, monotonicNow });
}

test("partial diagnostics preserve bounded provider codes without response bodies", async () => {
  for (const [status, code] of [[404, "PARTIAL_PROVIDER_NOT_FOUND"], [403, "PARTIAL_PROVIDER_UNAUTHORIZED"], [503, "PARTIAL_PROVIDER_5XX"], [400, "PARTIAL_PROVIDER_RESPONSE"]] as const) {
    const result = await gateway(async () => new Response("synthetic private upstream body", { status })).fetchPlayerAnalytics(input);
    assert.equal(result.partial, true);
    assert.equal(result.partialCode, code);
    assert.doesNotMatch(JSON.stringify(result), /synthetic private|puuid|api-key/);
  }
  const network = await gateway(async () => { throw new Error("synthetic private request URL"); }).fetchPlayerAnalytics(input);
  assert.equal(network.partialCode, "PARTIAL_PROVIDER_NETWORK");
});

test("partial diagnostics distinguish the total budget from a failed provider payload", async () => {
  let clock = 0, calls = 0;
  const expired = await gateway(async () => { calls++; clock = 25_000; return Response.json(["KR_100"]); }, () => clock).fetchPlayerAnalytics(input);
  assert.equal(calls, 1);
  assert.equal(expired.partialCode, "PARTIAL_BUDGET");
  assert.equal(expired.historyBefore, null);
  const invalidList = await gateway(async () => Response.json(["not-a-match-id"])).fetchPlayerAnalytics(input);
  assert.equal(invalidList.partialCode, "PARTIAL_LIST_INVALID");
  const invalidJson = await gateway(async () => new Response("{" )).fetchPlayerAnalytics(input);
  assert.equal(invalidJson.partialCode, "PARTIAL_PROVIDER_RESPONSE");
});

test("partial diagnostics retain a request timeout without exceeding the existing total budget", async () => {
  let calls = 0, clock = 0;
  const api = new RiotApiGateway({ apiKey: "synthetic-diagnostic-api-key", platformBaseUrl: "https://kr.api.riotgames.com", regionalBaseUrl: "https://asia.api.riotgames.com", timeoutMilliseconds: 1_000, monotonicNow: () => clock,
    fetch: async (_url, options) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => options!.signal!.addEventListener("abort", () => { clock = 25_000; reject(new Error("synthetic-private-timeout-url")); }, { once: true }));
    } });
  const result = await api.fetchPlayerAnalytics(input);
  assert.equal(calls, 1);
  assert.equal(result.partialCode, "PARTIAL_PROVIDER_TIMEOUT");
  assert.equal(result.partial, true);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private/);
});

test("partial rank diagnostics preserve available fields and distinguish unranked", async () => {
  const rank = await gateway(async () => Response.json([{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "I", wins: 10, leaguePoints: 50 }])).fetchRank({ puuid: analyticsPuuid });
  assert.deepEqual(rank, { outcome: { kind: "SUCCESS", partial: true, partialCode: "PARTIAL_RANK_FIELDS" }, snapshot: { tier: "GOLD", rank: "I", wins: 10, leaguePoints: 50, losses: null, partial: true } });
  const unranked = await gateway(async () => Response.json([])).fetchRank({ puuid: analyticsPuuid });
  assert.deepEqual(unranked.outcome, { kind: "SUCCESS", partial: false });
});

test("a timed-out response body remains a timeout for analytics and rank, not invalid JSON", async () => {
  for (const target of ["analytics", "rank"] as const) {
    let calls = 0, clock = 0;
    const api = new RiotApiGateway({ apiKey: "synthetic-diagnostic-api-key", platformBaseUrl: "https://kr.api.riotgames.com", regionalBaseUrl: "https://asia.api.riotgames.com", timeoutMilliseconds: 1_000, monotonicNow: () => clock,
      fetch: async (_url, options) => {
        calls++;
        return new Response(new ReadableStream<Uint8Array>({ start(controller) {
          controller.enqueue(new TextEncoder().encode("["));
          options!.signal!.addEventListener("abort", () => { clock = 25_000; controller.error(new Error("synthetic-private-body")); }, { once: true });
        } }));
      } });
    if (target === "analytics") assert.equal((await api.fetchPlayerAnalytics(input)).partialCode, "PARTIAL_PROVIDER_TIMEOUT");
    else assert.deepEqual(await api.fetchRank({ puuid: analyticsPuuid }), { outcome: { kind: "TRANSIENT_FAILURE", code: "TIMEOUT" } });
    assert.equal(calls, 1);
  }
});

test("partial diagnostics distinguish invalid match and timeline while keeping usable facts", async () => {
  const invalidMatch = await gateway(async (url) => String(url).includes("/ids?") ? Response.json(["KR_100"]) : Response.json({})).fetchPlayerAnalytics(input);
  assert.equal(invalidMatch.partialCode, "PARTIAL_MATCH_INVALID");
  assert.equal(invalidMatch.historyBefore, null);
  const invalidTimeline = await gateway(async (url) => String(url).includes("/ids?") ? Response.json(["KR_100"]) : Response.json(String(url).endsWith("/timeline") ? {} : analyticsMatch("KR_100", now.getTime()))).fetchPlayerAnalytics(input);
  assert.equal(invalidTimeline.partialCode, "PARTIAL_TIMELINE_INVALID");
  assert.equal(invalidTimeline.matches.length, 1);
  assert.equal(invalidTimeline.matches[0]!.timelineStatus, "UNAVAILABLE");
  assert.equal(invalidTimeline.recentSolo?.games, 1);
  const unavailableTimeline = await gateway(async (url) => String(url).includes("/ids?") ? Response.json(["KR_100"]) : String(url).endsWith("/timeline") ? new Response(null, { status: 404 }) : Response.json(analyticsMatch("KR_100", now.getTime()))).fetchPlayerAnalytics(input);
  assert.equal(unavailableTimeline.partial, false);
  assert.equal(unavailableTimeline.partialCode, undefined);
});

test("partial diagnostics identify incomplete cached solo samples without detail refetch", async () => {
  const match = normalizeRiotMatch(analyticsMatch("KR_100", now.getTime()), "KR_100", analyticsPuuid)!;
  const cached = { ...match, timelineStatus: "UNAVAILABLE" as const, participants: match.participants.map(row => row.participantId === match.selfParticipantId ? { ...row, visionScore: null } : row) };
  let calls = 0;
  const result = await gateway(async () => { calls++; return Response.json(["KR_100"]); }).fetchPlayerAnalytics({ ...input, cachedMatches: [cached] });
  assert.equal(calls, 2);
  assert.equal(result.partialCode, "PARTIAL_SOLO_INCOMPLETE");
  assert.equal(result.recentSolo, undefined);
  assert.deepEqual(result.matches, []);
});

test("partial diagnostics never replace rate-limit backoff or a genuine rank failure", async () => {
  const analytics = await gateway(async () => new Response(null, { status: 429, headers: { "Retry-After": "120" } })).fetchPlayerAnalytics(input);
  assert.equal(analytics.retryAfterSeconds, 120);
  const rank = await gateway(async () => new Response(null, { status: 503 })).fetchRank({ puuid: analyticsPuuid });
  assert.deepEqual(rank, { outcome: { kind: "TRANSIENT_FAILURE", code: "UPSTREAM_5XX" } });
});

test("domain only retains allowlisted partial codes and public snapshots keep their existing shape", () => {
  const running = claimRiotSyncJob({ job: createRiotSyncJob({ id: "job", linkId: "link", requestedBy: "JOB", now }), expectedRevision: 0, leaseId: "lease", now });
  const finish = (partial: boolean, partialCode?: string) => finishRiotSyncJob({ job: running, expectedRevision: 1, expectedLeaseId: "lease", now, outcome: { kind: "SUCCESS", partial, partialCode } as Parameters<typeof finishRiotSyncJob>[0]["outcome"] });
  const partial = finish(true, "PARTIAL_PROVIDER_NETWORK");
  for (const code of RIOT_PARTIAL_CODES) {
    assert.ok(code.length <= 48);
    assert.match(code, /^PARTIAL_[A-Z0-9_]+$/u);
    assert.equal(finish(true, code).failureCode, code);
    assert.match(publicRiotSyncDiagnosticLabel(code, "PARTIAL"), /[가-힣]/u);
    assert.notEqual(publicRiotSyncDiagnosticLabel(code, "PARTIAL"), "원인 확인 필요");
  }
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.failureCode, "PARTIAL_PROVIDER_NETWORK");
  assert.equal(partial.completedAt, now);
  assert.equal(partial.availableAt, running.availableAt);
  assert.equal(finish(true, "synthetic-secret-body").failureCode, "PARTIAL_UNSPECIFIED");
  assert.equal(finish(true).failureCode, "PARTIAL_UNSPECIFIED");
  assert.equal(finish(false, "PARTIAL_PROVIDER_NETWORK").failureCode, null);
  const summary = { playerId: "player", riotId: "Synthetic#KR1", soloTier: "GOLD", soloRank: "I", leaguePoints: 10, wins: 1, losses: 0, lastSyncedAt: now.toISOString() };
  assert.deepEqual(resolvePublicRiotProfileState({ playerFound: true, linked: true, summary, latestSync: partial, now }), { kind: "READY", summary });
  for (const unknown of ["synthetic-secret-body", "toString", "__proto__"]) assert.equal(publicRiotSyncDiagnosticLabel(unknown), "원인 확인 필요");
  assert.equal(publicRiotSyncDiagnosticLabel(null, "PARTIAL"), "일부 전적 미반영");
  assert.equal(publicRiotSyncDiagnosticLabel(null, "SUCCEEDED"), "없음");
});
