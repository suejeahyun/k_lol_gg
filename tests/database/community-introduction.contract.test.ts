import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";

import type { OperationsActor, OperationsCommandMetadata } from "../../src/modules/operations/application/ports";
import { createDefaultCommunityIntroduction, toPublicCommunityIntroductionDto } from "../../src/modules/operations/domain/community-introduction";
import { OperationsError, PostgresOperationsRepository } from "../../src/modules/operations/infrastructure/postgres-operations-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { auditEvents, authSessions, communityIntroduction, operationsCommandReceipts, operationsOutbox, siteSettings, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function metadata(body: unknown, expectedRevision: number, requestKey: string = randomUUID()): OperationsCommandMetadata {
  return { requestId: randomUUID(), requestKey, expectedRevision, requestHashHex: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
}
const failure = (code: string) => (error: unknown) => error instanceof OperationsError && error.code === code;

test("community introduction preserves independent data, revision, actor and public boundaries in PostgreSQL", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 6 });
  try {
    await applyMigrations(database);
    const repository = new PostgresOperationsRepository(database);
    const originalSettings = await database.select().from(siteSettings);
    const createActor = async (role: "ADMIN" | "SUPER_ADMIN" | "USER", purpose: "ADMIN" | "ACCOUNT" = "ADMIN"): Promise<OperationsActor> => {
      const userId = randomUUID(); const sessionId = randomUUID(); const now = new Date();
      await database.insert(userAccounts).values({ id: userId, loginId: `intro-${userId}`, loginIdNormalized: `intro-${userId}`, role, status: "APPROVED" });
      await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId: userId, authVersion: 0, role, purpose,
        issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });
      return { session: { userAccountId: userId, sessionId, role, authVersion: 0 }, role, accountStatus: "APPROVED" };
    };
    const first = await createActor("ADMIN"); const second = await createActor("SUPER_ADMIN");
    const ordinary = await createActor("USER", "ACCOUNT"); const wrongPurpose = await createActor("ADMIN", "ACCOUNT");
    const profile = { ...createDefaultCommunityIntroduction(), published: true, summary: "합성 커뮤니티", introduction: "소개\n함께 즐기는 커뮤니티입니다.", joiningInfo: "신청 안내" };
    let winningActor = first;
    let losingActor = second;
    let winningMetadata = metadata(profile, 0);

    await t.test("missing row is an unpublished revision-zero default without writing on reads", async () => {
      assert.deepEqual(await repository.getCommunityIntroduction(), { revision: 0, updatedAt: null, profile: createDefaultCommunityIntroduction() });
      assert.deepEqual(await database.select().from(communityIntroduction), []);
      assert.equal(toPublicCommunityIntroductionDto(await repository.getCommunityIntroduction(), "https://synthetic.example"), null);
    });

    await t.test("ADMIN and SUPER_ADMIN initial writes serialize across actors and stale revision fails", async () => {
      const commands = [metadata(profile, 0, "introduction-shared-key"), metadata(profile, 0, "introduction-shared-key")];
      const actors = [first, second];
      const results = await Promise.allSettled(actors.map((actor, index) => repository.updateCommunityIntroduction({ actor, metadata: commands[index]!, profile })));
      const winner = results.findIndex((result) => result.status === "fulfilled");
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      assert.ok(failure("STALE_COMMUNITY_INTRODUCTION_REVISION")(rejected.reason));
      winningActor = actors[winner]!; losingActor = actors[1 - winner]!; winningMetadata = commands[winner]!;
      const state = await repository.getCommunityIntroduction();
      assert.equal(state.revision, 1); assert.deepEqual(state.profile, profile); assert.ok(state.updatedAt);
      assert.equal((await database.select().from(communityIntroduction)).length, 1);
      const replay = await repository.updateCommunityIntroduction({ actor: winningActor, metadata: winningMetadata, profile });
      assert.equal(replay.replayed, true); assert.equal(replay.revision, 1);
      const changed = { ...profile, summary: "다른 요청" };
      await assert.rejects(repository.updateCommunityIntroduction({ actor: winningActor, metadata: metadata(changed, 1, winningMetadata.requestKey), profile: changed }), failure("IDEMPOTENCY_MISMATCH"));
      // The same key belongs to a different actor and must perform its own revision-checked mutation.
      const independent = await repository.updateCommunityIntroduction({ actor: losingActor, metadata: metadata(changed, 1, winningMetadata.requestKey), profile: changed });
      assert.equal(independent.replayed, false); assert.equal(independent.revision, 2);
    });

    await t.test("public DTO contains only intended profile fields and unpublish withdraws it", async () => {
      const publicDto = toPublicCommunityIntroductionDto(await repository.getCommunityIntroduction(), "https://synthetic.example")!;
      assert.deepEqual(Object.keys(publicDto).sort(), ["origin", "profile", "updatedAt", "version"]);
      assert.doesNotMatch(JSON.stringify(publicDto), /published|revision|updatedBy|userAccount|internalMaintenance|requestId|createdAt/u);
      const privateProfile = { ...profile, published: false, introduction: "편집 중인 비공개 소개" };
      const result = await repository.updateCommunityIntroduction({ actor: first, metadata: metadata(privateProfile, 2), profile: privateProfile });
      assert.equal(result.revision, 3);
      assert.equal(toPublicCommunityIntroductionDto(await repository.getCommunityIntroduction(), "https://synthetic.example"), null);
      assert.equal((await repository.getCommunityIntroduction()).profile.introduction, privateProfile.introduction);
    });

    await t.test("ordinary users, account sessions and revoked sessions cannot mutate or replay receipts", async () => {
      for (const actor of [ordinary, wrongPurpose]) {
        await assert.rejects(repository.updateCommunityIntroduction({ actor, metadata: metadata(profile, 3), profile }), failure("SESSION_STALE"));
      }
      await database.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, winningActor.session.sessionId));
      await assert.rejects(repository.updateCommunityIntroduction({ actor: winningActor, metadata: winningMetadata, profile }), failure("SESSION_STALE"));
      await database.update(userAccounts).set({ status: "SUSPENDED" }).where(eq(userAccounts.id, losingActor.session.userAccountId));
      await assert.rejects(repository.updateCommunityIntroduction({ actor: losingActor, metadata: metadata(profile, 3), profile }), failure("SESSION_STALE"));
      assert.equal((await repository.getCommunityIntroduction()).revision, 3);
    });

    await t.test("audit, outbox and receipts are atomic without draft text; settings are untouched", async () => {
      const events = await database.select().from(auditEvents).where(eq(auditEvents.action, "COMMUNITY_INTRODUCTION_UPDATED"));
      const outbox = await database.select().from(operationsOutbox).where(eq(operationsOutbox.eventType, "COMMUNITY_INTRODUCTION_UPDATED"));
      const receipts = await database.select().from(operationsCommandReceipts).where(eq(operationsCommandReceipts.scope, "operations.community-introduction.update"));
      assert.equal(events.length, 3); assert.equal(outbox.length, 3); assert.equal(receipts.length, 3);
      assert.doesNotMatch(JSON.stringify(events), /합성 커뮤니티|편집 중인 비공개 소개/);
      assert.deepEqual(await database.select().from(siteSettings), originalSettings);
    });
  } finally { await pool.end(); }
});
