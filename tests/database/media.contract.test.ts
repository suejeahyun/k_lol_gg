import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { MediaService, MediaServiceError, type MediaCommandContext } from "../../src/modules/media";
import { PostgresMediaRepository } from "../../src/modules/media/infrastructure/postgres-media-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  mediaCommandReceipts,
  mediaGalleries,
  mediaHighlights,
  mediaOutbox,
  privateAssets,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function context(actor: MediaCommandContext["actorSession"], key: string): MediaCommandContext {
  return { actorSession: actor, idempotencyMaterial: new TextEncoder().encode(key), requestId: randomUUID() };
}

function isServiceError(code: MediaServiceError["code"]) {
  return (error: unknown) => error instanceof MediaServiceError && error.code === code;
}

test("S10 media publication is TOTP-authorized, idempotent, asset-safe, auditable, and soft archived", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const adminId = randomUUID(); const adminSessionId = randomUUID(); const unverifiedSessionId = randomUUID();
  const galleryAssetId = randomUUID(); const thumbnailAssetId = randomUUID();
  const now = new Date(); const expiresAt = new Date(now.valueOf() + 60 * 60_000);
  const actor = { userAccountId: adminId, sessionId: adminSessionId, role: "ADMIN", authVersion: 0 } as const;
  const unverifiedActor = { ...actor, sessionId: unverifiedSessionId };
  const service = new MediaService(new PostgresMediaRepository(database));
  try {
    await applyMigrations(database); await applyMigrations(database);
    await database.insert(userAccounts).values({ id: adminId, loginId: "s10-admin", loginIdNormalized: "s10-admin", role: "ADMIN", status: "APPROVED" });
    await database.insert(authSessions).values([
      { id: adminSessionId, tokenHash: randomBytes(32), userAccountId: adminId, role: "ADMIN", purpose: "ADMIN", authVersion: 0, totpVerifiedAt: now, issuedAt: now, expiresAt },
      { id: unverifiedSessionId, tokenHash: randomBytes(32), userAccountId: adminId, role: "ADMIN", purpose: "ADMIN", authVersion: 0, issuedAt: now, expiresAt },
    ]);
    await database.insert(privateAssets).values([
      { id: galleryAssetId, createdByUserAccountId: adminId, ingestSource: "ADMIN", storageProvider: "FAKE_LOCAL", storageKey: `gallery/${galleryAssetId}`, originalFileName: "gallery.png", contentType: "image/png", byteSize: 128, width: 32, height: 32, sha256: randomBytes(32), purpose: "GALLERY", status: "READY", readyAt: now },
      { id: thumbnailAssetId, createdByUserAccountId: adminId, ingestSource: "ADMIN", storageProvider: "FAKE_LOCAL", storageKey: `highlight/${thumbnailAssetId}`, originalFileName: "thumbnail.webp", contentType: "image/webp", byteSize: 128, width: 32, height: 32, sha256: randomBytes(32), purpose: "HIGHLIGHT_THUMBNAIL", status: "READY", readyAt: now },
    ]);

    const createHighlightContext = context(actor, "s10-highlight-create-key");
    const highlightBody = { title: "결승 역전", description: "바론 앞 한타", youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", thumbnailAssetId, sortOrder: 1 };
    const createdHighlight = await service.createHighlight(createHighlightContext, 0, highlightBody, now);
    const highlightId = String((createdHighlight.body.highlight as { id: string }).id);
    assert.equal(createdHighlight.revision, 0);
    assert.equal((await service.createHighlight(createHighlightContext, 0, highlightBody, now)).replayed, true);
    await assert.rejects(service.createHighlight(createHighlightContext, 0, { ...highlightBody, title: "다른 제목" }, now), isServiceError("IDEMPOTENCY_MISMATCH"));
    assert.equal((await service.listPublicHighlights({ pageSize: 12, cursor: null })).items.length, 0);

    const publishedHighlight = await service.transitionHighlight(context(actor, "s10-highlight-publish-key"), highlightId, 0, { action: "PUBLISH" }, now);
    assert.equal(publishedHighlight.revision, 1);
    assert.equal((await service.listPublicHighlights({ pageSize: 12, cursor: null })).items[0]?.id, highlightId);
    await assert.rejects(service.updateHighlight(context(actor, "s10-highlight-stale-key"), highlightId, 0, highlightBody, now), isServiceError("PRECONDITION_FAILED"));

    await assert.rejects(service.createGallery(context(unverifiedActor, "s10-no-totp-key"), 0, { title: "거부", description: "2FA 없음", imageAssetIds: [galleryAssetId] }, now), isServiceError("SESSION_STALE"));
    await assert.rejects(service.createGallery(context(actor, "s10-wrong-purpose-key"), 0, { title: "잘못된 자산", description: "목적 불일치", imageAssetIds: [thumbnailAssetId] }, now), isServiceError("INVALID_INPUT"));

    const createdGallery = await service.createGallery(context(actor, "s10-gallery-create-key"), 0, { title: "우승 기록", description: "함께 남긴 순간", imageAssetIds: [galleryAssetId] }, now);
    const galleryId = String((createdGallery.body.gallery as { id: string }).id);
    await service.transitionGallery(context(actor, "s10-gallery-publish-key"), galleryId, 0, { action: "PUBLISH" }, now);
    const homeGallery = await service.setGalleryHomeDisplay(context(actor, "s10-gallery-home-key"), galleryId, 1, { showOnHome: true }, now);
    assert.equal((homeGallery.body.gallery as { showOnHome: boolean }).showOnHome, true);
    assert.equal((await service.getPublicGallery(galleryId))?.imageAssetIds[0], galleryAssetId);
    await assert.rejects(database.update(privateAssets).set({ status: "DELETE_PENDING", deleteRequestedAt: now }).where(eq(privateAssets.id, galleryAssetId)));

    await service.archiveHighlight(context(actor, "s10-highlight-archive-key"), highlightId, 1, {}, now);
    await service.archiveGallery(context(actor, "s10-gallery-archive-key"), galleryId, 2, {}, now);
    assert.equal(await service.getPublicHighlight(highlightId), null);
    assert.equal(await service.getPublicGallery(galleryId), null);
    assert.equal((await database.select().from(mediaHighlights).where(eq(mediaHighlights.id, highlightId))).length, 1);
    assert.equal((await database.select().from(mediaGalleries).where(eq(mediaGalleries.id, galleryId)))[0]?.status, "ARCHIVED");
    assert.equal((await database.select().from(mediaCommandReceipts)).length, 7);
    assert.equal((await database.select().from(mediaOutbox)).length, 7);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "HIGHLIGHT"))).length, 3);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "GALLERY"))).length, 4);
  } finally {
    await pool.end();
  }
});
