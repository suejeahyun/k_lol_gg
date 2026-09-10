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

test("release docs lock one phone, two MessengerBot profiles, and one selected room per profile", async () => {
  const [shared, architecture, installation, environment] = await Promise.all([
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js"),
    read("docs/architecture/KAKAO_V4_COMMAND_GATEWAY.md"),
    read("qa/2026-09-10-kakao-v4-release-candidate/INSTALLATION.md"),
    read("qa/2026-09-10-kakao-v4-release-candidate/ENVIRONMENT_VARIABLES.md"),
  ]);
  const contract = `${architecture}\n${installation}\n${environment}`;
  assert.match(contract, /휴대폰 1대[\s\S]*MessengerBot R (?:봇 )?프로필 2개/u);
  assert.match(contract, /RECRUIT[^\n]*구인 관련방 하나만/u);
  assert.match(contract, /FEATURES[^\n]*기능방 하나만/u);
  assert.match(contract, /공용 `?DataBase`?[^\n]*(?:공동|공유)/u);
  assert.match(contract, /callback의 `room` 문자열은 신뢰하거나 서버로 보내지 않는다/u);
  assert.doesNotMatch(contract, /각 휴대폰에 붙여넣|별도 휴대폰|휴대폰 두 대가 필요/u);
  for (const key of [
    "KLOL_V2_BASE_URL",
    "KLOL_V2_KAKAO_IDENTITY_SECRET",
    "KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT",
    "KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT",
  ]) assert.match(shared, new RegExp(`"${key}"`, "u"));
  assert.match(shared, /"installation-id\\nKLOL_V4\\n" \+ profile\(profileId\)/u);
  assert.doesNotMatch(shared, /KLOL_V2_(?:BASE_URL|KAKAO_IDENTITY_SECRET)_(?:RECRUIT|FEATURES)/u);
});
