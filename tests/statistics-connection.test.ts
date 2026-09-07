import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  drainStatisticsProjection,
  parsePlayerStatisticsQuery,
  parsePublicStatisticsQuery,
  StatisticsService,
  StatisticsServiceError,
  type ClaimedMatchChangedEvent,
  type StatisticsCommandEnvelope,
  type StatisticsCommandRepository,
  type StatisticsProjectionRepository,
  type StatisticsQueryRepository,
} from "../src/modules/statistics";

const seasonId = "10000000-0000-4000-8000-000000000000";

const queryRepository: StatisticsQueryRepository = {
  async listPublicSeasons() { return []; },
  async findPublicPlayerIdForAccount() { return null; },
  async getPublicSeasonRanking(_seasonId, minimumParticipation) {
    return { season: null, projection: null, minimumParticipation, rankings: [] };
  },
  async getPublicPlayerStatistics() { return null; },
  async getAdminStatus() { return { seasons: [], pendingEventCount: 0, failedEventCount: 0 }; },
};

test("statistics public queries accept only singular canonical allowlisted values", () => {
  assert.deepEqual(
    parsePublicStatisticsQuery(`https://v2.example/api/rankings?seasonId=${seasonId}&minParticipation=5`),
    { seasonId, minimumParticipation: 5 },
  );
  assert.deepEqual(
    parsePublicStatisticsQuery("https://v2.example/api/rankings"),
    { seasonId: null, minimumParticipation: 10 },
  );
  assert.equal(parsePublicStatisticsQuery("https://v2.example/api/rankings?seasonId=1"), null);
  assert.equal(parsePublicStatisticsQuery("https://v2.example/api/rankings?minParticipation=5&minParticipation=6"), null);
  assert.equal(parsePublicStatisticsQuery("https://v2.example/api/rankings?token=secret"), null);
  assert.deepEqual(
    parsePlayerStatisticsQuery(`https://v2.example/api/stats/player/id/summary?seasonId=${seasonId}`),
    { seasonId },
  );
  assert.equal(parsePlayerStatisticsQuery("https://v2.example/api/stats/player/id/summary?view=private"), null);
});

test("statistics recalculate command binds exact body, projection revision and idempotency identity", async () => {
  const captures: Readonly<{
    envelope: StatisticsCommandEnvelope;
    seasonId: string;
    expectedGeneration: number;
  }>[] = [];
  const commands: StatisticsCommandRepository = {
    async recalculateSeason(envelope, selectedSeasonId, expectedGeneration) {
      captures.push({ envelope, seasonId: selectedSeasonId, expectedGeneration });
      return {
        body: {
          seasonId: selectedSeasonId,
          generation: expectedGeneration + 1,
          sourceMatchCount: 0,
          sourceGameCount: 0,
          sourceParticipantCount: 0,
          sourceChecksum: "0".repeat(64),
        },
        status: 200,
        revision: expectedGeneration + 1,
        replayed: false,
      };
    },
  };
  const service = new StatisticsService(queryRepository, commands);
  await service.recalculateSeason({
    actorSession: {
      userAccountId: randomUUID(),
      sessionId: randomUUID(),
      role: "SUPER_ADMIN",
      authVersion: 1,
    },
    idempotencyMaterial: new TextEncoder().encode("statistics-test-idempotency"),
    requestId: randomUUID(),
  }, 3, { seasonId });
  const captured = captures[0];
  assert.ok(captured);
  assert.equal(captured.seasonId, seasonId);
  assert.equal(captured.expectedGeneration, 3);
  assert.equal(captured.envelope.scope, "admin:statistics:recalculate");
  assert.equal(captured.envelope.keyHash.length, 32);
  assert.equal(captured.envelope.requestHash.length, 32);

  assert.throws(
    () => service.recalculateSeason({
      actorSession: captured.envelope.actorSession,
      idempotencyMaterial: new Uint8Array(32),
      requestId: randomUUID(),
    }, 3, { seasonId, force: true }),
    (error: unknown) => error instanceof StatisticsServiceError && error.code === "INVALID_INPUT",
  );
});

function event(id: string): ClaimedMatchChangedEvent {
  return {
    eventId: id,
    eventType: "MATCH_CHANGED",
    action: "CREATED",
    matchId: randomUUID(),
    matchRevision: 0,
    oldSeasonId: null,
    newSeasonId: null,
    inputDigest: Buffer.alloc(32),
    lockedAt: new Date("2026-09-07T00:00:00.000Z"),
  };
}

test("bounded statistics drain stops on idle, failure and hard event limit", async () => {
  const queued = [event(randomUUID()), event(randomUUID())];
  const repository: StatisticsProjectionRepository = {
    async claimNextMatchChanged() { return queued.shift() ?? null; },
    async applyClaimedMatchChanged({ event: claimed }) {
      return { eventId: claimed.eventId, kind: "APPLIED", affectedSeasonIds: [], projections: [] };
    },
    async failClaimedMatchChanged() {},
  };
  assert.deepEqual(await drainStatisticsProjection(repository, { maximumEvents: 5 }), {
    processed: 2,
    applied: 2,
    replayed: 0,
    failed: 0,
    stopped: "IDLE",
  });

  const alwaysQueued: StatisticsProjectionRepository = {
    ...repository,
    async claimNextMatchChanged() { return event(randomUUID()); },
  };
  assert.equal((await drainStatisticsProjection(alwaysQueued, { maximumEvents: 2 })).stopped, "LIMIT");
  await assert.rejects(drainStatisticsProjection(alwaysQueued, { maximumEvents: 101 }), RangeError);
});
