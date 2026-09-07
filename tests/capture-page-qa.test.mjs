import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/capture-page-qa.mjs", import.meta.url), "utf8");

test("full-page capture uses stable light reduced-motion rendering and wakes lazy media", () => {
  assert.match(source, /prefers-color-scheme[^\n]+light/);
  assert.match(source, /prefers-reduced-motion[^\n]+reduce/);
  assert.match(source, /document\.documentElement\.scrollHeight/);
  assert.match(source, /scrollTo\(0, 0\)/);
  assert.ok(source.indexOf("document.documentElement.scrollHeight") < source.indexOf("Page.captureScreenshot"));
});
