import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { analyzeRhinoStatic } from "../scripts/lib/messengerbot-rhino-static.mjs";

const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const root = resolve(import.meta.dirname, "..");

test("V4 private generator creates one ignored paste-ready file without printing secrets", async () => {
  const relativeOutput = `.private/test-v4-private-${process.pid}.js`;
  const output = resolve(root, relativeOutput);
  let source = "";
  try {
    const result = spawnSync(process.execPath, ["scripts/build-private-messengerbot-v4.mjs", "--output", relativeOutput], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    source = await readFile(output, "utf8");
    const program = acorn.parse(source, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
    const findings = analyzeRhinoStatic(program);
    assert.equal((source.match(/function\s+response\s*\(/gu) ?? []).length, 1);
    assert.ok(source.length < 40_000);
    assert.equal(findings.statementCandidates.length, 0);
    assert.equal(findings.unsafeSequenceOperands.length, 0);
    assert.equal(findings.voidExpressions.length, 0);
    assert.equal(findings.bareAssignmentConditions.length, 0);
    const secrets = [...source.matchAll(/DataBase\.setDataBase\("KLOL_V4_KAKAO_(?:IDENTITY_SECRET|WEBHOOK_SECRET_CURRENT)", "([^"]+)"\)/gu)]
      .map((match) => match[1]);
    assert.equal(secrets.length, 2);
    assert.notEqual(secrets[0], secrets[1]);
    assert.ok(secrets.every((value) => Buffer.byteLength(value, "utf8") >= 32));
    assert.ok(secrets.every((value) => !result.stdout.includes(value) && !result.stderr.includes(value)));
    assert.match(source, /KLOL_V4_BOT_SELF_NAME_RECRUIT/u);
    assert.match(source, /KLOL_V4_BOT_SELF_NAME_FEATURES/u);
  } finally {
    await rm(output, { force: true });
  }
});
