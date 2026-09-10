import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "integrations/messengerbot-r/v4");
const fixture = JSON.parse(await readFile(resolve(root, "tests/fixtures/kakao-v4-v1-compatibility-contract.json"), "utf8"));
const parityFixture = JSON.parse(await readFile(resolve(root, "integrations/messengerbot-r/command-parity-contract.json"), "utf8"));

async function sharedContext() {
  const source = await readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_SHARED.js"), "utf8");
  const context = vm.createContext({
    java: { util: { UUID: { randomUUID() { return { toString() { return "01234567-89ab-cdef-0123-456789abcdef"; } }; } } } },
  });
  vm.runInContext(source, context);
  return context;
}

function routeProfile(route) {
  if (route.domain === "PARTY" || route.domain === "SCRIM") return "RECRUIT";
  if (route.domain === "HELP" && route.action !== "GENERAL_HELP") return "RECRUIT";
  return "FEATURES";
}

test("[P4-C01] every public V1 alias passes the correct phone profile with zero-or-one slash", async () => {
  const { KLOL_V4 } = await sharedContext();
  for (const route of fixture.routes) {
    const profile = routeProfile(route);
    for (const alias of route.aliases) {
      assert.equal(KLOL_V4.acceptsPublicText(profile, alias), true, `${profile}:${alias}`);
      assert.equal(KLOL_V4.acceptsPublicText(profile, `/${alias}`), true, `${profile}:/${alias}`);
      assert.equal(KLOL_V4.publicProfileId(alias), profile, `unified:${profile}:${alias}`);
      assert.equal(KLOL_V4.publicProfileId(`/${alias}`), profile, `unified:${profile}:/${alias}`);
    }
  }
  for (const [profile, snapshot] of [
    ["RECRUIT", fixture.party.initialFivePersonTemplate],
    ["RECRUIT", fixture.scrim.initialTemplate],
    ["FEATURES", fixture.inhouse.riftTemplate],
    ["FEATURES", fixture.inhouse.aramTemplate],
  ]) {
    assert.equal(KLOL_V4.acceptsPublicText(profile, snapshot), true, `${profile}:snapshot`);
    assert.equal(KLOL_V4.publicProfileId(snapshot), profile, `unified:${profile}:snapshot`);
  }
});

test("[P4-C02] local public replies are exact and never include V2 operator commands", async () => {
  const { KLOL_V4 } = await sharedContext();
  for (const profile of ["RECRUIT", "FEATURES"]) {
    assert.equal(KLOL_V4.localReply(profile, "도움말", "QA"), fixture.exactReplies.generalHelp);
    assert.equal(KLOL_V4.localReply(profile, "/명령어", "QA"), fixture.exactReplies.generalHelp);
  }
  assert.equal(KLOL_V4.localReply("RECRUIT", "구인도움말", "QA"), fixture.exactReplies.recruitHelp);
  assert.equal(KLOL_V4.localReply("RECRUIT", "/구인도우미", "QA"), fixture.exactReplies.recruitWebHelp);
  for (const reply of [fixture.exactReplies.generalHelp, fixture.exactReplies.recruitHelp, fixture.exactReplies.recruitWebHelp]) {
    for (const token of fixture.userHelpForbiddenTokens) assert.equal(reply.includes(token), false, token);
  }
});

test("[P4-C02A] all actual V41 public command samples pass the matching V4 phone profile", async () => {
  const { KLOL_V4 } = await sharedContext();
  const internalNames = new Set(["V2도움말", "V2진단", "V2연동확인", "연동확인", "V2사진취소", "V2모집", "V2시즌", "V2양식", "V2사진세션"]);
  for (const command of parityFixture.commands) {
    if (internalNames.has(command.name)) continue;
    const profile = command.domain === "PARTY" || command.domain === "SCRIM" ? "RECRUIT" : "FEATURES";
    assert.equal(KLOL_V4.acceptsPublicText(profile, command.sample), true, `${command.domain}:${command.name}:${command.sample}`);
    assert.equal(KLOL_V4.acceptsPublicText(profile, `/${command.sample}`), true, `${command.domain}:${command.name}:/`);
  }
});

test("[P4-C03] photo and retired preview commands reply locally with no server transmission", async () => {
  const context = await sharedContext();
  const entry = await readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_UNIFIED.js"), "utf8");
  vm.runInContext(entry, context);
  let sends = 0;
  const replies = [];
  context.KLOL_V4.send = () => { sends += 1; return { ok: true, body: { reply: "unexpected" } }; };
  for (const command of ["사진상태", "/내전미리보기취소", "내전확인 ABCDEF"]) {
    context.response("ignored", command, "일반 사용자", true, { reply(value) { replies.push(String(value)); } });
  }
  assert.equal(sends, 0);
  assert.equal(replies.length, 3);
  assert.match(replies[0], /사이트에 로그인해 사진을 제출/u);
  assert.doesNotMatch(replies[0], /세션.*(?:진행|대기)|업로드.*대기/u);
  assert.match(replies[1], /서버의 최종 명단으로 즉시 반영/u);
  assert.match(replies[1], /변경된 내용은 없습니다/u);
  assert.equal(replies[1], replies[2]);
});

test("[P4-C04] internal, unknown, and malformed inputs are rejected before transport", async () => {
  const { KLOL_V4 } = await sharedContext();
  const internal = [
    "V2도움말", "V2진단", "V2연동확인", "연동확인", "V2사진취소",
    'V2모집 {"type":"GET_PARTY_STATUS"}', 'V2시즌 {"action":"STATUS"}',
    'V2양식 {"formType":"meetups"}', "V2사진세션 123e4567-e89b-42d3-a456-426614174000",
  ];
  const rejected = [...internal, "모르는명령", "//도움말", "/ 5인파티", "오늘 /내전현황", "문의/도움말"];
  for (const profile of ["RECRUIT", "FEATURES"]) {
    for (const input of rejected) assert.equal(KLOL_V4.acceptsPublicText(profile, input), false, `${profile}:${input}`);
  }
});

test("[P4-C05] unified entry preserves one send site, five-second timeout, and dynamic family split", async () => {
  const [shared, unified] = await Promise.all([
    readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_SHARED.js"), "utf8"),
    readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_UNIFIED.js"), "utf8"),
  ]);
  assert.match(shared, /\.timeout\(5000\)/u);
  assert.equal((shared.match(/\.execute\(\)/gu) ?? []).length, 1);
  assert.equal((unified.match(/KLOL_V4\.send\(/gu) ?? []).length, 1);
  assert.match(unified, /KLOL_KAKAO_BOT_V4_UNIFIED_2026_09_10_R4_V1_EXACT_DRAFT/u);
  assert.match(shared, /function publicProfileId/u);
});
