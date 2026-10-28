import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { Pool } from "pg";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import type { CommunityNetworkCommandMetadata } from "../../src/modules/community-network/application/ports";
import { CommunityNetworkError, type CommunityNetworkInput } from "../../src/modules/community-network/domain/community-network";
import { PostgresCommunityNetworkRepository } from "../../src/modules/community-network/infrastructure/postgres-community-network-repository";
import { createDatabaseHandle, type V2Database } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { auditEvents, authSessions, communityNetworkCommandReceipts, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function metadata(snapshot: CommunityNetworkInput, expectedRevision: number, requestKey: string = randomUUID()): CommunityNetworkCommandMetadata {
  return {
    requestId: randomUUID(), requestKey, expectedRevision,
    requestHashHex: createHash("sha256").update(JSON.stringify({ snapshot, expectedRevision })).digest("hex"),
  };
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof CommunityNetworkError && error.code === code;
}

async function createActor(database: V2Database, role: "SUPER_ADMIN" | "ADMIN"): Promise<TransactionSessionActor> {
  const userAccountId = randomUUID();
  const sessionId = randomUUID();
  const now = new Date();
  await database.insert(userAccounts).values({
    id: userAccountId, loginId: `network-${userAccountId}`, loginIdNormalized: `network-${userAccountId}`,
    role, status: "APPROVED",
  });
  await database.insert(authSessions).values({
    id: sessionId, tokenHash: randomBytes(32), userAccountId, authVersion: 0, role, purpose: "ADMIN",
    issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000), totpVerifiedAt: now,
  });
  return { userAccountId, sessionId, role, authVersion: 0 };
}

test("community registry persists dynamic metadata with isolated public reads and atomic authorized updates", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "The isolated PostgreSQL harness is required.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const admin = new Pool({ connectionString, max: 1 });
  const name = `klol_v2_test_network_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^klol_v2_test_network_[a-f0-9]{16}$/u);
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(connectionString); url.pathname = `/${name}`;
    assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
    const { database, pool } = createDatabaseHandle(url.toString(), { max: 4 });
    try {
      await applyMigrations(database);
      const repository = new PostgresCommunityNetworkRepository(database);
      const superActor = await createActor(database, "SUPER_ADMIN");
      const secondSuperActor = await createActor(database, "SUPER_ADMIN");
      const adminActor = await createActor(database, "ADMIN");
      const communities: CommunityNetworkInput["communities"] = [
        { id: randomUUID(), slug: "alpha", name: "공개 커뮤니티", origin: "https://alpha.example", description: "공개 설명\n두 번째 줄", state: "LISTED" },
        { id: randomUUID(), slug: "beta", name: "비공개 초안", origin: "https://beta.example", description: "초안 설명", state: "DRAFT" },
        { id: randomUUID(), slug: "gamma", name: "보관 커뮤니티", origin: "https://gamma.example", description: "보관 설명", state: "ARCHIVED" },
      ];
      const initial: CommunityNetworkInput = {
        communities,
        rooms: Array.from({ length: 12 }, (_, index) => ({
          id: randomUUID(), communityId: communities[index % 2]!.id, displayName: `내부 방 ${index + 1}`,
          purpose: index % 2 === 0 ? "CHAT" : "RECRUIT", dataGroupKey: `private-group-${index}`, active: true,
        })),
      };
      const initialMetadata = metadata(initial, 0);
      const initialCommand = { actor: superActor, metadata: initialMetadata, snapshot: initial };
      const effectCounts = async () => ({
        receipts: (await database.select().from(communityNetworkCommandReceipts)).length,
        audits: (await database.select().from(auditEvents).where(eq(auditEvents.action, "COMMUNITY_NETWORK_REGISTRY_UPDATED"))).length,
      });

      await t.test("empty state and twelve-room persistence do not pretend that routing is applied", async () => {
        assert.deepEqual(await repository.getSnapshot(), {
          communities: [], rooms: [], revision: 0, connectionStatus: "UNVERIFIED", routingStatus: "NOT_APPLIED",
        });
        assert.deepEqual(await repository.getPublicDirectory(), []);
        const result = await repository.updateSnapshot(initialCommand);
        assert.equal(result.revision, 1);
        assert.equal(result.replayed, false);
        const stored = await repository.getSnapshot();
        assert.equal(stored.rooms.length, 12);
        assert.deepEqual(new Set(stored.rooms.map((room) => room.id)), new Set(initial.rooms.map((room) => room.id)));
        assert.deepEqual(stored.communities, initial.communities);
        assert.equal(stored.connectionStatus, "UNVERIFIED");
        assert.equal(stored.routingStatus, "NOT_APPLIED");
        assert.deepEqual(await effectCounts(), { receipts: 1, audits: 1 });
      });

      await t.test("public directory returns only the listed whitelist without rooms or private state", async () => {
        assert.deepEqual(await repository.getPublicDirectory(), [{
          id: communities[0]!.id, slug: "alpha", name: "공개 커뮤니티", origin: "https://alpha.example",
          description: "공개 설명\n두 번째 줄", connectionStatus: "UNVERIFIED", routingStatus: "NOT_APPLIED",
        }]);
        const audit = (await database.select().from(auditEvents).where(eq(auditEvents.requestId, initialMetadata.requestId)))[0]!;
        const auditJson = JSON.stringify({ before: audit.beforeJson, after: audit.afterJson, metadata: audit.metadataJson });
        assert.doesNotMatch(auditJson, /private-group|내부 방|alpha\.example|비공개 초안/u);
        assert.deepEqual(audit.metadataJson, { metadataOnly: true, phoneRoutingChanged: false });
      });

      await t.test("replay has no duplicate writes and a changed request cannot reuse its key", async () => {
        const replay = await repository.updateSnapshot(initialCommand);
        assert.equal(replay.replayed, true);
        assert.equal(replay.revision, 1);
        assert.deepEqual(replay.body.snapshot.communities, initial.communities);
        const changed = { ...initial, communities: initial.communities.map((community) => ({ ...community, description: "변경" })) };
        await assert.rejects(repository.updateSnapshot({
          actor: superActor, metadata: metadata(changed, 1, initialMetadata.requestKey), snapshot: changed,
        }), errorCode("IDEMPOTENCY_MISMATCH"));
        assert.deepEqual(await effectCounts(), { receipts: 1, audits: 1 });
      });

      await t.test("duplicate slug or normalized origin is rejected without partial state", async () => {
        const before = await repository.getSnapshot();
        for (const duplicate of [
          { ...communities[1]!, slug: "ALPHA" },
          { ...communities[1]!, origin: "https://ALPHA.example/" },
        ]) {
          const candidate = { ...initial, communities: [communities[0]!, duplicate, communities[2]!] };
          await assert.rejects(repository.updateSnapshot({ actor: superActor, metadata: metadata(candidate, 1), snapshot: candidate }), errorCode("INVALID_COMMUNITY_NETWORK_INPUT"));
        }
        assert.deepEqual(await repository.getSnapshot(), before);
        assert.deepEqual(await effectCounts(), { receipts: 1, audits: 1 });
      });

      await t.test("room ownership cannot move and existing rooms or communities cannot disappear", async () => {
        const before = await repository.getSnapshot();
        const moved = { ...initial, rooms: initial.rooms.map((room, index) => index === 0 ? { ...room, communityId: communities[1]!.id } : room) };
        await assert.rejects(repository.updateSnapshot({ actor: superActor, metadata: metadata(moved, 1), snapshot: moved }), errorCode("COMMUNITY_NETWORK_ROOM_MOVE_FORBIDDEN"));
        const removedRoom = { ...initial, rooms: initial.rooms.slice(1) };
        await assert.rejects(repository.updateSnapshot({ actor: superActor, metadata: metadata(removedRoom, 1), snapshot: removedRoom }), errorCode("COMMUNITY_NETWORK_REMOVAL_FORBIDDEN"));
        const removedCommunity = { ...initial, communities: initial.communities.slice(0, 2) };
        await assert.rejects(repository.updateSnapshot({ actor: superActor, metadata: metadata(removedCommunity, 1), snapshot: removedCommunity }), errorCode("COMMUNITY_NETWORK_REMOVAL_FORBIDDEN"));
        assert.deepEqual(await repository.getSnapshot(), before);
      });

      await t.test("archiving requires inactive rooms and keeps historical metadata", async () => {
        const candidate = { ...initial, communities: initial.communities.map((community) => ({ ...community, state: "ARCHIVED" as const })) };
        await assert.rejects(repository.updateSnapshot({ actor: superActor, metadata: metadata(candidate, 1), snapshot: candidate }), errorCode("INVALID_COMMUNITY_NETWORK_INPUT"));
        const archived = { ...candidate, rooms: initial.rooms.map((room) => ({ ...room, active: false })) };
        const result = await repository.updateSnapshot({ actor: superActor, metadata: metadata(archived, 1), snapshot: archived });
        assert.equal(result.revision, 2);
        assert.equal((await repository.getSnapshot()).rooms.length, 12);
        assert.deepEqual(await repository.getPublicDirectory(), []);
      });

      await t.test("two concurrent editors cannot overwrite the same revision", async () => {
        const current = await repository.getSnapshot();
        const candidates = ["첫 번째 편집", "두 번째 편집"].map((description) => ({
          communities: current.communities.map((community, index) => index === 0 ? { ...community, description } : community), rooms: current.rooms,
        }));
        const results = await Promise.allSettled(candidates.map((snapshot, index) => repository.updateSnapshot({
          actor: index === 0 ? superActor : secondSuperActor, metadata: metadata(snapshot, current.revision), snapshot,
        })));
        const succeeded = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        assert.equal(succeeded.length, 1);
        assert.equal(failed.length, 1);
        assert.ok(errorCode("STALE_COMMUNITY_NETWORK_REVISION")(failed[0]!.reason));
        const stored = await repository.getSnapshot();
        assert.equal(stored.revision, current.revision + 1);
        assert.deepEqual(stored, succeeded[0]!.value.body.snapshot);
        assert.deepEqual(await effectCounts(), { receipts: 3, audits: 3 });
      });

      await t.test("ordinary administrators cannot write and expired sessions cannot replay", async () => {
        const current = await repository.getSnapshot();
        const snapshot = { communities: current.communities, rooms: current.rooms };
        await assert.rejects(repository.updateSnapshot({ actor: adminActor, metadata: metadata(snapshot, current.revision), snapshot }), errorCode("SESSION_STALE"));
        const expiredAt = new Date(Date.now() - 1_000);
        await database.update(authSessions).set({ issuedAt: new Date(expiredAt.getTime() - 60_000), expiresAt: expiredAt }).where(eq(authSessions.id, superActor.sessionId));
        await assert.rejects(repository.updateSnapshot(initialCommand), errorCode("SESSION_STALE"));
        assert.deepEqual(await repository.getSnapshot(), current);
        await database.update(authSessions).set({ expiresAt: new Date(Date.now() + 3_600_000) }).where(eq(authSessions.id, superActor.sessionId));
      });

      await t.test("revocation and demotion are rechecked before a previously successful replay", async () => {
        const current = await repository.getSnapshot();
        await database.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, superActor.sessionId));
        await assert.rejects(repository.updateSnapshot(initialCommand), errorCode("SESSION_STALE"));
        await database.update(authSessions).set({ revokedAt: null }).where(eq(authSessions.id, superActor.sessionId));
        await database.update(userAccounts).set({ role: "ADMIN" }).where(eq(userAccounts.id, superActor.userAccountId));
        await assert.rejects(repository.updateSnapshot(initialCommand), errorCode("SESSION_STALE"));
        await database.update(userAccounts).set({ role: "SUPER_ADMIN" }).where(eq(userAccounts.id, superActor.userAccountId));
        assert.deepEqual(await repository.getSnapshot(), current);
        assert.deepEqual(await effectCounts(), { receipts: 3, audits: 3 });
      });

      await t.test("a database failure at audit insertion rolls back metadata, revision, and receipt together", async () => {
        const before = await repository.getSnapshot();
        const counts = await effectCounts();
        const snapshot = {
          communities: before.communities.map((community) => ({ ...community, description: "실패 시 저장되지 않아야 함" })),
          rooms: before.rooms.map((room) => ({ ...room, displayName: "실패한 편집" })),
        };
        // The audit UUID is deliberately invalid to fail after metadata, revision and receipt writes.
        const commandMetadata = { ...metadata(snapshot, before.revision), requestId: "invalid-audit-uuid" };
        await assert.rejects(repository.updateSnapshot({ actor: superActor, metadata: commandMetadata, snapshot }));
        assert.deepEqual(await repository.getSnapshot(), before);
        assert.deepEqual(await effectCounts(), counts);
        const retried = await repository.updateSnapshot({ actor: superActor, metadata: { ...commandMetadata, requestId: randomUUID() }, snapshot });
        assert.equal(retried.replayed, false, "failed command leaves no replay receipt");
        assert.equal(retried.revision, before.revision + 1);
        assert.deepEqual(await effectCounts(), { receipts: counts.receipts + 1, audits: counts.audits + 1 });
      });
    } finally { await pool.end(); }
  } finally {
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
