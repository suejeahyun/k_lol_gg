import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");

test("V4 source templates are thin static-profile clients", async () => {
  const [shared, recruit, features] = await Promise.all([
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js"),
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_RECRUIT.js"),
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_FEATURES.js"),
  ]);
  assert.match(recruit, /KLOL_V4_PROFILE_ID\s*=\s*"RECRUIT"/u);
  assert.match(features, /KLOL_V4_PROFILE_ID\s*=\s*"FEATURES"/u);
  assert.equal((shared.match(/\/api\/integrations\/kakao\/v4\/commands/gu) ?? []).length, 1);
  assert.doesNotMatch(shared, /x-klol-room|x-klol-channel|x-klol-sender|roomName|channelId/u);
  assert.match(shared, /\.timeout\(5000\)/u);
  assert.match(shared, /event-boot-/u);
  assert.match(shared, /BOOT_ID/u);
  assert.match(shared, /eventCounter\s*\+=\s*1/u);
  const eventFunction = shared.slice(shared.indexOf("function nextEventId"), shared.indexOf("function canonicalLocalCommand"));
  assert.doesNotMatch(eventFunction, /\b(?:text|message|content)\b/iu);
  assert.match(shared, /command === "봇버전"/u);
  assert.match(shared, /command === "도움말"/u);
  assert.match(shared, /trimText\(sender\) === "오픈채팅봇"/u);
  assert.equal((`${recruit}\n${features}`.match(/KLOL_V4\.send\(/gu) ?? []).length, 2);
});

test("generated phone files are standalone ES5 with one callback", async () => {
  for (const profile of ["RECRUIT", "FEATURES"]) {
    const source = await read(`integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_${profile}_MESSENGERBOT_R.js`);
    acorn.parse(source, { ecmaVersion: 5, allowReserved: true });
    assert.equal((source.match(/function\s+response\s*\(/gu) ?? []).length, 1);
    assert.match(source, new RegExp(`KLOL_V4_PROFILE_ID\\s*=\\s*"${profile}"`));
    assert.ok(source.length < 65_535);
  }
});

test("builder owns the two paste-ready outputs", async () => {
  const build = await read("scripts/build-messengerbot-v4.mjs");
  assert.match(build, /\["RECRUIT", "FEATURES"\]/u);
  assert.match(build, /writeFile/u);
  assert.match(build, /ecmaVersion:\s*5/u);
  assert.match(build, /65_535/u);
});
