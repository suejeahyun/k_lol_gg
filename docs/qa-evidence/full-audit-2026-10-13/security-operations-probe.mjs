// Read-only synthetic probe. No database, provider, credentials, or user media.
// Run from repository root: node --import tsx docs/qa-evidence/full-audit-2026-10-13/security-operations-probe.mjs
import assert from "node:assert/strict";
import sharp from "sharp";
import { validatePrivateScoreboardImage } from "../../../src/modules/matches/infrastructure/private-image.ts";
import { PublicPrivateAssetService } from "../../../src/modules/assets/application/public-private-asset-service.ts";
import { sessionCookieOptions } from "../../../src/modules/auth/infrastructure/session-cookie-policy.ts";

const source = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#406080" } })
  .withExif({ IFD0: { Artist: "synthetic-audit-artist" } })
  .jpeg()
  .toBuffer();
const validated = await validatePrivateScoreboardImage({ bytes: source, declaredContentType: "image/jpeg" });
const assetId = "00000000-0000-4000-8000-000000000001";
const service = new PublicPrivateAssetService({
  async findReadyPublished() {
    return { id: assetId, status: "READY", storageProvider: "SYNTHETIC", storageKey: "synthetic/audit",
      contentType: validated.contentType, byteSize: validated.byteSize, sha256: validated.sha256 };
  },
}, {
  storageProvider: "SYNTHETIC",
  async read() { return validated.bytes; },
});
const published = await service.readPublished(assetId);
const metadata = await sharp(published.bytes).metadata();
assert.deepEqual(Buffer.from(published.bytes), source);
assert.ok(metadata.exif?.includes(Buffer.from("synthetic-audit-artist")));
assert.equal(sessionCookieOptions(true, "production", "ACCOUNT").sameSite, "strict");
console.log(JSON.stringify({
  syntheticOnly: true,
  imageValidationAccepted: true,
  publishedBytesEqualOriginal: true,
  syntheticArtistExifRetained: true,
  exifByteLength: metadata.exif.length,
  accountCookieSameSite: "strict",
}, null, 2));
