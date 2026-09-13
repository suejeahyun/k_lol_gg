import assert from "node:assert/strict";
import test from "node:test";

import {
  galleryFileProblemLabels,
  parseGalleryUploadReport,
  planGalleryFiles,
} from "../src/components/admin/media/admin-media-upload";

function file(name: string, type = "image/png", size = 1024) {
  return { name, type, size };
}

test("invalid gallery files do not consume the five valid upload slots", () => {
  const planned = planGalleryFiles([
    file("invalid.svg", "image/svg+xml"),
    file("one.png"),
    file("two.jpg", "image/jpeg"),
    file("three.webp", "image/webp"),
    file("four.png"),
    file("five.png"),
    file("overflow.png"),
  ], 5);

  assert.deepEqual(planned.accepted.map(({ name }) => name), ["one.png", "two.jpg", "three.webp", "four.png", "five.png"]);
  assert.deepEqual(galleryFileProblemLabels(planned.rejected), [
    "invalid.svg (PNG, JPEG, WebP 파일이 아닙니다.)",
    "overflow.png (갤러리 최대 5장 제한을 넘었습니다.)",
  ]);
});

test("gallery file planning applies remaining capacity after validation", () => {
  const planned = planGalleryFiles([
    file("empty.png", "image/png", 11),
    file("valid-one.png"),
    file("valid-two.png"),
  ], 1);

  assert.deepEqual(planned.accepted.map(({ name }) => name), ["valid-one.png"]);
  assert.deepEqual(galleryFileProblemLabels(planned.rejected), [
    "empty.png (파일 크기가 4MiB 제한을 벗어났습니다.)",
    "valid-two.png (갤러리 최대 5장 제한을 넘었습니다.)",
  ]);
});

test("short-lived gallery upload reports are bounded before display", () => {
  assert.deepEqual(parseGalleryUploadReport(JSON.stringify({
    uploaded: 2,
    linked: 0,
    failedNames: ["bad.svg (PNG 파일이 아닙니다.)"],
    attachmentError: "revision이 변경되었습니다.",
  })), {
    uploaded: 2,
    linked: 0,
    failedNames: ["bad.svg (PNG 파일이 아닙니다.)"],
    attachmentError: "revision이 변경되었습니다.",
  });
  assert.equal(parseGalleryUploadReport(JSON.stringify({ uploaded: 2, linked: 3, failedNames: [] })), null);
  assert.equal(parseGalleryUploadReport(JSON.stringify({ uploaded: 0, linked: 0, failedNames: ["x".repeat(401)] })), null);
  assert.equal(parseGalleryUploadReport("not-json"), null);
});
