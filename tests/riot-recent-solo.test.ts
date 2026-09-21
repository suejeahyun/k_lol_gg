import assert from "node:assert/strict";
import test from "node:test";
import { RiotApiGateway } from "../src/modules/riot/infrastructure/riot-api-gateway";
import { parseRecentSoloSummary, recentSoloSample, summarizeRecentSolo } from "../src/modules/riot/domain/recent-solo-summary";

const puuid = "synthetic-connected-puuid";
function match(id: string, overrides: Record<string, unknown> = {}) {
  return { metadata: { matchId: id }, info: { queueId: 420, mapId: 11, participants: Array.from({ length: 10 }, (_, index) => ({
    puuid: index === 0 ? puuid : `synthetic-other-${index}`, win: true, kills: 6, deaths: 2, assists: 8, totalDamageDealtToChampions: 20_000, visionScore: 25,
    teamPosition: "JUNGLE", ...(index === 0 ? overrides : {}),
  })) } };
}
function gateway(request: typeof fetch, monotonicNow?: () => number) {
  return new RiotApiGateway({ apiKey: "synthetic-api-key-000000", platformBaseUrl: "https://kr.api.riotgames.com", regionalBaseUrl: "https://asia.api.riotgames.com", fetch: request, monotonicNow });
}

test("recent solo uses queue 420, 20 matches, at most two concurrent requests and a summary-only result", async () => {
  const ids = Array.from({ length: 20 }, (_, index) => `KR_${index + 1}`);
  let active = 0; let peak = 0; let calls = 0;
  const api = gateway(async (input, init) => {
    const url = new URL(String(input)); calls += 1;
    assert.equal(url.origin, "https://asia.api.riotgames.com");
    assert.equal(new Headers(init?.headers).get("X-Riot-Token"), "synthetic-api-key-000000");
    assert.equal(init?.redirect, "error");
    if (url.pathname.endsWith("/ids")) {
      assert.equal(url.search, "?queue=420&start=0&count=20"); return Response.json(ids);
    }
    active += 1; peak = Math.max(peak, active);
    await new Promise<void>((resolve) => setTimeout(resolve, 1)); active -= 1;
    return Response.json(match(url.pathname.split("/").at(-1)!));
  });
  const result = await api.fetchRecentSolo({ puuid });
  assert.equal(result.kind, "SUCCESS");
  if (result.kind !== "SUCCESS") assert.fail();
  assert.deepEqual(result.summary, { games: 20, wins: 20, kda: 7, mainPosition: "JGL", subPosition: null, positionConfidence: 1, averageDamage: 20_000, averageVisionScore: 25 });
  assert.equal(calls, 21); assert.equal(peak, 2);
  assert.doesNotMatch(JSON.stringify(result), /puuid|KR_1|participants/);
});

test("empty history and explicit remakes are known zero samples while malformed or wrong-scope details are unavailable", async () => {
  assert.deepEqual(await gateway(async () => Response.json([])).fetchRecentSolo({ puuid }), { kind: "SUCCESS", summary: summarizeRecentSolo([]) });
  assert.equal(recentSoloSample(match("KR_1", { gameEndedInEarlySurrender: true }), "KR_1", puuid), "REMAKE");
  assert.equal(recentSoloSample(match("KR_1"), "KR_2", puuid), null);
  assert.equal(recentSoloSample(match("KR_1"), "KR_1", "unlinked-puuid"), null);
  assert.equal(recentSoloSample({ ...match("KR_1"), info: { ...match("KR_1").info, queueId: 440 } }, "KR_1", puuid), null);
  assert.equal(recentSoloSample(match("KR_1", { kills: -1 }), "KR_1", puuid), null);
  const result = await gateway(async (input) => Response.json(String(input).includes("/ids?") ? ["KR_1"] : match("KR_1", { kills: "6" }))).fetchRecentSolo({ puuid });
  assert.deepEqual(result, { kind: "UNAVAILABLE" });
});

test("rate limiting stops subsequent chunks and propagates bounded Retry-After", async () => {
  let calls = 0;
  const result = await gateway(async (input) => {
    calls += 1;
    if (String(input).includes("/ids?")) return Response.json(["KR_1", "KR_2", "KR_3"]);
    return new Response("", { status: 429, headers: { "Retry-After": "120" } });
  }).fetchRecentSolo({ puuid });
  assert.deepEqual(result, { kind: "UNAVAILABLE", retryAfterSeconds: 120 });
  assert.equal(calls, 3);
});

test("total time, response size, unsafe IDs and duplicate IDs are bounded before further provider reads", async () => {
  let clock = 0; let calls = 0;
  const result = await gateway(async () => { calls += 1; clock = 25_000; return Response.json(["KR_1", "KR_2"]); }, () => clock).fetchRecentSolo({ puuid });
  assert.deepEqual(result, { kind: "UNAVAILABLE" }); assert.equal(calls, 1);
  for (const ids of [["../private"], ["KR_1", "KR_1"], Array.from({ length: 21 }, (_, index) => `KR_${index}`)]) {
    let reads = 0;
    assert.deepEqual(await gateway(async () => { reads += 1; return Response.json(ids); }).fetchRecentSolo({ puuid }), { kind: "UNAVAILABLE" });
    assert.equal(reads, 1);
  }
  assert.deepEqual(await gateway(async (input) => String(input).includes("/ids?") ? Response.json(["KR_1"]) : new Response("{}", { headers: { "content-length": "262145" } })).fetchRecentSolo({ puuid }), { kind: "UNAVAILABLE" });
});

test("stored recent-solo summaries reject extra identity data, invalid counts and invalid numeric values", () => {
  const summary = summarizeRecentSolo([]);
  assert.deepEqual(parseRecentSoloSummary(summary), summary);
  for (const invalid of [{ ...summary, puuid }, { ...summary, games: 21 }, { ...summary, games: 1, wins: 2 }, { ...summary, averageDamage: Infinity }, { ...summary, mainPosition: "JUNGLE" }]) {
    assert.equal(parseRecentSoloSummary(invalid), null);
  }
});
