import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const generator = resolve(root, "scripts/build-private-messengerbot-installer.mjs");
const settingKeys = [
  "KLOL_V2_BASE_URL",
  "KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT",
  "KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT",
  "KLOL_V2_KAKAO_IDENTITY_SECRET",
];

function readSettings(source) {
  const settings = new Map();
  const pattern = /DataBase\.setDataBase\(\s*"(KLOL_[A-Z0-9_]+)"\s*,\s*"((?:\\.|[^"\\])*)"\s*\)/g;
  for (const match of source.slice(0, 4_096).matchAll(pattern)) {
    settings.set(match[1], JSON.parse(`"${match[2]}"`));
  }
  return settings;
}

test("private installer generator preserves shared settings and creates one identity per Kakao room", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "klol-kakao-private-generator-"));
  try {
    const source = resolve(directory, "approved-private.js");
    const recruit = resolve(directory, "recruit.js");
    const features = resolve(directory, "features.js");
    const approved = new Map([
      [settingKeys[0], "https://example.invalid"],
      [settingKeys[1], "unit-test-secret-with-at-least-32-bytes"],
      [settingKeys[2], "current"],
      [settingKeys[3], "unit-test-identity-with-at-least-32-bytes"],
    ]);
    await writeFile(source, [...approved].map(([key, value]) =>
      `DataBase.setDataBase(${JSON.stringify(key)},${JSON.stringify(value)});`).join(""), "utf8");

    await execFileAsync(process.execPath, [generator, source, recruit], { cwd: root });
    await execFileAsync(process.execPath, [generator, source, features, "--fresh-identity"], { cwd: root });
    const recruitSource = await readFile(recruit, "utf8");
    const featuresSource = await readFile(features, "utf8");
    const recruitSettings = readSettings(recruitSource);
    const featuresSettings = readSettings(featuresSource);

    for (const key of settingKeys.slice(0, 3)) {
      assert.equal(recruitSettings.get(key), approved.get(key));
      assert.equal(featuresSettings.get(key), approved.get(key));
    }
    assert.equal(recruitSettings.get(settingKeys[3]), approved.get(settingKeys[3]));
    assert.notEqual(featuresSettings.get(settingKeys[3]), approved.get(settingKeys[3]));
    assert.notEqual(featuresSettings.get(settingKeys[3]), recruitSettings.get(settingKeys[3]));
    for (const generated of [recruitSource, featuresSource]) {
      const crlfProjection = generated.length + (generated.match(/\n/g) ?? []).length;
      assert.ok(generated.length < 65_535);
      assert.ok(crlfProjection < 65_535);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
