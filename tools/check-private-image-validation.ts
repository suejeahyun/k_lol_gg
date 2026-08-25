import assert from "node:assert/strict";
import sharp from "sharp";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getPrivateBlobAuthOptions, validatePrivateImage } = await import("../src/lib/storage/private-assets");
  const { getKstDateKey } = await import("../src/lib/date/kst");
  assert.deepEqual(getPrivateBlobAuthOptions({ BLOB_STORE_ID: " store_test ", BLOB_READ_WRITE_TOKEN: "token_test" }), { storeId: "store_test" });
  assert.deepEqual(getPrivateBlobAuthOptions({ BLOB_READ_WRITE_TOKEN: " token_test " }), { token: "token_test" });
  assert.deepEqual(getPrivateBlobAuthOptions({}), {});
  assert.equal(getKstDateKey(new Date("2026-08-25T15:00:00.000Z")), "2026-08-26");
  for (const format of ["png", "jpeg", "webp"] as const) {
    const buffer = await sharp({
      create: { width: 320, height: 180, channels: 3, background: "#2563eb" },
    }).toFormat(format).toBuffer();
    const result = await validatePrivateImage(buffer, format === "jpeg" ? "image/jpeg" : `image/${format}`);
    assert.equal(result.mimeType, format === "jpeg" ? "image/jpeg" : `image/${format}`);
    assert.equal(result.width, 320);
    assert.equal(result.height, 180);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  }

  await assert.rejects(() => validatePrivateImage(Buffer.from("not-an-image")), /PNG, JPG 또는 WebP/);
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(() => validatePrivateImage(png, "image/jpeg"), /일치하지 않습니다/);
  console.log("Private image validation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
