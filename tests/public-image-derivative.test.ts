import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { renderPublicImage } from "../src/modules/assets/infrastructure/public-image-derivative";
import { PublicPrivateAssetService } from "../src/modules/assets/application/public-private-asset-service";
import { publicMediaAssetUrl } from "../src/modules/media/domain/public-asset-url";
import type { PrivateAssetRecord } from "../src/modules/assets/domain/private-asset";

test("public derivative strips EXIF while preserving original bytes and publication checks on cache hits", async () => {
  const original = await sharp({ create: { width: 32, height: 48, channels: 3, background: "#123456" } })
    .withExif({ IFD0: { Artist: "synthetic-audit-artist", Orientation: "6" } }).jpeg().toBuffer();
  const hash = createHash("sha256").update(original).digest();
  let published = true;
  const id = randomUUID();
  const asset: PrivateAssetRecord = { id, status: "READY", purpose: "GALLERY", storageProvider: "TEST", storageKey: "synthetic", contentType: "image/jpeg", byteSize: original.byteLength, sha256: hash,
    createdByUserAccountId: null, ingestSource: "JOB", originalFileName: null, width: 32, height: 48,
    readyAt: new Date().toISOString(), deleteRequestedAt: null, createdAt: new Date().toISOString() };
  const service = new PublicPrivateAssetService({ async findReadyPublished() { return published ? asset : null; } },
    { storageProvider: "TEST", async read() { return original; }, async stageAt() {}, async requestDelete() {} }, renderPublicImage);
  const response = await service.readPublished(id);
  const metadata = await sharp(response.bytes).metadata();
  assert.equal(response.contentType, "image/webp"); assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined); assert.equal(metadata.iptc, undefined);
  assert.equal(response.byteSize, response.bytes.byteLength);
  assert.deepEqual(createHash("sha256").update(original).digest(), hash);
  assert.ok((await sharp(original).metadata()).exif);
  await service.readPublished(id);
  published = false;
  await assert.rejects(service.readPublished(id), /not available/i);
  assert.equal(publicMediaAssetUrl(id), `/api/media/assets/${id}?v=2`);
});
