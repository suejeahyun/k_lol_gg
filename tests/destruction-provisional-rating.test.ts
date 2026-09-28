import assert from "node:assert/strict";
import test from "node:test";
import { advanceAutomaticRating, type AutomaticRatingSources } from "../src/modules/competitions/destruction/automatic-rating";
import { handleAutomaticRatingCron } from "../src/modules/competitions/destruction/automatic-rating-cron";
import { AramSyncError } from "../src/modules/competitions/destruction/aram-rating";
import { championBreadthScore, DEFAULT_RATING_POLICY, evaluateProvisionalRating, participantAuctionRating, RATING_KEYS, soloRatingScore, validateRatingPolicy, type RatingComponent, type RatingSnapshot } from "../src/modules/competitions/destruction/provisional-rating";
import { aramMatchContribution, RiotAramRecords } from "../src/modules/competitions/destruction/riot-aram-records";
import { RiotRatingFacts } from "../src/modules/competitions/destruction/riot-rating-facts";
import { parseDestructionAdminAction } from "../src/modules/competitions/destruction/destruction-service";
import type { DestructionParticipant } from "../src/modules/competitions/destruction/teams";

const now = "2026-09-28T00:00:00.000Z";
const ready = (score: number): RatingComponent => ({ score, status: "READY", source: "RIOT", samples: 100, observedAt: now, evidence: "synthetic measured facts" });
const snapshot = (scores: number[]): RatingSnapshot => ({ policy: structuredClone(DEFAULT_RATING_POLICY), components: Object.fromEntries(RATING_KEYS.map((key, i) => [key, ready(scores[i]!)])), collectedAt: now });
const player = (): DestructionParticipant => ({ id: "11111111-1111-4111-8111-111111111111", playerId: "22222222-2222-4222-8222-222222222222", position: null, isCaptain: false, teamId: null, auctionStatus: "PENDING", purchasePoints: null, drawOrder: null });

test("agreed 20/40/20/15/5 formula uses fixed absolute cutoffs and no participant percentiles", () => {
  const result = evaluateProvisionalRating(snapshot([80, 60, 70, 90, 40]));
  assert.equal(result.score, 69.5); assert.equal(result.tier, "A"); assert.equal(result.minimumBid, 250); assert.equal(result.captainPoints, 1750);
  for (const [score, tier] of [[0, "D"], [34.99, "D"], [35, "C"], [50, "B"], [65, "A"], [79.99, "A"], [80, "S"], [100, "S"]] as const) assert.equal(evaluateProvisionalRating(snapshot(RATING_KEYS.map(() => score))).tier, tier);
  const samePlayer = { ...player(), provisionalRating: snapshot([80, 60, 70, 90, 40]) };
  assert.equal(participantAuctionRating(samePlayer)?.score, 69.5);
});

test("unknown data is neither a zero nor a redistributed weight; zero-weight components are excluded", () => {
  const full = snapshot([80, 60, 70, 90, 40]);
  const partial = { ...full, components: { ...full.components, solo: { ...ready(0), score: null, status: "NO_DATA" as const } } };
  const result = evaluateProvisionalRating(partial);
  assert.equal(result.score, null); assert.equal(result.tier, null); assert.equal(result.minimum, 45.5); assert.equal(result.maximum, 85.5);
  assert.deepEqual(result.missing, ["solo"]);
  const policy = { ...DEFAULT_RATING_POLICY, weights: { aram: 100, solo: 0, inhouse: 0, champions: 0, challenges: 0 } };
  assert.equal(evaluateProvisionalRating({ ...full, policy, components: { aram: ready(80) } }).score, 80);
  for (const weights of [{ ...policy.weights, aram: 99 }, { ...policy.weights, aram: NaN }, { ...policy.weights, extra: 0 }, { ...policy.weights, solo: -1, aram: 101 }]) assert.throws(() => validateRatingPolicy({ ...policy, weights }));
  assert.throws(() => evaluateProvisionalRating(snapshot([NaN, 0, 0, 0, 0])));
});

test("solo rank bands and champion breadth avoid entrant-dependent ranks and cumulative-points dominance", () => {
  assert.equal(soloRatingScore("GOLD", "IV", 0), 35);
  assert.ok(soloRatingScore("GOLD", "I", 99)! < soloRatingScore("PLATINUM", "IV", 0)!);
  assert.equal(soloRatingScore("MASTER", "I", 0), 80);
  assert.equal(soloRatingScore("CHALLENGER", "I", 2000), 100);
  assert.equal(soloRatingScore("UNRANKED", null, 0), null);
  const nowMs = Date.parse(now);
  assert.equal(championBreadthScore(Array.from({ length: 40 }, () => ({ championPoints: 10000, lastPlayTime: nowMs })), nowMs).score, 100);
  assert.ok(championBreadthScore([{ championPoints: 10000000, lastPlayTime: nowMs }], nowMs).score < 5);
  assert.equal(championBreadthScore([{ championPoints: 100000, lastPlayTime: 0 }], nowMs).score, 0);
});

test("support and damage contributions use fixed role targets; absent statistics remain unknown", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ puuid: String(i), teamId: i < 5 ? 100 : 200, kills: 5, assists: 15, totalDamageDealtToChampions: 10000, totalHealsOnTeammates: 0, totalDamageShieldedOnTeammates: 0, timeCCingOthers: 10 }));
  rows[0]!.totalDamageDealtToChampions = 0; rows[0]!.totalDamageShieldedOnTeammates = 10000;
  assert.equal(aramMatchContribution({ info: { participants: rows } }, "0"), 100);
  assert.equal(aramMatchContribution({ info: { participants: [{ puuid: "0", win: true }] } }, "0"), null);
});

test("automatic step persists partial collection, rate limits, missing data, and produces a score only when complete", async () => {
  let participant = player(); let aramCalls = 0;
  const sources: AutomaticRatingSources = { component: async () => ready(70), aram: async () => {
    aramCalls++;
    const collection = { linkId: "test-link", linkRevision: 1, matchIds: ["KR_1", "KR_2"], processed: aramCalls, wins: aramCalls, losses: 0, excluded: 0, startedAt: now };
    return { collection, ...(aramCalls === 2 ? { record: { mode: "ARAM" as const, source: "RIOT" as const, wins: 2, losses: 0, performanceScore: 60, fetchedAt: now, evidence: "synthetic facts" } } : {}) };
  } };
  for (let i = 0; i < 5; i++) participant = await advanceAutomaticRating(participant, DEFAULT_RATING_POLICY, now, sources);
  assert.equal(participant.ratingCollection?.complete, false); assert.equal(participant.aramCollection?.processed, 1); assert.equal(participant.minimumBid, undefined);
  participant = await advanceAutomaticRating(participant, DEFAULT_RATING_POLICY, now, sources);
  assert.equal(participant.ratingCollection?.complete, true); assert.equal(participant.aramRecord?.mode, "ARAM"); assert.ok(participant.minimumBid);
  const limited = await advanceAutomaticRating(player(), DEFAULT_RATING_POLICY, now, { ...sources, component: async () => { throw new AramSyncError("RATE_LIMITED", 180); } });
  assert.equal(limited.ratingCollection?.retryAt, "2026-09-28T00:03:00.000Z"); assert.equal(limited.provisionalRating?.components.solo, undefined);
  const missing = await advanceAutomaticRating(player(), DEFAULT_RATING_POLICY, now, { ...sources, component: async () => { throw new AramSyncError("NOT_CONNECTED"); } });
  assert.equal(missing.provisionalRating?.components.solo?.score, null); assert.equal(missing.minimumBid, undefined);
});

test("Riot facts request normal APIs, validate source rows and never infer unranked or missing challenges as zero", async () => {
  const paths: string[] = [];
  const request: typeof fetch = async (input) => { paths.push(new URL(String(input)).pathname); return Response.json([]); };
  const facts = new RiotRatingFacts(new RiotAramRecords("synthetic", "https://asia.api.riotgames.com", request), "https://kr.api.riotgames.com");
  assert.equal((await facts.solo("test", now)).score, null);
  assert.equal((await facts.champions("test", now)).score, 0);
  assert.equal((await facts.challenges("test", now)).status, "NO_DATA");
  assert.ok(paths.every((path) => !path.includes("2400")));
});

test("challenge matching tolerates locale typography but rejects seasonal, inactive, duplicate and missing facts", async () => {
  const names = ["All Random All Champions", "All Random All Flawless", "NA–RAM"];
  const valid = names.map((name, i) => ({ id: i + 1, state: "ENABLED", tracking: "LIFETIME", localizedNames: { en_us: { name: ` ${name} ` } }, thresholds: { MASTER: 100 } }));
  async function run(configs: unknown[], entries = [1, 2, 3].map((challengeId) => ({ challengeId, value: 60 }))) {
    const request: typeof fetch = async (input) => Response.json(String(input).endsWith("config") ? configs : { challenges: entries });
    return new RiotRatingFacts(new RiotAramRecords("test", "https://asia.api.riotgames.com", request), "https://kr.api.riotgames.com").challenges("test", now);
  }
  assert.equal((await run(valid)).score, 60);
  for (const patch of [{ tracking: "SEASON" }, { state: "ARCHIVED" }, { thresholds: {} }, { id: 2 }, { localizedNames: { en_us: { name: names[0] + ": 2026" } } }]) {
    const result = await run([{ ...valid[0], ...patch }, ...valid.slice(1)]);
    assert.equal(result.score, null); assert.match(result.evidence, /정의 확인 필요/);
  }
  assert.equal((await run([...valid, valid[0]])).score, null);
  assert.equal((await run(valid, [{ challengeId: 1, value: 0 }])).score, null);
  assert.equal((await run(valid, [1, 2, 3].map((challengeId) => ({ challengeId, value: 0 })))).score, 0);
});

test("cron authentication rejects unauthorized requests before touching data and exposes only counters", async () => {
  let calls = 0;
  const secret = "synthetic-cron-secret-at-least-32-characters";
  const dependencies = { secret, step: async () => { calls++; return { kind: "UPDATED" as const, retryAfterSeconds: 8 }; }, wait: async () => {} };
  const url = "https://example.test/api/cron/destruction-ratings";
  assert.equal((await handleAutomaticRatingCron(new Request(url), dependencies)).status, 401); assert.equal(calls, 0);
  assert.equal((await handleAutomaticRatingCron(new Request(url + "?x=1", { headers: { authorization: `Bearer ${secret}` } }), dependencies)).status, 401);
  const response = await handleAutomaticRatingCron(new Request(url, { headers: { authorization: `Bearer ${secret}` } }), dependencies);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { kind: "UPDATED", completedSteps: 4 });
});

test("admin payload cannot inject weights, scores, source or arbitrary extra fields", () => {
  assert.equal(parseDestructionAdminAction({ type: "SET_RATING_POLICY", payload: DEFAULT_RATING_POLICY }).type, "SET_RATING_POLICY");
  assert.throws(() => parseDestructionAdminAction({ type: "SET_RATING_POLICY", payload: { ...DEFAULT_RATING_POLICY, score: 100 } }));
  assert.throws(() => parseDestructionAdminAction({ type: "VERIFY_RATING_COMPONENT", payload: { participantId: player().id, key: "solo", score: 100, evidence: "synthetic verification", source: "RIOT" } }));
});
