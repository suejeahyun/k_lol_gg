import assert from "node:assert/strict";
import test from "node:test";

import { importV1MediaSubmissions } from "../scripts/cutover/import-v1-media-submissions";
import type { CutoverClient } from "../scripts/cutover/types";
import { toPublicGalleryDto, toPublicHighlightDto } from "../src/modules/media/domain/media-content";

type FakeResult = Readonly<{ rows: readonly Record<string, string>[] }>;

function fakeClient(results: readonly FakeResult[]) {
  const calls: Array<Readonly<{ sql: string; values: unknown[] | undefined }>> = [];
  let index = 0;
  const client = {
    async query(statement: unknown, values?: unknown[]) {
      assert.equal(typeof statement, "string");
      calls.push({ sql: statement as string, values });
      const result = results[index++];
      assert.ok(result, `unexpected query ${index}`);
      return result;
    },
  } as unknown as CutoverClient;
  return { client, calls, queryCount: () => index };
}

const cleanPreflight = {
  highlight_source_count: "2",
  gallery_source_count: "1",
  gallery_url_source_count: "3",
  asset_source_count: "2",
  submission_source_count: "1",
  submission_image_source_count: "2",
  event_gallery_source_count: "1",
  destruction_gallery_source_count: "1",
  invalid_actor: "0",
  invalid_highlights: "0",
  invalid_galleries: "0",
  invalid_assets: "0",
  invalid_submissions: "0",
  missing_submission_relations: "0",
  invalid_submission_images: "0",
  inconsistent_submission_image_counts: "0",
  missing_event_galleries: "0",
  missing_destruction_galleries: "0",
};

const cleanReconciliation = {
  target_highlight_count: "2",
  target_gallery_count: "1",
  target_gallery_url_count: "3",
  target_asset_count: "2",
  target_submission_count: "1",
  target_submission_image_count: "2",
  target_event_gallery_count: "1",
  target_destruction_gallery_count: "1",
  mismatched_highlights: "0",
  mismatched_galleries: "0",
  mismatched_gallery_urls: "0",
  mismatched_assets: "0",
  mismatched_submissions: "0",
  mismatched_submission_images: "0",
};

const actorUserAccountId = "00000000-0000-4000-8000-000000000001";

function successfulResults(inserted = true): FakeResult[] {
  const counts = inserted ? ["2", "1", "2", "2", "1", "3", "1", "1"] : Array(8).fill("0");
  return [
    { rows: [cleanPreflight] },
    ...counts.map((inserted_count) => ({ rows: [{ inserted_count }] })),
    { rows: [cleanReconciliation] },
  ];
}

test("imports public media URLs and inhouse private-asset metadata without secret blobs", async () => {
  const fake = fakeClient(successfulResults());
  const result = await importV1MediaSubmissions(fake.client, { actorUserAccountId });

  assert.deepEqual(result, [
    { name: "assets.private_assets", sourceCount: 2, targetCount: 2, insertedCount: 2 },
    { name: "competition.match_submissions", sourceCount: 1, targetCount: 1, insertedCount: 1 },
    { name: "competition.match_submission_images", sourceCount: 2, targetCount: 2, insertedCount: 2 },
    { name: "media.highlights", sourceCount: 2, targetCount: 2, insertedCount: 2 },
    { name: "media.galleries", sourceCount: 1, targetCount: 1, insertedCount: 1 },
    { name: "media.gallery_external_images", sourceCount: 3, targetCount: 3, insertedCount: 3 },
    { name: "competition.event_gallery_links", sourceCount: 1, targetCount: 1, insertedCount: 1 },
    { name: "competition.destruction_gallery_links", sourceCount: 1, targetCount: 1, insertedCount: 1 },
  ]);
  assert.equal(fake.queryCount(), 10);
  assert.deepEqual(fake.calls[0]?.values, [actorUserAccountId]);
  assert.deepEqual(fake.calls[2]?.values, [actorUserAccountId]);
  assert.deepEqual(fake.calls[4]?.values, [actorUserAccountId]);
  assert.deepEqual(fake.calls[5]?.values, [actorUserAccountId]);

  const sql = fake.calls.map((call) => call.sql).join("\n");
  assert.match(sql, /media\.gallery_external_images/);
  assert.match(sql, /'VERCEL_BLOB_PRIVATE'/);
  assert.match(sql, /jsonb_set[\s\S]*?galleryId/);
  assert.doesNotMatch(sql, /"blobUrl"|"rawText"|"templateSnapshot"|"roomName"|\bsecret\b/i);
  assert.doesNotMatch(sql, /\b(begin|commit|rollback)\b/i);
});

test("legacy public URLs remain visible through the V2 media projection", () => {
  const highlight = toPublicHighlightDto({
    id: "00000000-0000-4000-8000-000000000010",
    revision: 0,
    title: "결승 하이라이트",
    description: "결승전 주요 장면",
    youtubeId: "dQw4w9WgXcQ",
    thumbnailAssetId: null,
    legacyThumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    status: "PUBLISHED",
    sortOrder: 0,
  }, (id) => `/api/media/assets/${id}`);
  assert.equal(highlight.thumbnailUrl, "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg");

  const gallery = toPublicGalleryDto({
    id: "00000000-0000-4000-8000-000000000011",
    revision: 0,
    title: "우승 사진",
    description: "함께 남긴 기록",
    imageAssetIds: [],
    externalImageUrls: ["/images/winners/destruction/6/1.webp", "https://drive.google.com/thumbnail?id=public"],
    showOnHome: true,
    status: "PUBLISHED",
  }, (id) => `/api/media/assets/${id}`);
  assert.deepEqual(gallery.images.map((image) => image.url), [
    "/images/winners/destruction/6/1.webp",
    "https://drive.google.com/thumbnail?id=public",
  ]);
});

test("a clean rerun inserts or relinks nothing and still reconciles", async () => {
  const fake = fakeClient(successfulResults(false));
  const result = await importV1MediaSubmissions(fake.client, { actorUserAccountId });
  assert.deepEqual(result.map((step) => step.insertedCount), Array(8).fill(0));
});

test("rejects unsafe gallery URLs before the first write", async () => {
  const fake = fakeClient([{ rows: [{ ...cleanPreflight, invalid_galleries: "1" }] }]);
  await assert.rejects(
    () => importV1MediaSubmissions(fake.client, { actorUserAccountId }),
    /invalid_galleries/,
  );
  assert.equal(fake.queryCount(), 1);
});

test("throws when imported metadata does not reconcile", async () => {
  const results = successfulResults();
  results[9] = { rows: [{ ...cleanReconciliation, mismatched_assets: "1" }] };
  const fake = fakeClient(results);
  await assert.rejects(
    () => importV1MediaSubmissions(fake.client, { actorUserAccountId }),
    /mismatched_assets/,
  );
});
