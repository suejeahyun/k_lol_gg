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

test("full-page capture fails visible repository error states even when HTTP is 200", () => {
  assert.match(source, /hasVisibleRuntimeFailure/);
  assert.match(source, /VISIBLE_RUNTIME_FAILURE/);
  assert.ok(source.includes('[role="alert"]'));
  assert.match(source, /불러오지 못했습니다/);
});

test("full-page capture accepts synthetic credentials through bounded stdin", () => {
  assert.match(source, /readCredentialsFromStdin/u);
  assert.match(source, /16 \* 1024/u);
  assert.match(source, /credentials-stdin/u);
  assert.match(source, /credential\("admin-login-id", "adminLoginId"\)/u);
});
