import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("gallery image load failures keep a clear, accessible fallback in the reserved card area", async () => {
  const [image, galleryPage, css] = await Promise.all([
    source("src/app/(public)/(media)/resilient-media-image.tsx"),
    source("src/app/(public)/(media)/images/page.tsx"),
    source("src/app/(public)/(media)/media.module.css"),
  ]);
  assert.match(image, /onError=\{\(\) => setFailed\(true\)\}/u);
  assert.match(image, /role="img"/u);
  assert.match(image, /이미지를 불러올 수 없어요/u);
  assert.match(galleryPage, /ResilientMediaImage/u);
  assert.match(css, /\.mediaFallback/u);
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*9/u);
});
