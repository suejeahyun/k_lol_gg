import assert from "node:assert/strict";
import test from "node:test";

import {
  createGallery,
  createHighlight,
  extractYoutubeId,
  setGalleryHomeDisplay,
  toPublicGalleryDto,
  toPublicHighlightDto,
  transitionMediaStatus,
  updateGallery,
  updateHighlight,
} from "../src/modules/media";

test("YouTube inputs canonicalize only supported HTTPS origins and paths", () => {
  assert.equal(extractYoutubeId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ?t=3"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.throws(() => extractYoutubeId("http://youtube.com/watch?v=dQw4w9WgXcQ"), /INVALID_YOUTUBE_URL/);
  assert.throws(() => extractYoutubeId("https://youtube.example/watch?v=dQw4w9WgXcQ"), /INVALID_YOUTUBE_URL/);
  assert.throws(() => extractYoutubeId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), /INVALID_YOUTUBE_URL/);
});

test("highlight uses canonical video data and explicit public DTO", () => {
  const highlight = createHighlight({ id: "h-1", title: " 멋진 장면 ", description: " 설명 ", youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", publish: true });
  const dto = toPublicHighlightDto(highlight, (assetId) => `https://assets.test/${assetId}`);
  assert.deepEqual(Object.keys(dto).sort(), ["description", "id", "thumbnailUrl", "title", "youtubeId", "youtubeWatchUrl"]);
  assert.equal(dto.youtubeWatchUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(dto.thumbnailUrl, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
});

test("gallery validates one to five distinct storage assets", () => {
  const gallery = createGallery({ id: "g-1", title: "우승", description: "기록", imageAssetIds: ["a1", "a2"], publish: true, showOnHome: true });
  assert.equal(gallery.showOnHome, true);
  assert.throws(() => createGallery({ id: "g", title: "t", description: "d", imageAssetIds: [] }), /INVALID_GALLERY_IMAGE_COUNT/);
  const emptyDraft = createGallery({ id: "g-draft", title: "t", description: "d", imageAssetIds: [], allowEmptyDraft: true });
  assert.equal(emptyDraft.status, "DRAFT");
  assert.throws(() => transitionMediaStatus({ content: emptyDraft, expectedRevision: 0, command: "PUBLISH" }), /INVALID_GALLERY_IMAGE_COUNT/);
  assert.throws(() => createGallery({ id: "g", title: "t", description: "d", imageAssetIds: ["a", "a"] }), /DUPLICATE_GALLERY_ASSET/);
});

test("publication FSM archives without hard delete and restore returns to draft", () => {
  const draft = createHighlight({ id: "h", title: "제목", description: "설명", youtubeUrl: "dQw4w9WgXcQ" });
  const published = transitionMediaStatus({ content: draft, expectedRevision: 0, command: "PUBLISH" });
  const archived = transitionMediaStatus({ content: published, expectedRevision: 1, command: "ARCHIVE" });
  const restored = transitionMediaStatus({ content: archived, expectedRevision: 2, command: "RESTORE" });
  assert.equal(restored.status, "DRAFT");
  assert.equal(restored.revision, 3);
  assert.throws(() => transitionMediaStatus({ content: restored, expectedRevision: 1, command: "PUBLISH" }), /STALE_MEDIA_REVISION/);
  assert.throws(() => transitionMediaStatus({ content: published, expectedRevision: 1, command: "PUBLISH" }), /INVALID_MEDIA_TRANSITION/);
});

test("home display is limited to published gallery and clears on unpublish", () => {
  const draft = createGallery({ id: "g", title: "제목", description: "설명", imageAssetIds: ["asset"] });
  assert.throws(() => setGalleryHomeDisplay({ gallery: draft, expectedRevision: 0, showOnHome: true }), /UNPUBLISHED_GALLERY/);
  const published = transitionMediaStatus({ content: draft, expectedRevision: 0, command: "PUBLISH" });
  const home = setGalleryHomeDisplay({ gallery: published, expectedRevision: 1, showOnHome: true });
  const hidden = transitionMediaStatus({ content: home, expectedRevision: 2, command: "UNPUBLISH" });
  assert.equal(hidden.showOnHome, false);
});

test("public gallery DTO resolves only reviewed asset identifiers", () => {
  const gallery = createGallery({ id: "g", title: "제목", description: "설명", imageAssetIds: ["a1"], publish: true });
  const dto = toPublicGalleryDto(gallery, (assetId) => `https://assets.test/${assetId}`);
  assert.deepEqual(dto.images, [{ assetId: "a1", url: "https://assets.test/a1" }]);
  assert.deepEqual(Object.keys(dto).sort(), ["description", "id", "images", "showOnHome", "title"]);
  assert.throws(() => toPublicGalleryDto({ ...gallery, status: "ARCHIVED" }, () => "x"), /GALLERY_NOT_PUBLIC/);
});

test("metadata edits preserve publication status, increment revision, and reject archived content", () => {
  const publishedHighlight = createHighlight({ id: "h", title: "제목", description: "설명", youtubeUrl: "dQw4w9WgXcQ", publish: true });
  const editedHighlight = updateHighlight({ highlight: publishedHighlight, expectedRevision: 0, title: "새 제목", description: "새 설명", youtubeUrl: "https://youtu.be/abcdefghijk", thumbnailAssetId: null, sortOrder: 3 });
  assert.equal(editedHighlight.status, "PUBLISHED");
  assert.equal(editedHighlight.revision, 1);
  assert.equal(editedHighlight.youtubeId, "abcdefghijk");
  const gallery = createGallery({ id: "g", title: "제목", description: "설명", imageAssetIds: ["a"] });
  const editedGallery = updateGallery({ gallery, expectedRevision: 0, title: "새 제목", description: "새 설명", imageAssetIds: ["b"] });
  assert.deepEqual(editedGallery.imageAssetIds, ["b"]);
  const archived = transitionMediaStatus({ content: editedGallery, expectedRevision: 1, command: "ARCHIVE" });
  assert.throws(() => updateGallery({ gallery: archived, expectedRevision: 2, title: "x", description: "y", imageAssetIds: ["z"] }), /ARCHIVED_MEDIA_READ_ONLY/);
});
