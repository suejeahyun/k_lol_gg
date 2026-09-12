import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseReadyPayload,
  parseTaggedValue,
  readArguments,
  summarizeCaptureIndex,
} from "../scripts/run-full-page-qa.mjs";

test("full-page QA runner parses only tagged synthetic harness values", () => {
  assert.equal(parseTaggedValue("ordinary output", "[value] "), null);
  assert.equal(parseTaggedValue("[value] 123456", "[value] "), "123456");
  assert.deepEqual(readArguments(["--output", ".tmp/qa", "--build", "false"]), new Map([
    ["output", ".tmp/qa"],
    ["build", "false"],
  ]));
  const payload = parseReadyPayload(`[browser-qa-ready] ${JSON.stringify({
    origin: "http://127.0.0.1:3000",
    loginId: "synthetic-admin",
    accountLoginId: "synthetic-account",
    setupLoginId: "synthetic-setup",
    password: "synthetic-generated-password",
    fixtures: { parameters: {} },
  })}`);
  assert.equal(payload.accountLoginId, "synthetic-account");
  assert.throws(() => parseReadyPayload('[browser-qa-ready] {"origin":"http://127.0.0.1"}'), /missing loginId/u);
});

test("full-page QA summary fails count drift and any route issue", () => {
  assert.deepEqual(summarizeCaptureIndex({ routes: [
    { path: "/", issues: [] },
    { path: "/admin", issues: [] },
  ] }, 2), {
    expectedTargets: 2,
    capturedTargets: 2,
    issueCount: 0,
    affectedTargets: 0,
    passed: true,
  });
  assert.equal(summarizeCaptureIndex({ routes: [{ issues: ["HTTP_500", "FRAMEWORK_ERROR"] }] }, 1).passed, false);
  assert.equal(summarizeCaptureIndex({ routes: [{ issues: [] }] }, 2).passed, false);
});

test("capture credentials use bounded stdin instead of command-line secrets", async () => {
  const runner = await readFile(new URL("../scripts/run-full-page-qa.mjs", import.meta.url), "utf8");
  const capture = await readFile(new URL("../scripts/capture-page-qa.mjs", import.meta.url), "utf8");
  const harness = await readFile(new URL("../scripts/test-db/run-data-contracts.ts", import.meta.url), "utf8");
  assert.match(runner, /node_modules\/next\/dist\/bin\/next/u);
  assert.doesNotMatch(runner, /npm\.cmd/u);
  assert.match(runner, /"--credentials-stdin", "true"/u);
  assert.doesNotMatch(runner, /"--password", payload\.password/u);
  assert.match(capture, /16 \* 1024/u);
  assert.match(capture, /Unknown synthetic browser QA credential field/u);
  assert.match(harness, /process\.stdin\.off\("data", onBrowserQaCommand\)/u);
  assert.match(harness, /process\.stdin\.pause\(\)/u);
});

test("capture CLI rejects unknown stdin credential fields before opening files or Chromium", async () => {
  const script = new URL("../scripts/capture-page-qa.mjs", import.meta.url);
  const child = spawn(process.execPath, [fileURLToPath(script), "--credentials-stdin", "true"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end('{"productionCookie":"must-not-be-accepted"}');
  const code = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  assert.notEqual(code, 0);
  assert.match(stderr, /Unknown synthetic browser QA credential field: productionCookie/u);
});
