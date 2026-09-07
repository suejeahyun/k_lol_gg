import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { MediaService, MediaServiceError, type MediaCommandContext } from "../../src/modules/media";
import { PrivateAssetService } from "../../src/modules/assets/application/private-asset-service";
import type { PrivateAssetHumanActor } from "../../src/modules/assets/application/private-asset-policy";
import { PostgresPrivateAssetAdminAdapter } from "../../src/modules/assets/infrastructure/postgres-private-asset-admin-adapter";
import { FakePrivateImageStorage } from "../../src/modules/matches/infrastructure/private-image";
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

test("S10 admin upload persists STAGED to READY, lists by exact draft, attaches safely, and tombstones unused assets", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const adminId = randomUUID(); const sessionId = randomUUID();
  const now = new Date(); const expiresAt = new Date(now.valueOf() + 60 * 60_000);
  const sessionActor = { userAccountId: adminId, sessionId, role: "ADMIN", authVersion: 0 } as const;
  const assetActor: PrivateAssetHumanActor = { ...sessionActor, purpose: "ADMIN", approvalStatus: "APPROVED" };
  const storage = new FakePrivateImageStorage();
  const adapter = new PostgresPrivateAssetAdminAdapter(database);
  const assets = new PrivateAssetService({
    unitOfWork: adapter,
    repository: adapter,
    authorization: adapter,
    audit: adapter.auditPort(),
    inspection: { async inspect() { return { contentType: "image/png", width: 32, height: 32, pageCount: 1, decoded: true }; } },
    storage,
    readGrants: { async issue() { throw new Error("disabled"); } },
    assetIds: { nextId: randomUUID },
    eventIds: { nextId: randomUUID },
    storageKeys: { create(input) { return `media/test/${input.resourceId}/${input.assetId}`; } },
    clock: { now: () => new Date().toISOString() },
  });
  const media = new MediaService(new PostgresMediaRepository(database));
  const bytes = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4,0,0,0,0,0x49,0x45,0x4e,0x44,0,0,0,0]);
  const digest = createHash("sha256").update(bytes).digest("hex");
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: adminId, loginId: `s10-assets-${adminId}`, loginIdNormalized: `s10-assets-${adminId}`, role: "ADMIN", status: "APPROVED" });
    await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId: adminId, role: "ADMIN", purpose: "ADMIN", authVersion: 0, totpVerifiedAt: now, issuedAt: now, expiresAt });

    const created = await media.createGallery(context(sessionActor, "s10-empty-gallery"), 0, { title: "업로드 초안", description: "파일 선택 전", imageAssetIds: [] }, now);
    const galleryId = String((created.body.gallery as { id: string }).id);
    const staged = await assets.stage({ actor: assetActor, resourceType: "GALLERY_ENTRY", resourceId: galleryId, purpose: "GALLERY", bytes, declaredContentType: "image/png", declaredSha256Hex: digest, originalFileName: "gallery.png" });
    assert.equal(staged.status, "STAGED");
    const ready = await assets.finalize(assetActor, staged.assetId);
    assert.equal(ready.status, "READY");
    assert.equal((await assets.readPrivateBytes(assetActor, ready.assetId)).bytes.byteLength, bytes.byteLength);
    const list = await assets.list(assetActor, { resourceType: "GALLERY_ENTRY", resourceId: galleryId, status: "READY", pageSize: 5 });
    assert.deepEqual(list.items.map((item) => item.assetId), [ready.assetId]);
    assert.equal(/storage|sha256|url/iu.test(JSON.stringify(list)), false);
    await assert.rejects(assets.stage({ actor: assetActor, resourceType: "GALLERY_ENTRY", resourceId: galleryId, purpose: "GALLERY", bytes, declaredContentType: "image/png", declaredSha256Hex: digest, originalFileName: "duplicate.png" }), /identical asset/i);

    const attached = await media.updateGallery(context(sessionActor, "s10-attach-ready-gallery"), galleryId, 0, { title: "업로드 초안", description: "READY 연결", imageAssetIds: [ready.assetId] }, now);
    assert.equal((attached.body.gallery as { imageAssetIds: string[] }).imageAssetIds[0], ready.assetId);

    const unusedDraft = await media.createGallery(context(sessionActor, "s10-unused-gallery"), 0, { title: "미연결 초안", description: "정리 대상", imageAssetIds: [] }, now);
    const unusedGalleryId = String((unusedDraft.body.gallery as { id: string }).id);
    const unusedStaged = await assets.stage({ actor: assetActor, resourceType: "GALLERY_ENTRY", resourceId: unusedGalleryId, purpose: "GALLERY", bytes, declaredContentType: "image/png", declaredSha256Hex: digest, originalFileName: "unused.png" });
    await assets.finalize(assetActor, unusedStaged.assetId);
    assert.equal((await assets.requestDeletion(assetActor, unusedStaged.assetId)).status, "DELETE_PENDING");
    await assert.rejects(assets.readPrivateBytes(assetActor, unusedStaged.assetId), /not available/i);
  } finally {
    await pool.end();
  }
});
