import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { PublicPrivateAssetService } from "../src/modules/assets/application/public-private-asset-service";
import { PrivateAssetError, type PrivateAssetRecord } from "../src/modules/assets/domain/private-asset";
import {
  MediaService,
  MediaServiceError,
  parseMediaAdminListQuery,
  parseMediaPublicListQuery,
  type MediaCommandContext,
  type MediaCommandEnvelope,
  type MediaRepository,
} from "../src/modules/media";

const actorId = randomUUID();
const context: MediaCommandContext = {
  actorSession: { userAccountId: actorId, sessionId: randomUUID(), role: "ADMIN", authVersion: 3 },
  idempotencyMaterial: new TextEncoder().encode("media-idempotency-key-material"),
  requestId: randomUUID(),
};

test("media list parsers are bounded and reject unknown query keys", () => {
  assert.deepEqual(parseMediaPublicListQuery("https://example.test/highlights?pageSize=24"), { pageSize: 24, cursor: null });
  assert.equal(parseMediaPublicListQuery("https://example.test/highlights?pageSize=25"), null);
  assert.equal(parseMediaPublicListQuery("https://example.test/highlights?admin=true"), null);
  assert.deepEqual(parseMediaAdminListQuery("https://example.test/admin/highlights?page=2&pageSize=50&status=PUBLISHED"), { page: 2, pageSize: 50, status: "PUBLISHED" });
  assert.equal(parseMediaAdminListQuery("https://example.test/admin/highlights?page=0"), null);
});

test("media commands use the existing strict YouTube parser, exact bodies, If-Match revision, and deterministic fingerprints", async () => {
  const captured: { envelope?: MediaCommandEnvelope; input?: unknown } = {};
  const repository = {
    async createHighlight(envelope: MediaCommandEnvelope, input: unknown) {
      captured.envelope = envelope; captured.input = input;
      return { body: { revision: 0 }, status: 201, revision: 0, replayed: false };
    },
  } as unknown as MediaRepository;
  const service = new MediaService(repository);
  const body = {
    title: " 결승 명장면 ",
    description: "바론 앞 역전",
    youtubeUrl: "https://youtu.be/dQw4w9WgXcQ?t=3",
    thumbnailAssetId: null,
    sortOrder: 2,
  };
  await service.createHighlight(context, 0, body);
  assert.deepEqual(captured.input, {
    title: "결승 명장면",
    description: "바론 앞 역전",
    youtubeId: "dQw4w9WgXcQ",
    thumbnailAssetId: null,
    sortOrder: 2,
  });
  assert.equal(captured.envelope?.keyHash.byteLength, 32);
  assert.equal(captured.envelope?.requestHash.byteLength, 32);
  assert.equal(captured.envelope?.keyHash.equals(captured.envelope.requestHash), false);
  assert.throws(() => service.createHighlight(context, 1, body), (error: unknown) => error instanceof MediaServiceError && error.code === "PRECONDITION_FAILED");
  assert.throws(() => service.createHighlight(context, 0, { ...body, unknown: true }), (error: unknown) => error instanceof MediaServiceError && error.code === "INVALID_INPUT");
  assert.throws(() => service.createHighlight(context, 0, { ...body, youtubeUrl: "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ" }), (error: unknown) => error instanceof MediaServiceError && error.code === "INVALID_INPUT");
});

test("gallery input permits only one to five distinct READY asset identifiers at the application boundary", async () => {
  let captured: unknown;
  const repository = {
    async createGallery(_envelope: MediaCommandEnvelope, input: unknown) {
      captured = input;
      return { body: { revision: 0 }, status: 201, revision: 0, replayed: false };
    },
  } as unknown as MediaRepository;
  const service = new MediaService(repository);
  const first = randomUUID(); const second = randomUUID();
  await service.createGallery(context, 0, { title: "우승", description: "기록", imageAssetIds: [first, second] });
  assert.deepEqual(captured, { title: "우승", description: "기록", imageAssetIds: [first, second] });
  await service.createGallery(context, 0, { title: "빈 초안", description: "업로드 전", imageAssetIds: [] });
  assert.deepEqual(captured, { title: "빈 초안", description: "업로드 전", imageAssetIds: [] });
  assert.throws(() => service.createGallery(context, 0, { title: "우승", description: "기록", imageAssetIds: [first, first] }), (error: unknown) => error instanceof MediaServiceError && error.code === "INVALID_INPUT");
});

test("gallery input accepts an explicit mixed image order without exposing arbitrary fields", async () => {
  let captured: unknown;
  const repository = {
    async createGallery(_envelope: MediaCommandEnvelope, input: unknown) {
      captured = input;
      return { body: { revision: 0 }, status: 201, revision: 0, replayed: false };
    },
  } as unknown as MediaRepository;
  const service = new MediaService(repository);
  const assetId = randomUUID();
  await service.createGallery(context, 0, {
    title: "혼합",
    description: "이관 자료",
    imageAssetIds: [assetId],
    externalImageUrls: ["/images/legacy/one.webp"],
    imageOrder: [
      { kind: "EXTERNAL", url: "/images/legacy/one.webp" },
      { kind: "ASSET", assetId },
    ],
  });
  assert.deepEqual(captured, {
    title: "혼합",
    description: "이관 자료",
    imageAssetIds: [assetId],
    externalImageUrls: ["/images/legacy/one.webp"],
    imageOrder: [
      { kind: "EXTERNAL", url: "/images/legacy/one.webp" },
      { kind: "ASSET", assetId },
    ],
  });
  assert.throws(() => service.createGallery(context, 0, {
    title: "혼합", description: "오류", imageAssetIds: [assetId], externalImageUrls: ["javascript:alert(1)"],
  }), (error: unknown) => error instanceof MediaServiceError && error.code === "INVALID_INPUT");
});

function publishedAsset(bytes: Uint8Array): PrivateAssetRecord {
  return {
    id: randomUUID(), createdByUserAccountId: actorId, ingestSource: "ADMIN",
    storageProvider: "TEST", storageKey: "private/not-public.bin", originalFileName: "secret.png",
    contentType: "image/png", byteSize: bytes.byteLength, width: 32, height: 32,
    sha256: createHash("sha256").update(bytes).digest(), purpose: "GALLERY", status: "READY",
    readyAt: "2026-09-07T00:00:00.000Z", deleteRequestedAt: null, createdAt: "2026-09-07T00:00:00.000Z",
  };
}

test("published asset delivery checks publication/READY via its port and never returns the storage locator", async () => {
  const bytes = Uint8Array.from([1, 2, 3, 4]); const asset = publishedAsset(bytes);
  const service = new PublicPrivateAssetService(
    { async findReadyPublished(id) { return id === asset.id ? asset : null; } },
    { storageProvider: "TEST", async stageAt() {}, async requestDelete() {}, async read(key) { assert.equal(key, asset.storageKey); return bytes; } },
  );
  const result = await service.readPublished(asset.id);
  assert.deepEqual(Object.keys(result).sort(), ["assetId", "byteSize", "bytes", "contentType"]);
  assert.equal(JSON.stringify({ ...result, bytes: [...result.bytes] }).includes(asset.storageKey), false);
  await assert.rejects(() => service.readPublished(randomUUID()), (error: unknown) => error instanceof PrivateAssetError && error.code === "ASSET_NOT_AVAILABLE");
  const corrupt = new PublicPrivateAssetService(
    { async findReadyPublished() { return asset; } },
    { storageProvider: "TEST", async stageAt() {}, async requestDelete() {}, async read() { return Uint8Array.from([9, 9, 9, 9]); } },
  );
  await assert.rejects(() => corrupt.readPublished(asset.id), (error: unknown) => error instanceof PrivateAssetError && error.code === "STORAGE_UNAVAILABLE");
});
