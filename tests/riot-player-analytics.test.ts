import assert from "node:assert/strict";
import test from "node:test";
import { excludedRiotMatchStartedAt, normalizeRiotMatch, normalizeRiotTimeline, parseRiotAnalyticsCursor, parseStoredRiotMatch } from "../src/modules/riot/domain/riot-match-normalizer";
import { summarizeRiotTimeline } from "../src/modules/riot/domain/riot-player-analytics";
import { RiotApiGateway } from "../src/modules/riot/infrastructure/riot-api-gateway";
import { analyticsMatch, analyticsPuuid, analyticsTimeline } from "./fixtures/riot-analytics";

const now = new Date("2026-09-25T00:00:00.000Z");
const gateway = (request: typeof fetch, monotonicNow?: () => number) => new RiotApiGateway({ apiKey: "synthetic-riot-analytics-key", platformBaseUrl: "https://kr.api.riotgames.com", regionalBaseUrl: "https://asia.api.riotgames.com", fetch: request, monotonicNow });
const collectInput = { puuid: analyticsPuuid, cachedMatches: [], historyBefore: null, historyComplete: false, now } as const;

test("analytics allowlists player and timeline facts, preserves missing stats, and discards provider identities", () => {
  const match = normalizeRiotMatch(analyticsMatch("KR_100", now.getTime()), "KR_100", analyticsPuuid)!;
  assert.ok(match); assert.equal(match.selfParticipantId, 1); assert.equal(match.participants.length, 10);
  assert.equal(match.participants[0]!.cs, 170); assert.equal(match.participants[0]!.doubleKills, null);
  assert.deepEqual(match.participants[0]!.items, [1001, 1055, 0, 0, 0, 0, 3340]);
  const timeline = normalizeRiotTimeline(analyticsTimeline(), match)!;
  assert.ok(timeline); assert.equal(timeline.frames[0]!.participants.length, 10);
  assert.equal(timeline.events.length, 9); // Only this player's build/skills; all champion kills.
  const enriched = { ...match, timeline, timelineStatus: "AVAILABLE" as const };
  assert.deepEqual(parseStoredRiotMatch(enriched), enriched);
  assert.deepEqual(summarizeRiotTimeline(enriched), { goldDiffAt10: 0, csDiffAt10: 0, goldDiffAt15: 0, csDiffAt15: 0, xpDiffAt15: 0, earlyTakedowns: 3 });
  assert.equal(summarizeRiotTimeline({ ...enriched, mapId: 12 }).goldDiffAt10, null);
  assert.doesNotMatch(JSON.stringify(enriched), /puuid|summonerId|summonerName|privateIdentity|secret|synthetic-analytics-player/i);
  assert.equal(parseStoredRiotMatch({ ...enriched, puuid: analyticsPuuid }), null);
  assert.equal(parseStoredRiotMatch({ ...enriched, participants: [{ ...enriched.participants[0], accountId: "private" }, ...enriched.participants.slice(1)] }), null);
  assert.equal(normalizeRiotMatch(analyticsMatch(), "KR_999", analyticsPuuid), null);
  assert.equal(normalizeRiotMatch(analyticsMatch(), "KR_100", "wrong-player"), null);
  assert.equal(normalizeRiotTimeline(analyticsTimeline("KR_999"), match), null);
});

test("turret plates use the optional official challenge count and keep unavailable values separate from zero", () => {
  const raw = analyticsMatch();
  const own = raw.info.participants[0]!;
  for (const count of [0, 3, 15]) {
    own.challenges.turretPlatesTaken = count;
    const match = normalizeRiotMatch(raw, "KR_100", analyticsPuuid)!;
    assert.equal(match.participants[0]!.turretPlatesTaken, count);
    assert.deepEqual(parseStoredRiotMatch(match), match);
  }
  for (const invalid of [null, undefined, "3", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    Reflect.set(own.challenges, "turretPlatesTaken", invalid);
    assert.equal(normalizeRiotMatch(raw, "KR_100", analyticsPuuid)!.participants[0]!.turretPlatesTaken, null);
  }
  Reflect.deleteProperty(own, "challenges");
  Reflect.set(own, "turretPlatesTaken", 7);
  Reflect.set(own, "turretKills", 4);
  const match = normalizeRiotMatch(raw, "KR_100", analyticsPuuid)!;
  assert.equal(match.participants[0]!.turretPlatesTaken, null, "top-level fields and tower kills cannot substitute for the challenge count");
  const legacy = structuredClone(match);
  for (const participant of legacy.participants) Reflect.deleteProperty(participant, "turretPlatesTaken");
  const parsed = parseStoredRiotMatch(legacy)!;
  assert.ok(parsed); assert.ok(parsed.participants.every((participant) => participant.turretPlatesTaken === null));
  assert.ok(legacy.participants.every((participant) => !Object.hasOwn(participant, "turretPlatesTaken")), "reading old archives must not mutate stored input");
  const malformed = structuredClone(match);
  Reflect.set(malformed.participants[0]!, "turretPlatesTaken", "3");
  assert.equal(parseStoredRiotMatch(malformed), null);
});

test("known unsupported or aborted games do not trap the historical cursor, while malformed normal matches remain incomplete", async () => {
  const before = Math.floor(now.getTime() / 1_000) - 1;
  const unsupported = analyticsMatch("KR_10", now.getTime() - 10_000, 400);
  unsupported.info.participants = unsupported.info.participants.slice(0, 1);
  const result = await gateway(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/ids")) return Response.json(url.searchParams.has("queue") ? [] : ["KR_10"]);
    return Response.json(unsupported);
  }).fetchPlayerAnalytics({ ...collectInput, historyBefore: before });
  assert.equal(result.partial, false); assert.equal(result.historyComplete, true);
  assert.equal(result.historyBefore, Math.floor(now.getTime() / 1_000) - 11); assert.deepEqual(result.matches, []);
  const malformed = analyticsMatch("KR_10", now.getTime() - 10_000);
  malformed.info.participants[0]!.championId = -1;
  const rejected = await gateway(async (input) => String(input).includes("/ids?") ? Response.json(["KR_10"]) : Response.json(malformed)).fetchPlayerAnalytics({ ...collectInput, historyBefore: before });
  assert.equal(rejected.partial, true); assert.equal(rejected.historyBefore, before); assert.equal(rejected.historyComplete, false);
});

test("only verified public matchmaking is archived; custom, tutorial and unknown queues advance without disclosure", async () => {
  const startedAt = now.getTime() - 60_000;
  for (const queue of [400, 420, 430, 440, 450, 480, 490, 700, 720, 870, 880, 890, 900, 1020, 1300, 1400, 1700, 1710, 1900, 2300, 2400]) {
    assert.ok(normalizeRiotMatch(analyticsMatch("KR_100", startedAt, queue), "KR_100", analyticsPuuid));
  }
  const excluded = [
    analyticsMatch("KR_100", startedAt, 0), analyticsMatch("KR_100", startedAt, 2000),
    analyticsMatch("KR_100", startedAt, 2010), analyticsMatch("KR_100", startedAt, 2020),
    analyticsMatch("KR_100", startedAt, 9999),
    ...["CUSTOM_GAME", "TUTORIAL_GAME", "FUTURE_PRIVATE_GAME"].map((gameType) => {
      const raw = analyticsMatch("KR_100", startedAt); raw.info.gameType = gameType; return raw;
    }),
    ...["PRACTICETOOL", "TUTORIAL"].map((gameMode) => {
      const raw = analyticsMatch("KR_100", startedAt); raw.info.gameMode = gameMode; return raw;
    }),
  ];
  for (const raw of excluded) {
    assert.equal(normalizeRiotMatch(raw, "KR_100", analyticsPuuid), null);
    assert.equal(excludedRiotMatchStartedAt(raw, "KR_100", analyticsPuuid), startedAt);
    const result = await gateway(async (input) => String(input).includes("/ids?") ? Response.json(["KR_100"]) : Response.json(raw)).fetchPlayerAnalytics(collectInput);
    assert.equal(result.partial, false); assert.equal(result.historyComplete, true);
    assert.equal(result.historyBefore, Math.floor(startedAt / 1_000) - 1);
    assert.deepEqual(result.matches, []); assert.equal(result.recentSolo?.games, 0);
    assert.doesNotMatch(JSON.stringify(result), /Synthetic|puuid|private-not-for-projection/u);
  }
  const normalized = normalizeRiotMatch(analyticsMatch(), "KR_100", analyticsPuuid)!;
  for (const queueId of [0, 2000, 2010, 2020, 9999]) assert.equal(parseStoredRiotMatch({ ...normalized, queueId }), null);
  const malformed = analyticsMatch();
  Reflect.deleteProperty(malformed.info, "gameType");
  assert.equal(normalizeRiotMatch(malformed, "KR_100", analyticsPuuid), null);
  assert.equal(excludedRiotMatchStartedAt(malformed, "KR_100", analyticsPuuid), null, "missing provider fields must not be called known exclusions");
});

test("duplicate timeline frames merge deterministically, keeping legitimate same-millisecond item counts", () => {
  const match = normalizeRiotMatch(analyticsMatch(), "KR_100", analyticsPuuid)!;
  const raw = analyticsTimeline();
  raw.info.frames[0]!.events.push({ ...raw.info.frames[0]!.events[0]! });
  raw.info.frames.splice(1, 0, structuredClone(raw.info.frames[0]!));
  const timeline = normalizeRiotTimeline(raw, match)!;
  assert.ok(timeline); assert.equal(timeline.frames.length, 3); assert.equal(timeline.events.length, 10);
  assert.equal(timeline.events.filter((event) => event.type === "ITEM_PURCHASED" && event.timestamp === 0).length, 2);
  const enriched = { ...match, timeline, timelineStatus: "AVAILABLE" as const };
  assert.deepEqual(parseStoredRiotMatch(enriched), enriched);
  assert.equal(parseStoredRiotMatch({ ...enriched, timeline: { ...timeline, frames: [timeline.frames[0], ...timeline.frames] } }), null);
  raw.info.frames[1]!.participantFrames["1"]!.totalGold += 1;
  assert.equal(normalizeRiotTimeline(raw, match), null, "conflicting same-time observations must not fabricate a chart point");
  const badSkill = analyticsTimeline();
  badSkill.info.frames[0]!.events.find((event) => event.type === "SKILL_LEVEL_UP")!.skillSlot = 0;
  const normalized = normalizeRiotTimeline(badSkill, match)!;
  assert.equal(normalized.events.find((event) => event.type === "SKILL_LEVEL_UP")!.skillSlot, null);
});

test("analytics reuses a match across solo/recent pages, collects a timeline, then serves cache without detail refetch", async () => {
  const calls: string[] = [];
  const api = gateway(async (input) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    if (url.pathname.endsWith("/ids")) return Response.json(["KR_100"]);
    return Response.json(url.pathname.endsWith("/timeline") ? analyticsTimeline() : analyticsMatch("KR_100", now.getTime()));
  });
  const first = await api.fetchPlayerAnalytics(collectInput);
  assert.equal(first.partial, false); assert.equal(first.historyComplete, true);
  assert.equal(first.recentSolo?.games, 1); assert.equal(first.matches.length, 1);
  assert.equal(first.matches[0]!.timelineStatus, "AVAILABLE");
  assert.equal(calls.filter((path) => path.endsWith("/KR_100")).length, 1);
  calls.length = 0;
  const second = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: first.matches, historyBefore: first.historyBefore, historyComplete: true });
  assert.equal(second.matches.length, 0); assert.equal(second.recentSolo?.games, 1);
  assert.equal(calls.length, 2); assert.ok(calls.every((path) => path.endsWith("/ids")));
});

test("timeline failures preserve match facts and a 429 stops all further provider requests with Retry-After", async () => {
  let calls = 0;
  const result = await gateway(async (input) => {
    calls += 1;
    const url = new URL(String(input));
    if (url.pathname.endsWith("/ids")) return Response.json(["KR_100"]);
    if (url.pathname.endsWith("/timeline")) return new Response("", { status: 429, headers: { "Retry-After": "90" } });
    return Response.json(analyticsMatch("KR_100", now.getTime()));
  }).fetchPlayerAnalytics(collectInput);
  assert.equal(result.retryAfterSeconds, 90); assert.equal(result.matches.length, 1); assert.equal(result.matches[0]!.timelineStatus, "PENDING");
  assert.equal(result.recentSolo?.games, 1); assert.equal(result.partial, true); assert.equal(calls, 4);
  let stopped = 0;
  const limited = await gateway(async () => { stopped += 1; return new Response("", { status: 429, headers: { "Retry-After": "120" } }); }).fetchPlayerAnalytics(collectInput);
  assert.equal(stopped, 1); assert.equal(limited.retryAfterSeconds, 120); assert.deepEqual(limited.matches, []);
});

test("unsupported successful timelines do not starve older games while transport failures remain retryable", async () => {
  const matches = Array.from({ length: 5 }, (_, index) => normalizeRiotMatch(analyticsMatch(`KR_${index + 1}`, now.getTime() - index * 3_600_000), `KR_${index + 1}`, analyticsPuuid)!);
  const calls: string[] = [];
  const api = gateway(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/ids")) return Response.json(matches.map((match) => match.matchId));
    const id = url.pathname.split("/").at(-2)!; calls.push(id);
    return Response.json(id === "KR_5" ? analyticsTimeline(id) : { metadata: { matchId: id }, info: { unsupportedFutureFormat: true } });
  });
  const first = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: matches, historyComplete: true });
  assert.equal(first.partial, true); assert.equal(first.matches.length, 4);
  assert.ok(first.matches.every((match) => match.timelineStatus === "UNAVAILABLE" && match.participants.length === 10));
  const updated = matches.map((match) => first.matches.find((value) => value.matchId === match.matchId) ?? match);
  const second = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: updated, historyComplete: true });
  assert.deepEqual(calls, ["KR_1", "KR_2", "KR_3", "KR_4", "KR_5"]);
  assert.equal(second.matches[0]!.timelineStatus, "AVAILABLE");
  for (const response of [() => new Response("not json", { status: 200 }), () => new Response("", { status: 503 })]) {
    const failed = await gateway(async (input) => String(input).includes("/ids?") ? Response.json(["KR_1"]) : response()).fetchPlayerAnalytics({ ...collectInput, cachedMatches: [matches[0]!] });
    assert.equal(failed.partial, true); assert.deepEqual(failed.matches, []);
    assert.equal(matches[0]!.timelineStatus, "PENDING");
  }
});

test("the history cursor advances only after a complete bounded older batch, and never erases earlier progress on failure", async () => {
  const before = Math.floor(now.getTime() / 1_000) - 100;
  const queries: URL[] = [];
  const result = await gateway(async (input) => {
    const url = new URL(String(input)); queries.push(url);
    if (url.pathname.endsWith("/ids")) return Response.json(url.searchParams.has("endTime") ? ["KR_90"] : []);
    if (url.pathname.endsWith("/timeline")) return new Response("", { status: 404 });
    return Response.json(analyticsMatch("KR_90", now.getTime() - 200_000));
  }).fetchPlayerAnalytics({ ...collectInput, historyBefore: before });
  assert.equal(result.historyComplete, true); assert.equal(result.historyBefore, before - 101);
  assert.equal(result.matches[0]!.timelineStatus, "UNAVAILABLE");
  assert.equal(queries.filter((url) => url.searchParams.has("endTime"))[0]!.searchParams.get("count"), "10");
  assert.ok(queries.filter((url) => url.pathname.endsWith("/ids") && !url.searchParams.has("queue")).every((url) => url.searchParams.has("startTime")));
  const failed = await gateway(async (input) => String(input).includes("/ids?") ? Response.json(["KR_90"]) : new Response("", { status: 503 })).fetchPlayerAnalytics({ ...collectInput, historyBefore: before });
  assert.equal(failed.historyBefore, before); assert.equal(failed.historyComplete, false);
});

test("invalid match IDs, malformed cursors and a 25-second budget are bounded before more upstream work", async () => {
  let calls = 0, clock = 0;
  const expired = await gateway(async () => { calls += 1; clock = 25_000; return Response.json(["KR_100"]); }, () => clock).fetchPlayerAnalytics(collectInput);
  assert.equal(calls, 1); assert.equal(expired.partial, true); assert.equal(expired.historyBefore, null);
  const cursor = `${now.toISOString()}|KR_100`;
  assert.deepEqual(parseRiotAnalyticsCursor(cursor), { startedAt: now, matchId: "KR_100" });
  for (const value of ["", "bad", `${now.toISOString()}|../secret`, "2026-02-30T00:00:00.000Z|KR_1", `${cursor}|other`]) assert.equal(parseRiotAnalyticsCursor(value), null);
});

test("a new non-overlapping latest page reopens completed or ongoing history and subsequently collects the hidden gap", async () => {
  const old = normalizeRiotMatch(analyticsMatch("KR_1", now.getTime() - 40 * 3_600_000, 440), "KR_1", analyticsPuuid)!;
  const recentIds = Array.from({ length: 20 }, (_, index) => `KR_${101 + index}`);
  const starts = new Map(recentIds.map((id, index) => [id, now.getTime() - (index + 1) * 3_600_000]));
  const gapIds = ["KR_80", "KR_81"];
  starts.set("KR_80", now.getTime() - 21 * 3_600_000); starts.set("KR_81", now.getTime() - 22 * 3_600_000);
  const historyQueries: number[] = [];
  const api = gateway(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/ids")) {
      if (url.searchParams.has("queue")) return Response.json([]);
      if (url.searchParams.has("endTime")) { historyQueries.push(Number(url.searchParams.get("endTime"))); return Response.json(gapIds); }
      return Response.json(recentIds);
    }
    if (url.pathname.endsWith("/timeline")) return new Response("", { status: 404 });
    const id = url.pathname.split("/").at(-1)!;
    return Response.json(analyticsMatch(id, starts.get(id), 440));
  });
  const oldCursor = Math.floor(now.getTime() / 1_000) - 60 * 86_400;
  for (const complete of [true, false]) {
    const first = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: [old], historyBefore: oldCursor, historyComplete: complete });
    const gapCursor = Math.floor(now.getTime() / 1_000) - 20 * 3_600 - 1;
    assert.equal(first.historyComplete, false); assert.equal(first.historyBefore, gapCursor);
    assert.ok(first.historyBefore! > oldCursor, "the deeper old backfill cursor must not skip the new gap");
    assert.equal(historyQueries.length, 0, "the obsolete history range is not queried in the restart run");
    const next = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: [old, ...first.matches], historyBefore: first.historyBefore, historyComplete: first.historyComplete });
    assert.deepEqual(historyQueries, [gapCursor]);
    assert.ok(gapIds.every((id) => next.matches.some((match) => match.matchId === id)));
    assert.equal(next.historyComplete, true);
    historyQueries.length = 0;
  }
  const expiredCache = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: [], historyBefore: oldCursor, historyComplete: true });
  assert.equal(expiredCache.historyComplete, false, "retention pruning cannot make a newly populated history appear complete");
  assert.equal(expiredCache.historyBefore, Math.floor(now.getTime() / 1_000) - 20 * 3_600 - 1);
});

test("a partial gap restart preserves a safe cursor across backoff and overlap keeps ordinary history progress", async () => {
  const old = normalizeRiotMatch(analyticsMatch("KR_1", now.getTime() - 40 * 3_600_000, 440), "KR_1", analyticsPuuid)!;
  const recentIds = Array.from({ length: 20 }, (_, index) => `KR_${101 + index}`);
  const oldCursor = Math.floor(now.getTime() / 1_000) - 60 * 86_400;
  let fail = true;
  const cursors: number[] = [];
  const api = gateway(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/ids")) {
      if (url.searchParams.has("queue")) return Response.json([]);
      if (url.searchParams.has("endTime")) { cursors.push(Number(url.searchParams.get("endTime"))); return Response.json(recentIds.slice(0, 10)); }
      return Response.json(recentIds);
    }
    if (url.pathname.endsWith("/timeline")) return new Response("", { status: 404 });
    const id = url.pathname.split("/").at(-1)!;
    if (fail && id === "KR_102") return new Response("", { status: 429, headers: { "Retry-After": "90" } });
    return Response.json(analyticsMatch(id, now.getTime() - (Number(id.split("_")[1]) - 100) * 3_600_000, 440));
  });
  const partial = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: [old], historyBefore: oldCursor, historyComplete: true });
  assert.equal(partial.retryAfterSeconds, 90); assert.equal(partial.historyComplete, false);
  assert.equal(partial.historyBefore, Math.floor(now.getTime() / 1_000));
  assert.ok(partial.matches.some((match) => match.matchId === "KR_101"));
  fail = false;
  const resumed = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: [old, ...partial.matches], historyBefore: partial.historyBefore, historyComplete: false });
  assert.deepEqual(cursors, [partial.historyBefore]); assert.equal(resumed.historyComplete, false);
  const overlaps = await api.fetchPlayerAnalytics({ ...collectInput, cachedMatches: [old, ...resumed.matches, ...partial.matches], historyBefore: oldCursor, historyComplete: true });
  assert.equal(overlaps.historyComplete, true); assert.equal(overlaps.historyBefore, oldCursor);
});

test("an already observed all-private latest page cannot repeatedly reset older public-game backfill", async () => {
  const old = { ...normalizeRiotMatch(analyticsMatch("KR_1", now.getTime() - 40 * 3_600_000, 440), "KR_1", analyticsPuuid)!, timelineStatus: "UNAVAILABLE" as const };
  const recentIds = Array.from({ length: 20 }, (_, index) => `KR_${101 + index}`);
  const historyIds = Array.from({ length: 11 }, (_, index) => `KR_${80 + index}`);
  const starts = new Map([...recentIds.map((id, index) => [id, now.getTime() - (index + 1) * 3_600_000] as const),
    ...historyIds.map((id, index) => [id, now.getTime() - (index + 21) * 3_600_000] as const)]);
  let failRecentList = false, failRecentDetail = false;
  const queriedCursors: number[] = [];
  const api = gateway(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/ids")) {
      if (url.searchParams.has("queue")) return Response.json([]);
      if (url.searchParams.has("endTime")) {
        const cursor = Number(url.searchParams.get("endTime")); queriedCursors.push(cursor);
        return Response.json(historyIds.filter((id) => starts.get(id)! <= cursor * 1_000).slice(0, 10));
      }
      return failRecentList ? new Response("", { status: 503 }) : Response.json(recentIds);
    }
    if (url.pathname.endsWith("/timeline")) return new Response("", { status: 404 });
    const id = url.pathname.split("/").at(-1)!;
    if (failRecentDetail && id === "KR_102") return new Response("", { status: 429, headers: { "Retry-After": "90" } });
    const raw = analyticsMatch(id, starts.get(id), recentIds.includes(id) ? 0 : 440);
    if (recentIds.includes(id)) raw.info.gameType = "CUSTOM_GAME";
    return Response.json(raw);
  });
  const oldInput = { ...collectInput, cachedMatches: [old], historyBefore: Math.floor(now.getTime() / 1_000) - 60 * 86_400,
    historyComplete: true, lastCollectedAt: new Date(now.getTime() - 50 * 3_600_000) };
  failRecentList = true;
  const failedList = await api.fetchPlayerAnalytics(oldInput);
  assert.equal(failedList.recentPageComplete, false); assert.equal(failedList.historyBefore, oldInput.historyBefore);
  failRecentList = false; failRecentDetail = true;
  const failedDetail = await api.fetchPlayerAnalytics(oldInput);
  assert.equal(failedDetail.recentPageComplete, false); assert.equal(failedDetail.historyComplete, false);
  assert.equal(failedDetail.historyBefore, Math.floor(now.getTime() / 1_000));
  failRecentDetail = false;
  const first = await api.fetchPlayerAnalytics({ ...oldInput, historyBefore: failedDetail.historyBefore, historyComplete: false });
  assert.equal(first.recentPageComplete, true); assert.equal(first.historyComplete, false); assert.deepEqual(first.matches, []);
  const second = await api.fetchPlayerAnalytics({ ...oldInput, historyBefore: first.historyBefore, historyComplete: false, lastCollectedAt: now });
  assert.equal(second.matches.length, 10); assert.equal(second.historyComplete, false);
  assert.ok(second.historyBefore! < first.historyBefore!);
  const third = await api.fetchPlayerAnalytics({ ...oldInput, cachedMatches: [old, ...second.matches], historyBefore: second.historyBefore, historyComplete: false, lastCollectedAt: now });
  assert.equal(third.matches.filter((match) => historyIds.includes(match.matchId) && !second.matches.some((cached) => cached.matchId === match.matchId)).length, 1);
  assert.equal(third.historyComplete, true); assert.deepEqual(queriedCursors, [first.historyBefore, second.historyBefore]);
  starts.set("KR_101", now.getTime() + 1_000);
  const newExcluded = await api.fetchPlayerAnalytics({ ...oldInput, now: new Date(now.getTime() + 60_000), lastCollectedAt: now });
  assert.equal(newExcluded.historyComplete, false, "a new unobserved private page must still reopen the gap");
});
