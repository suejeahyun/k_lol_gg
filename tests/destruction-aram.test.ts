import assert from "node:assert/strict";
import test from "node:test";
import { aramAuctionRating, AramSyncError, type AramRecord } from "../src/modules/competitions/destruction/aram-rating";
import { RiotAramRecords } from "../src/modules/competitions/destruction/riot-aram-records";
import { parseDestructionAdminAction } from "../src/modules/competitions/destruction/destruction-service";
import { validateDestructionConfiguration } from "../src/modules/competitions/destruction/configuration";
import { destructionErrorResponse } from "../src/modules/competitions/destruction/destruction-http";

const now = "2026-09-25T10:00:00.000Z";
const record = (wins: number, losses: number): AramRecord => ({ mode: "ARAM", source: "RIOT", wins, losses, fetchedAt: now, evidence: "test" });
test("one-off auction tiers apply sample shrinkage and bind captain points to the same valuation", () => {
  assert.deepEqual([62, 53, 50, 40, 20].map((wins) => aramAuctionRating(record(wins, 100-wins)).tier), ["S", "A", "B", "C", "D"]);
  const example = aramAuctionRating(record(55, 45));
  assert.equal(example.minimumBid, 250); assert.equal(example.captainPoints, 1750);
  assert.equal(aramAuctionRating(record(1, 0)).tier, "B");
  assert.equal(aramAuctionRating(record(5, 0)).tier, "B");
  assert.equal(aramAuctionRating(record(0, 5)).tier, "B");
  assert.equal(aramAuctionRating(record(10, 10)).provisional, true);
  for (const [wins, losses] of [[0, 0], [-1, 5], [51, 50], [1.1, 2]]) assert.throws(() => aramAuctionRating(record(wins!, losses!)));
});

function gateway(options: { wrongQueue?: boolean; invalidWin?: boolean; rateLimit?: boolean; empty?: boolean } = {}) {
  const calls: URL[] = [];
  const request: typeof fetch = async (input) => {
    const url = new URL(String(input)); calls.push(url);
    if (options.rateLimit) return new Response(null, { status: 429, headers: { "retry-after": "17" } });
    if (url.pathname.endsWith("/ids")) return Response.json(options.empty ? [] : Array.from({ length: 8 }, (_, i) => `KR_${i}`));
    const id = url.pathname.split("/").at(-1)!;
    const number = Number(id.split("_")[1]);
    return Response.json({ metadata: { matchId: id }, info: { queueId: options.wrongQueue ? 2400 : 450, gameDuration: number === 0 ? 200 : 900, participants: Array.from({ length: 10 }, (_, i) => ({ puuid: i === 0 ? "test-puuid" : `other-${i}`, win: options.invalidWin ? "false" : number % 2 === 0 })) } });
  };
  return { api: new RiotAramRecords("test-key", "https://asia.api.riotgames.com", request), calls };
}
const input = { puuid: "test-puuid", linkId: "link", linkRevision: 1, now };
test("Riot collection freezes the latest 100-ID window, resumes batches, excludes remakes and never mixes queues", async () => {
  const { api, calls } = gateway();
  const first = await api.next(input);
  assert.equal(first.collection.processed, 5); assert.equal(first.record, undefined);
  assert.equal(calls[0]!.searchParams.get("queue"), "450");
  assert.equal(calls[0]!.searchParams.get("count"), "100");
  const second = await api.next({ ...input, previous: first.collection });
  assert.equal(calls.length, 9); assert.equal(second.collection.processed, 8);
  assert.equal(second.record?.wins, 3); assert.equal(second.record?.losses, 4);
  assert.equal(second.record?.mode, "ARAM"); assert.equal(second.collection.excluded, 1);
  await assert.rejects(api.next({ ...input, linkRevision: 2, previous: first.collection }), (e) => e instanceof AramSyncError && e.code === "ACCOUNT_CHANGED");
});
test("upstream failures and missing data never turn into zero-win ratings", async () => {
  for (const [options, code] of [[{ wrongQueue: true }, "INVALID_RESPONSE"], [{ invalidWin: true }, "INVALID_RESPONSE"], [{ empty: true }, "NO_MATCHES"], [{ rateLimit: true }, "RATE_LIMITED"]] as const) {
    await assert.rejects(gateway(options).api.next(input), (e) => e instanceof AramSyncError && e.code === code);
  }
  assert.equal(destructionErrorResponse(new AramSyncError("RATE_LIMITED", 17)).status, 429);
  assert.equal(destructionErrorResponse(new AramSyncError("MAYHEM_UNSUPPORTED")).status, 409);
});

test("absolute lookup expands 90/180/365 days using valid games, fixed end and deduplicated details", async () => {
  const { api, calls } = gateway();
  let result = await api.next({ ...input, absolute: true });
  for (let step = 0; !result.record && step < 10; step++) result = await api.next({ ...input, now: "2026-09-26T10:00:00.000Z", absolute: true, previous: result.collection });
  assert.equal(result.record?.wins, 3); assert.equal(result.record?.losses, 4);
  assert.equal(result.collection.windowDays, 365);
  const lists = calls.filter((url) => url.pathname.endsWith("/ids"));
  assert.deepEqual(lists.map((url) => (Number(url.searchParams.get("endTime")) - Number(url.searchParams.get("startTime"))) / 86400), [90, 180, 365]);
  assert.equal(new Set(lists.map((url) => url.searchParams.get("endTime"))).size, 1);
  assert.equal(calls.length - lists.length, 8, "overlapping windows never recount a match");
  assert.match(result.record!.evidence, /365일.*20판 미만/);
});

test("absolute empty results try all three windows before declaring missing data", async () => {
  const { api, calls } = gateway({ empty: true });
  const first = await api.next({ ...input, absolute: true });
  const second = await api.next({ ...input, absolute: true, previous: first.collection });
  await assert.rejects(api.next({ ...input, absolute: true, previous: second.collection }), (e) => e instanceof AramSyncError && e.code === "NO_MATCHES");
  assert.equal(calls.length, 3);
});

test("absolute collection stops expanding at twenty valid games and caps all windows at 100 details", async () => {
  for (const size of [20, 100]) {
    const calls: URL[] = [];
    const request: typeof fetch = async (raw) => {
      const url = new URL(String(raw)); calls.push(url);
      if (url.pathname.endsWith("/ids")) return Response.json(Array.from({ length: size }, (_, i) => `KR_${i}`));
      return Response.json({ metadata: { matchId: url.pathname.split("/").at(-1) }, info: { queueId: 450, gameDuration: size === 100 && !url.pathname.endsWith("_0") ? 100 : 900, participants: Array.from({ length: 10 }, (_, i) => ({ puuid: i ? String(i) : input.puuid, win: true })) } });
    };
    const api = new RiotAramRecords("test", "https://asia.api.riotgames.com", request);
    let result = await api.next({ ...input, absolute: true });
    for (let step = 0; !result.record && step < 25; step++) result = await api.next({ ...input, absolute: true, previous: result.collection });
    assert.ok(result.record); assert.equal(result.collection.windowDays, 90);
    assert.equal(calls.length, size + 1);
  }
});
test("HTTP callers cannot supply fabricated Riot records, grades, or arbitrary modes", () => {
  const participantId = "11111111-1111-4111-8111-111111111111";
  assert.throws(() => parseDestructionAdminAction({ type: "SYNC_ARAM_RECORD", payload: { participantId, wins: 100 } }));
  assert.throws(() => parseDestructionAdminAction({ type: "SYNC_ARAM_RECORD", payload: { participantId, minimumBid: 1 } }));
  const config = { preliminaryFormat: "FULL_ROUND_ROBIN_BO1", teamCount: 4, laneLimits: { TOP: 4, JGL: 4, MID: 4, ADC: 4, SUP: 4 } };
  assert.equal(validateDestructionConfiguration({ ...config, gameMode: "ARAM_MAYHEM" }).gameMode, "ARAM_MAYHEM");
  assert.throws(() => validateDestructionConfiguration({ ...config, gameMode: "BAD" as "ARAM" }));
});

test("verified input requires mode, bounded counts and evidence without caller-supplied pricing/source", () => {
  const payload = { participantId: "11111111-1111-4111-8111-111111111111", mode: "ARAM_MAYHEM", wins: 55, losses: 45, evidence: "클라이언트 최근 100판 확인 · 2026-09-25" };
  assert.equal(parseDestructionAdminAction({ type: "VERIFY_ARAM_RECORD", payload }).type, "VERIFY_ARAM_RECORD");
  for (const patch of [{ wins: -1 }, { losses: 46 }, { wins: 0, losses: 0 }, { wins: 0.5 }, { evidence: "짧음" }, { mode: "CLASSIC" }, { source: "RIOT" }, { minimumBid: 1 }, { fetchedAt: now }]) {
    assert.throws(() => parseDestructionAdminAction({ type: "VERIFY_ARAM_RECORD", payload: { ...payload, ...patch } }));
  }
});
