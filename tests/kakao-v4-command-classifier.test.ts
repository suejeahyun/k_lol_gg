import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  KAKAO_V4_CANONICAL_COMMANDS,
  KAKAO_V4_COMMAND_FAMILIES,
  KAKAO_V4_PROFILE_COMMAND_MATRIX,
  classifyKakaoV4Command,
  type KakaoV4CommandFamily,
} from "../src/modules/recruiting/kakao-v4/classifier";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";

type ParityFixture = Readonly<{
  commands: readonly Readonly<{ domain: string; name: string; sample: string }>[];
}>;

type CompatibilityFixture = Readonly<{
  routes: readonly Readonly<{ domain: string; action: string; aliases: readonly string[] }>[];
  party: Readonly<{ initialFivePersonTemplate: string }>;
  inhouse: Readonly<{ riftTemplate: string; aramTemplate: string }>;
  scrim: Readonly<{ initialTemplate: string }>;
  operationForms: Readonly<{ forms: Readonly<Record<string, readonly string[]>> }>;
}>;

const parityFixture = JSON.parse(await readFile(
  resolve(import.meta.dirname, "../integrations/messengerbot-r/command-parity-contract.json"),
  "utf8",
)) as ParityFixture;
const compatibilityFixture = JSON.parse(await readFile(
  resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json"),
  "utf8",
)) as CompatibilityFixture;

const oppositeProfile = (profileId: KakaoV4ProfileId): KakaoV4ProfileId => profileId === "RECRUIT" ? "FEATURES" : "RECRUIT";

function successfulProfile(text: string) {
  for (const profileId of ["RECRUIT", "FEATURES"] as const) {
    const result = classifyKakaoV4Command({ profileId, text });
    if (result.kind === "COMMAND" || result.kind === "SNAPSHOT") return { profileId, result };
  }
  return null;
}

test("classifier exposes a complete canonical/profile matrix", () => {
  assert.equal(KAKAO_V4_CANONICAL_COMMANDS.length, 46);
  assert.equal(new Set(KAKAO_V4_CANONICAL_COMMANDS).size, 46);
  assert.deepEqual(KAKAO_V4_COMMAND_FAMILIES, ["PARTY", "INHOUSE", "SCRIM", "PLAYER", "OPERATIONS", "LOCAL"]);
  for (const command of KAKAO_V4_CANONICAL_COMMANDS) {
    assert.ok(
      KAKAO_V4_PROFILE_COMMAND_MATRIX.RECRUIT.includes(command) ||
      KAKAO_V4_PROFILE_COMMAND_MATRIX.FEATURES.includes(command),
      command,
    );
  }
});

test("all 101 V41 parity samples classify with zero-or-one slash equivalence", () => {
  assert.equal(parityFixture.commands.length, 101);
  const unmapped: string[] = [];
  for (const fixture of parityFixture.commands) {
    const successful = successfulProfile(fixture.sample);
    if (!successful) {
      unmapped.push(`${fixture.name}: ${fixture.sample}`);
      continue;
    }
    const withSlash = classifyKakaoV4Command({ profileId: successful.profileId, text: `/${fixture.sample}` });
    assert.notEqual(withSlash.kind, "UNKNOWN", fixture.name);
    assert.notEqual(withSlash.kind, "WRONG_PROFILE", fixture.name);
    if (withSlash.kind !== "UNKNOWN" && withSlash.kind !== "WRONG_PROFILE") {
      assert.equal(withSlash.command, successful.result.command, fixture.name);
      assert.equal(withSlash.family, successful.result.family, fixture.name);
      assert.deepEqual(withSlash.parameters, successful.result.parameters, fixture.name);
    }
    const other = classifyKakaoV4Command({ profileId: oppositeProfile(successful.profileId), text: fixture.sample });
    if (successful.result.allowedProfiles.length === 1) {
      assert.equal(other.kind, "WRONG_PROFILE", `${fixture.name}: opposite profile`);
    } else {
      assert.equal(other.kind, "COMMAND", `${fixture.name}: both profiles`);
    }
  }
  assert.deepEqual(unmapped, []);
});

test("the V1 compatibility fixture routes all classify into the six canonical families", () => {
  const expectedFamily: Readonly<Record<string, KakaoV4CommandFamily>> = Object.freeze({
    HELP: "LOCAL",
    PARTY: "PARTY",
    INHOUSE: "INHOUSE",
    SCRIM: "SCRIM",
    PLAYER: "PLAYER",
    REGISTRATION: "OPERATIONS",
  });
  for (const route of compatibilityFixture.routes) {
    for (const alias of route.aliases) {
      const successful = successfulProfile(alias);
      assert.ok(successful, `${route.domain}:${route.action}:${alias}`);
      assert.equal(successful.result.family, expectedFamily[route.domain], alias);
      const withSlash = classifyKakaoV4Command({ profileId: successful.profileId, text: `/${alias}` });
      assert.notEqual(withSlash.kind, "UNKNOWN", alias);
      if (withSlash.kind !== "UNKNOWN" && withSlash.kind !== "WRONG_PROFILE") {
        assert.equal(withSlash.command, successful.result.command, alias);
      }
    }
  }
});

test("double slash, URL slash, separated slash, and middle slash stay UNKNOWN", () => {
  for (const text of [
    "//도움말",
    "//5인파티",
    "/ 5인파티",
    "https://k-lol-gg.vercel.app/도움말",
    "오늘 /내전현황",
    "구인/현황",
  ]) {
    for (const profileId of ["RECRUIT", "FEATURES"] as const) {
      assert.equal(classifyKakaoV4Command({ profileId, text }).kind, "UNKNOWN", `${profileId}:${text}`);
    }
  }
});

test("profile matrix routes recruit, features, and local commands explicitly", () => {
  for (const text of ["5인파티", "구인현황", "스크림구인", "스크림상세 #1"]) {
    assert.notEqual(classifyKakaoV4Command({ profileId: "RECRUIT", text }).kind, "WRONG_PROFILE", text);
    assert.equal(classifyKakaoV4Command({ profileId: "FEATURES", text }).kind, "WRONG_PROFILE", text);
  }
  for (const text of ["내전구인 협곡", "등록", "경고현황", "전적 별빛#KR1", "최근 별빛#KR1", "랭킹"]) {
    assert.notEqual(classifyKakaoV4Command({ profileId: "FEATURES", text }).kind, "WRONG_PROFILE", text);
    assert.equal(classifyKakaoV4Command({ profileId: "RECRUIT", text }).kind, "WRONG_PROFILE", text);
  }
  for (const text of ["봇버전", "도움말", "V2도움말", "V2진단", "연동확인", "V4상태", "V4계약확인"]) {
    for (const profileId of ["RECRUIT", "FEATURES"] as const) {
      const result = classifyKakaoV4Command({ profileId, text });
      assert.equal(result.kind, "COMMAND", `${profileId}:${text}`);
      if (result.kind === "COMMAND") assert.equal(result.family, "LOCAL");
    }
  }
});

test("diagnostic and raw JSON commands are classified as internal, not user help", () => {
  for (const [profileId, text] of [
    ["RECRUIT", "V2도움말"],
    ["RECRUIT", "V2진단"],
    ["RECRUIT", 'V2모집 {"type":"GET_PARTY_STATUS"}'],
    ["FEATURES", 'V2시즌 {"action":"STATUS"}'],
    ["FEATURES", 'V2양식 {"formType":"meetups"}'],
    ["FEATURES", "V2사진세션 123e4567-e89b-42d3-a456-426614174000"],
  ] as const) {
    const result = classifyKakaoV4Command({ profileId, text });
    assert.equal(result.kind, "COMMAND", text);
    if (result.kind === "COMMAND") {
      assert.equal(result.family, "LOCAL", text);
      assert.equal(result.audience, "INTERNAL", text);
      assert.notEqual(result.command, "LOCAL_USER_HELP", text);
    }
  }
});

test("party, inhouse, and scrim full forms win over command parsing as SNAPSHOT", () => {
  const party = classifyKakaoV4Command({ profileId: "RECRUIT", text: compatibilityFixture.party.initialFivePersonTemplate });
  assert.equal(party.kind, "SNAPSHOT");
  if (party.kind === "SNAPSHOT") {
    assert.equal(party.command, "PARTY_SNAPSHOT");
    assert.equal(party.parameters.memberCount, 0);
    assert.equal(party.parameters.startTimeOptional, true);
    assert.equal(party.parameters.gameInfoOptional, true);
  }

  for (const text of [compatibilityFixture.inhouse.riftTemplate, compatibilityFixture.inhouse.aramTemplate]) {
    const result = classifyKakaoV4Command({ profileId: "FEATURES", text });
    assert.equal(result.kind, "SNAPSHOT");
    if (result.kind === "SNAPSHOT") {
      assert.equal(result.command, "INHOUSE_SNAPSHOT");
      assert.equal(result.parameters.memberCount, 0);
    }
  }

  const scrim = classifyKakaoV4Command({ profileId: "RECRUIT", text: compatibilityFixture.scrim.initialTemplate });
  assert.equal(scrim.kind, "SNAPSHOT");
  if (scrim.kind === "SNAPSHOT") assert.equal(scrim.command, "SCRIM_SNAPSHOT");
});

test("party snapshot accepts absent start time/game info and populated optional lines", () => {
  const initial = compatibilityFixture.party.initialFivePersonTemplate;
  assert.doesNotMatch(initial, /시작\s*시간|게임\s*정보/u);
  const first = classifyKakaoV4Command({ profileId: "RECRUIT", text: initial });
  assert.equal(first.kind, "SNAPSHOT");

  const populated = initial.replace("모집번호: #12", "모집번호: #12\n》시작시간: 모이면\n》게임정보: 일겜or자랭");
  const second = classifyKakaoV4Command({ profileId: "RECRUIT", text: populated });
  assert.equal(second.kind, "SNAPSHOT");
  if (second.kind === "SNAPSHOT") assert.equal(second.command, "PARTY_SNAPSHOT");

  const automatic = classifyKakaoV4Command({
    profileId: "RECRUIT",
    text: initial.replace("모집번호: #12", "모집번호: #자동배정").replace("1.", "1. 재현"),
  });
  assert.equal(automatic.kind, "SNAPSHOT");
  if (automatic.kind === "SNAPSHOT") {
    assert.equal(automatic.command, "PARTY_SNAPSHOT");
    assert.equal(automatic.parameters.recruitNumber, null);
    assert.equal(automatic.parameters.automaticRecruitNumber, true);
  }
});

test("Kakao copy/paste party row variants still canonicalize to one SYNC member", () => {
  const variants = [
    ["space separator and missing opening bracket", "2 발", true],
    ["dot without following space", "2.발", false],
    ["closing parenthesis", "2) 발", false],
    ["Kakao-visible escaped dot", String.raw`2\. 발`, false],
    ["full-width digit and dot", "２． 발", false],
    ["surrounding whitespace", "  2  .   발  ", false],
  ] as const;

  for (const [index, [label, row, omitOpeningBracket]] of variants.entries()) {
    const original = compatibilityFixture.party.initialFivePersonTemplate;
    const text = original
      .replace("\n2.\n", `\n${row}\n`)
      .replace("[K-LOL.GG 구인구직 양식]", omitOpeningBracket ? "K-LOL.GG 구인구직 양식]" : "[K-LOL.GG 구인구직 양식]");
    const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text });

    assert.equal(classification.kind, "SNAPSHOT", label);
    if (classification.kind !== "SNAPSHOT") continue;
    assert.equal(classification.command, "PARTY_SNAPSHOT", label);
    assert.equal(classification.parameters.memberCount, 1, label);

    const envelope: KakaoV4CommandEnvelope = {
      profileId: "RECRUIT",
      installationId: "install-11111111111111111111111111111111",
      senderId: "sender-user-22222222222222222222222222222222",
      eventId: `event-flexible-party-row-${index}`,
      timestamp: Date.parse("2026-09-10T03:00:00.000Z") / 1_000,
      nonce: "3".repeat(32),
      text,
    };
    const canonical = canonicalizeKakaoV4Command(classification, envelope);
    assert.equal(canonical?.domain, "PARTY", label);
    assert.equal(canonical?.action, "SYNC", label);
    if (canonical?.domain === "PARTY" && canonical.action === "SYNC") {
      assert.deepEqual(canonical.payload.members, [{ slotNo: 2, name: "발", position: null, substitute: false }], label);
    }
  }
});

test("full-width empty reserve punctuation and clock text never become party members", () => {
  const text = compatibilityFixture.party.initialFivePersonTemplate
    .replace("예비 1.", "예비 １．")
    .replace("\n1.\n", "\n20: 00 출발\n1.\n");
  const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text });
  assert.equal(classification.kind, "SNAPSHOT");
  if (classification.kind !== "SNAPSHOT") return;
  assert.equal(classification.parameters.memberCount, 0);
  const canonical = canonicalizeKakaoV4Command(classification, {
    profileId: "RECRUIT",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: "event-flexible-party-empty-reserve",
    timestamp: Date.parse("2026-09-10T03:00:00.000Z") / 1_000,
    nonce: "4".repeat(32),
    text,
  });
  if (canonical?.domain === "PARTY" && canonical.action === "SYNC") {
    assert.deepEqual(canonical.payload.members, []);
  } else {
    assert.fail("expected PARTY/SYNC");
  }
});

test("flexible party row parsing does not classify ordinary chat or generic number lists", () => {
  const ordinaryTexts = [
    "2 발 먼저 가요",
    ["오늘 할 일", "1 장보기", "2 운동", "3 저녁 약속", "4 귀가", "5 취침"].join("\n"),
    ["모집번호: #12", "1 사과", "2 배", "3 포도", "4 수박", "5 복숭아", "예비 1 후보"].join("\n"),
    ["📢 5인 파티 구인", "1 사과", "2 배", "3 포도", "4 수박", "5 복숭아", "예비 1 후보"].join("\n"),
  ];

  for (const text of ordinaryTexts) {
    assert.equal(classifyKakaoV4Command({ profileId: "RECRUIT", text }).kind, "UNKNOWN", text);
  }
});

test("party snapshot rejects truncated numeric and position templates", () => {
  for (const text of [
    "📢 5인 파티 구인\n모집번호: #12\n1.\n2.\n예비 1.",
    "📢 5인 협곡 파티 구인\n모집번호: #12\nTOP.\nJUG.\nMID.\n예비 1.",
  ]) {
    assert.equal(classifyKakaoV4Command({ profileId: "RECRUIT", text }).kind, "UNKNOWN");
  }
});

test("A→B→A identical text is reclassified without state or content-hash suppression", () => {
  const base = compatibilityFixture.party.initialFivePersonTemplate;
  const a = base.replace("1.", "1. 재현").replace("2.", "2. 기용");
  const b = base.replace("1.", "1. 재현").replace("2.", "2. 소영");
  const results = [a, b, a].map((text) => classifyKakaoV4Command({ profileId: "RECRUIT", text }));
  assert.deepEqual(results.map((result) => result.kind), ["SNAPSHOT", "SNAPSHOT", "SNAPSHOT"]);
  assert.deepEqual(results[0], results[2]);
  assert.notDeepEqual(results[0], results[1]);
});

test("operation forms classify on FEATURES and reject the RECRUIT profile", () => {
  const samples = {
    friends: "지인 이름: 친구\n지인 닉네임: Friend#KR1\n이용기간: 장기\n디스코드 닉네임 변경: 네",
    suggestions: "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 개선 바랍니다.",
    meetups: "주최자 이름 및 닉네임: 주최자\n일자: 2026-09-10\n장소: 서울\n참여자 명단: 가, 나",
    leaves: "이름 및 닉네임: 신청자/닉\n외출기간: 2026-09-10 ~ 2026-09-12\n외출사유: 여행\n외출범위: 소통방",
  } as const;
  assert.deepEqual(Object.keys(samples).sort(), Object.keys(compatibilityFixture.operationForms.forms).sort());
  for (const [formType, text] of Object.entries(samples)) {
    const features = classifyKakaoV4Command({ profileId: "FEATURES", text });
    assert.equal(features.kind, "COMMAND", formType);
    if (features.kind === "COMMAND") {
      assert.equal(features.command, "OPERATIONS_FORM_SUBMIT");
      assert.equal(features.parameters.formType, formType);
    }
    assert.equal(classifyKakaoV4Command({ profileId: oppositeProfile("FEATURES"), text }).kind, "WRONG_PROFILE", formType);
  }
});
