import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  parsePrivateAssetAdminListQuery,
  prepareMediaAssetUpload,
} from "../src/modules/media/infrastructure/media-asset-http";
import { PRIVATE_ASSET_MAX_BYTES } from "../src/modules/assets/domain/private-asset";

const resourceId = "11111111-1111-4111-8111-111111111111";

test("admin private asset query is bounded and rejects duplicate or unknown parameters", () => {
  assert.deepEqual(
    parsePrivateAssetAdminListQuery(`https://example.test/admin/private-assets?purpose=GALLERY&status=READY&resourceType=GALLERY_ENTRY&resourceId=${resourceId}&pageSize=5`),
    { purpose: "GALLERY", status: "READY", resourceType: "GALLERY_ENTRY", resourceId, pageSize: 5 },
  );
  assert.equal(parsePrivateAssetAdminListQuery("https://example.test/admin/private-assets?pageSize=101"), null);
  assert.equal(parsePrivateAssetAdminListQuery("https://example.test/admin/private-assets?status=READY&status=STAGED"), null);
  assert.equal(parsePrivateAssetAdminListQuery("https://example.test/admin/private-assets?includeStorageKey=true"), null);
  assert.equal(parsePrivateAssetAdminListQuery("https://example.test/admin/private-assets?purpose=PRIVATE_SECRET&pageSize=100"), null);
});

test("raw media upload preflight requires same origin, If-Match, bounded image MIME/size, SHA and safe name", () => {
  const request = new Request(`https://example.test/api/admin/images/${resourceId}/assets`, {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "image/png",
      "If-Match": '"3"',
      "X-Upload-Byte-Size": "2048",
      "X-Content-Sha256": "a".repeat(64),
      "X-Upload-File-Name": encodeURIComponent("gallery.png"),
    },
  });
  const prepared = prepareMediaAssetUpload(request);
  assert.equal(prepared.ok, true);
  if (prepared.ok) {
    assert.equal(prepared.value.expectedRevision, 3);
    assert.equal(prepared.value.byteSize, 2048);
    assert.equal(prepared.value.originalFileName, "gallery.png");
  }
  assert.equal(prepareMediaAssetUpload(new Request(request.url, { method: "POST", headers: { ...Object.fromEntries(request.headers), Origin: "https://evil.test" } })).ok, false);
  assert.equal(prepareMediaAssetUpload(new Request(request.url, { method: "POST", headers: { ...Object.fromEntries(request.headers), "X-Upload-Byte-Size": String(PRIVATE_ASSET_MAX_BYTES + 1) } })).ok, false);
  assert.equal(prepareMediaAssetUpload(new Request(request.url, { method: "POST", headers: { ...Object.fromEntries(request.headers), "Content-Type": "image/svg+xml" } })).ok, false);
});

test("media editor and private asset administration expose the complete safe workflow", () => {
  const paths = [
    "../src/app/api/admin/highlights/[highlightId]/assets/route.ts",
    "../src/app/api/admin/images/[imageId]/assets/route.ts",
    "../src/app/api/admin/private-assets/route.ts",
    "../src/app/api/admin/private-assets/[assetId]/route.ts",
    "../src/app/api/admin/private-assets/[assetId]/metadata/route.ts",
    "../src/app/(admin)/admin/private-assets/page.tsx",
    "../src/app/(admin)/admin/private-assets/[assetId]/page.tsx",
  ];
  for (const path of paths) assert.equal(existsSync(new URL(path, import.meta.url)), true, path);

  const form = readFileSync(new URL("../src/components/admin/media/admin-media-form.tsx", import.meta.url), "utf8");
  const pages = readFileSync(new URL("../src/components/admin/media/admin-private-asset-pages.tsx", import.meta.url), "utf8");
  const assetRoute = readFileSync(new URL("../src/app/api/admin/private-assets/[assetId]/route.ts", import.meta.url), "utf8");
  assert.match(form, /crypto\.subtle\.digest\("SHA-256"/u);
  assert.match(form, /accept="image\/png,image\/jpeg,image\/webp"/u);
  assert.match(form, /운영 비공개 저장소가 아직 연결되지 않아 업로드가 안전하게 닫혀 있습니다/u);
  assert.doesNotMatch(form, /READY 자산 UUID|자산 ID<input/u);
  assert.match(pages, /DELETE_PENDING/u);
  assert.match(pages, /권한 확인 후 원본 보기/u);
  assert.match(assetRoute, /requestDeletion/u);
  assert.doesNotMatch([pages, assetRoute].join("\n"), /storageKey|sha256|signedUrl/u);
});
