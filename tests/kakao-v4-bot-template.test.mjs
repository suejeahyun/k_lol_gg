import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");

test("V4 source template is one thin command-family routing client", async () => {
  const [shared, unified] = await Promise.all([
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js"),
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_UNIFIED.js"),
  ]);
  assert.match(unified, /KLOL_V4\.publicProfileId\(text\)/u);
  assert.doesNotMatch(unified, /KLOL_V4_PROFILE_ID/u);
  assert.equal((shared.match(/\/api\/integrations\/kakao\/v4\/commands/gu) ?? []).length, 1);
  assert.doesNotMatch(shared, /x-klol-room|x-klol-channel|x-klol-sender|roomName|channelId/u);
  assert.match(shared, /\.timeout\(5000\)/u);
  assert.match(shared, /event-boot-/u);
  assert.match(shared, /BOOT_ID/u);
  assert.match(shared, /eventCounter\s*\+=\s*1/u);
  const eventFunction = shared.slice(shared.indexOf("function logEventMaterial"), shared.indexOf("function canonicalLocalCommand"));
  assert.doesNotMatch(eventFunction, /\b(?:text|message|content)\b/iu);
  assert.match(eventFunction, /profile\(profileId\)[\s\S]*BOOT_ID[\s\S]*stableLogId/u);
  assert.match(shared, /command === "봇버전"/u);
  assert.match(shared, /command === "도움말"/u);
  assert.match(shared, /trimText\(sender\) === "오픈채팅봇"/u);
  assert.match(shared, /"KLOL_V4_BOT_SELF_NAME_" \+ profile\(profileId\)/u);
  assert.match(shared, /KLOL_V4_BOT_SELF_NAME_UNIFIED/u);
  assert.equal((unified.match(/KLOL_V4\.send\(/gu) ?? []).length, 1);
});

test("the generated unified phone file is standalone ES5 with one callback", async () => {
  const source = await read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R.js");
  acorn.parse(source, { ecmaVersion: 5, allowReserved: true });
  assert.equal((source.match(/function\s+response\s*\(/gu) ?? []).length, 1);
  assert.doesNotMatch(source, /KLOL_V4_PROFILE_ID/u);
  assert.ok(source.length < 40_000);
});

test("builder owns only the unified paste-ready output", async () => {
  const build = await read("scripts/build-messengerbot-v4.mjs");
  assert.match(build, /KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R\.js/u);
  assert.doesNotMatch(build, /for \(const profile of \["RECRUIT", "FEATURES"\]\)/u);
  assert.match(build, /writeFile/u);
  assert.match(build, /ecmaVersion:\s*5/u);
  assert.match(build, /40_000/u);
  assert.match(build, /analyzeRhinoStatic/u);
});

test("release docs lock one phone, one MessengerBot profile, and two Kakao rooms", async () => {
  const [shared, architecture, installation, environment] = await Promise.all([
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js"),
    read("docs/architecture/KAKAO_V4_COMMAND_GATEWAY.md"),
    read("qa/2026-09-10-kakao-v4-release-candidate/INSTALLATION.md"),
    read("qa/2026-09-10-kakao-v4-release-candidate/ENVIRONMENT_VARIABLES.md"),
  ]);
  const contract = `${architecture}\n${installation}\n${environment}`;
  assert.match(contract, /휴대폰 1대[\s\S]*MessengerBot R (?:통합 )?봇 프로필 1개[\s\S]*카카오톡 방 2개/u);
  assert.match(contract, /RECRUIT[^\n]*(?:구인|파티|스크림)/u);
  assert.match(contract, /(?:내전|전적|랭킹|운영)[^\n]*FEATURES/u);
  assert.match(contract, /callback의 `room`, `channelId`, 방 이름은 파싱·분류·인증·전송에 사용하지 않는다/u);
  assert.match(contract, /실제 카카오 방은 권한 경계가 아니다/u);
  assert.match(contract, /KLOL_V4_BOT_SELF_NAME_RECRUIT/u);
  assert.match(contract, /KLOL_V4_BOT_SELF_NAME_FEATURES/u);
  assert.doesNotMatch(contract, /봇 프로필 2개|각 휴대폰에 붙여넣|별도 휴대폰|휴대폰 두 대가 필요/u);
  for (const key of [
    "KLOL_V2_BASE_URL",
    "KLOL_V4_KAKAO_IDENTITY_SECRET",
    "KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT",
    "KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT",
  ]) assert.match(shared, new RegExp(`"${key}"`, "u"));
  assert.match(shared, /"installation-id\\nKLOL_V4\\n" \+ profile\(profileId\)/u);
  assert.doesNotMatch(shared, /KLOL_V2_(?:BASE_URL|KAKAO_IDENTITY_SECRET)_(?:RECRUIT|FEATURES)/u);
});
