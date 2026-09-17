import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const fixturePath = resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json");
const contract = JSON.parse(await readFile(fixturePath, "utf8"));

function canonicalCommandText(input) {
  const text = String(input).trim();
  if (!text || text === "/" || text.startsWith("//")) return null;
  if (text.startsWith("/")) {
    const stripped = text.slice(1);
    if (!stripped || /^\s/u.test(stripped)) return null;
    return stripped;
  }
  return text;
}

const routeByAlias = new Map();
for (const route of contract.routes) {
  for (const alias of route.aliases) {
    assert.equal(routeByAlias.has(alias), false, `duplicate alias: ${alias}`);
    routeByAlias.set(alias, `${route.domain}:${route.action}`);
  }
}

function classify(input) {
  const canonical = canonicalCommandText(input);
  return canonical === null ? null : routeByAlias.get(canonical) ?? null;
}

function applyFullSnapshot(state, message) {
  if (message.deliveryId === state.lastDeliveryId) return { ...state, duplicate: true };
  return {
    revision: state.revision + 1,
    members: [...message.members],
    lastDeliveryId: message.deliveryId,
    duplicate: false,
  };
}

function canMutateRecruit({ targetScopeId, actorScopeId, actorVerified }) {
  return actorVerified && targetScopeId === actorScopeId;
}

test("contract fixture has traceable V1 evidence and all required domains", () => {
  assert.equal(contract.clientArtifactVersion, "KLOL_KAKAO_BOT_V40_R21_2026_09_17");
  assert.equal(contract.contractVersion, "KLOL_KAKAO_V4_V1_COMPAT_2026_09_17_R9");
  assert.match(contract.source.v1Sha256, /^[a-f0-9]{64}$/u);
  assert.ok(contract.source.currentGoldenTests.length >= 7);
  for (const domain of ["HELP", "PARTY", "INHOUSE", "SCRIM", "PLAYER", "REGISTRATION"]) {
    assert.ok(contract.routes.some((route) => route.domain === domain), domain);
  }
  assert.deepEqual(Object.keys(contract.operationForms.forms).sort(), ["friends", "leaves", "meetups", "suggestions"]);
});

test("zero or exactly one leading slash routes to the same command", () => {
  for (const route of contract.routes) {
    for (const alias of route.aliases) {
      const expected = `${route.domain}:${route.action}`;
      assert.equal(classify(alias), expected, alias);
      assert.equal(classify(`/${alias}`), expected, `/${alias}`);
    }
  }
});

test("double slash, URL slash, separated slash, and middle slash are not commands", () => {
  for (const input of contract.slashBoundary.rejected) {
    assert.equal(classify(input), null, input);
  }
  for (const input of contract.invariants.notCommands) {
    assert.equal(classify(input), null, input);
  }
});

test("same installation scope members can edit and finish across sender identities", () => {
  const scenario = contract.party.crossOwnerScenario;
  assert.notEqual(scenario.creatorSenderId, scenario.editorSenderId);
  assert.notEqual(scenario.creatorSenderId, scenario.finisherSenderId);
  for (const actorSenderId of [scenario.editorSenderId, scenario.finisherSenderId]) {
    assert.ok(actorSenderId.startsWith("sender-"));
    assert.equal(canMutateRecruit({
      targetScopeId: scenario.roomId,
      actorScopeId: scenario.roomId,
      actorVerified: true,
    }), true);
  }
  assert.equal(canMutateRecruit({
    targetScopeId: scenario.roomId,
    actorScopeId: scenario.differentRoomId,
    actorVerified: true,
  }), false);
  assert.equal(canMutateRecruit({
    targetRoomId: scenario.roomId,
    actorRoomId: scenario.roomId,
    actorVerified: false,
  }), false);
});

test("initial party form exposes the three activation fields without participant rows", () => {
  const template = contract.party.initialFivePersonTemplate;
  assert.match(template, /》시작시간 :/u);
  assert.match(template, /》게임정보 :/u);
  assert.match(template, /》주최자 :/u);
  assert.doesNotMatch(template, /^1\.|^예비 1\./mu);
  assert.match(template, /모집번호: #12/u);
  assert.equal(contract.party.activation.metadataOnlyAllowsZeroMembers, true);
  assert.equal(contract.party.activation.metadataOnlyRequiredValue, "organizerText");
  assert.equal(contract.party.activation.emptyStartTimeDefault, "current KST HH:mm");
  assert.equal(contract.party.activation.emptyGameInfoDefault, "미입력");
  assert.equal(contract.party.activation.unchangedBlankTemplateActivates, false);
  assert.equal(contract.party.activation.legacyParticipantRowsRemainAccepted, true);
  assert.equal(contract.party.activation.organizerIsMember, true);
  assert.match(contract.party.activation.organizerMemberPolicy, /primary slot 1/u);
  assert.match(contract.party.detailWithDefaults, /시작시간: 21:34/u);
  assert.match(contract.party.detailWithDefaults, /게임정보: 미입력/u);
  assert.match(contract.party.detailWithDefaults, /주최자: 재현/u);
  assert.match(contract.party.detailWithDefaults, /인원 1\/5/u);
  assert.match(contract.party.detailWithDefaults, /1\. 재현/u);
});

test("full party forms are authoritative snapshots and allow A→B→A", () => {
  const revisions = contract.party.snapshotScenario.revisions;
  let state = { revision: 0, members: [], lastDeliveryId: null, duplicate: false };
  for (const [index, snapshot] of revisions.entries()) {
    state = applyFullSnapshot(state, {
      deliveryId: `delivery-${index + 1}`,
      members: snapshot.members,
    });
    assert.equal(state.revision, index + 1);
    assert.deepEqual(state.members, snapshot.members, snapshot.label);
    assert.equal(state.duplicate, false);
  }
  assert.deepEqual(revisions.slice(0, 3).map((entry) => entry.label), ["A", "B", "A"]);
  assert.deepEqual(state.members, [], "zero members must clear the current snapshot");

  const duplicate = applyFullSnapshot(state, { deliveryId: state.lastDeliveryId, members: ["재현"] });
  assert.equal(duplicate.revision, state.revision);
  assert.equal(duplicate.duplicate, true);
});

test("party member shortcuts retain the full-form workflow and current-scope mutation boundary", () => {
  const shortcuts = contract.party.memberShortcuts;
  assert.deepEqual(shortcuts.syntax, ["상세 12 추가 민서", "상세 12 삭제 민서"]);
  assert.equal(classify(shortcuts.syntax[0]), "PARTY:ADD_MEMBER");
  assert.equal(classify(`/${shortcuts.syntax[0]}`), "PARTY:ADD_MEMBER");
  assert.equal(classify(shortcuts.syntax[1]), "PARTY:REMOVE_MEMBER");
  assert.equal(classify(`/${shortcuts.syntax[1]}`), "PARTY:REMOVE_MEMBER");
  assert.match(shortcuts.targetScope, /current recruiting operating day/u);
  assert.match(shortcuts.targetScope, /RECRUIT installation scope/u);
  assert.deepEqual(shortcuts.allowedStatuses, ["IN_PROGRESS"]);
  assert.equal(shortcuts.appendLatestStatus, true);
  assert.deepEqual(shortcuts.outcomes, [
    "APPLIED",
    "ALREADY_PRESENT",
    "NOT_FOUND",
    "AMBIGUOUS_MEMBER",
    "RECRUIT_MEMBER_LIMIT_EXCEEDED",
    "TARGET_NOT_FOUND",
  ]);
  assert.equal(
    contract.party.detailShortcutGuidance,
    "수정: 이 메시지를 복사해 이름을 고친 뒤 전체 전송\n빠른 추가: 상세 12 추가 이름\n빠른 삭제: 상세 12 삭제 이름\n마감: 12ㅉ",
  );
});

test("Rift, ARAM, and Augment ARAM preserve their V1 field policies", () => {
  const { modes } = contract.inhouse;
  assert.deepEqual(modes.RIFT.memberFields, ["이름", "현티어", "최고티어", "주라인", "부라인"]);
  assert.equal(modes.RIFT.seasonRoster, true);
  for (const mode of [modes.ARAM, modes.AUGMENT_ARAM]) {
    assert.deepEqual(mode.memberFields, ["이름"]);
    assert.equal(mode.seasonRoster, false);
  }
  assert.match(contract.inhouse.zeroParticipants, /withdraws\/cancels/u);
  assert.match(contract.inhouse.riftActivationTemplate, /\[K-LOL\.GG 내전 구인 양식\][\s\S]*》주최자 :/u);
  assert.match(contract.inhouse.aramActivationTemplate, /주최자는 활성화와 동시에 참가자 1번으로 등록됩니다\./u);
  assert.match(contract.inhouse.riftTemplate, /이름\/현티어\/최고티어\/주라인\/부라인/u);
  assert.match(contract.inhouse.aramTemplate, /\*참가 신청 양식\*\n이름\nEX\) 1\.지후/u);
});

test("scrim keeps full-form editing and V1 disabled manual lifecycle replies", () => {
  assert.match(contract.scrim.initialTemplate, /번호: #\d{1,3}/u);
  assert.match(contract.scrim.initialTemplate, /스크림상세 \d{1,3} 추가 이름/u);
  assert.match(contract.scrim.editPolicy, /replaces editable fields immediately/u);
  assert.match(contract.scrim.closePolicy, /06:00 KST/u);
  assert.deepEqual(contract.scrim.deprecatedReplies, {
    DEPRECATED_JOIN: "[K-LOL.GG 스크림 참가 명령 사용 안 함]\n스크림 양식에 직접 입력해주세요.",
    DEPRECATED_CONFIRM: "[K-LOL.GG 스크림 확정 명령 사용 안 함]\n최신 스크림 양식을 다시 보내주세요.",
    DEPRECATED_CANCEL: "[K-LOL.GG 스크림 취소 명령 사용 안 함]\n스크림은 오전 6시에 자동 종료됩니다.",
    DEPRECATED_FINISH: "[K-LOL.GG 스크림 수동 종료 사용 안 함]\n스크림은 매일 오전 6시에 자동 종료됩니다.",
  });
});

test("operation forms retain V1 labels, wrappers, missing-field reply, and echo guard", () => {
  assert.equal(contract.operationForms.botEchoSender, "오픈채팅봇");
  assert.equal(contract.operationForms.botEchoPolicy, "ignore");
  assert.deepEqual(contract.operationForms.forms.leaves, ["이름 및 닉네임", "외출기간", "외출사유", "외출범위"]);
  assert.deepEqual(contract.operationForms.leaveWrappers, ["💟간편 공지💟", "2. 양식작성 후 전송", "<외출>", "&lt;외출&gt;"]);
  assert.equal(
    contract.operationForms.missingFieldsReply,
    "[K-LOL.GG 양식 필드 누락]\n필수 항목을 확인해 주세요: 외출기간, 외출사유, 외출범위",
  );
});

test("registration and warning guidance preserve exact V1 headings and destinations", () => {
  const replies = contract.exactReplies;
  assert.match(replies.registrationHub, /^\[K-LOL\.GG 쉬운 등록 센터\]/u);
  assert.match(replies.registrationHub, /\/start/u);
  assert.match(replies.inhouseResultGuide, /^\[K-LOL\.GG 내전 결과 등록\]/u);
  assert.match(replies.inhouseResultStatusGuide, /^\[K-LOL\.GG 내전 결과 제출 현황\]/u);
  assert.match(replies.disciplineCreateGuide, /^\[K-LOL\.GG 관리자 경고 등록\]/u);
  assert.match(replies.disciplineEvidenceGuide, /^\[K-LOL\.GG 경고 차감 사진 제출\]/u);
  assert.match(replies.disciplineStatusGuide, /^\[K-LOL\.GG 내 경고 현황\]/u);
  assert.match(replies.disciplineCreateGuide, /\/admin\/discipline\/new/u);
  assert.match(replies.disciplineEvidenceGuide, /\/discipline\/evidence/u);
  assert.match(replies.disciplineStatusGuide, /\/account#discipline/u);
});

test("user-facing help excludes V2 diagnostics and raw JSON commands", () => {
  const userHelp = [contract.exactReplies.generalHelp, contract.exactReplies.recruitHelp].join("\n");
  for (const token of contract.userHelpForbiddenTokens) {
    assert.equal(userHelp.includes(token), false, token);
  }
  assert.match(userHelp, /모든 명령어 앞에 \/를 붙여도 사용할 수 있습니다/u);
  assert.match(userHelp, /양식 생성만으로 현황에는 공개되지 않으며/u);
  assert.match(userHelp, /작성한 전체 양식을 보내면 모집이 시작됩니다/u);
  assert.match(userHelp, /상세 번호 추가 이름/u);
  assert.match(userHelp, /상세 번호 삭제 이름/u);
});

test("representative record, recent, and ranking replies remain exact V1 fixtures", () => {
  assert.equal(
    contract.exactReplies.record,
    "[별빛#KR1 전적]\n\n시즌: 가을 시즌\n티어: EMERALD / DIAMOND\n참여: 7회 / 12세트\n전적: 5승 2패 (71.4%)\nKDA: 4.20 (25/8/9)\nMVP: 2회\n\n최근: 승 아리 8/2/9\n\nhttps://k-lol-gg.vercel.app/players/player-1",
  );
  assert.equal(
    contract.exactReplies.recent,
    "[별빛#KR1 최근 경기]\n\n1. 승 | 아리 | 8/2/9\n\nhttps://k-lol-gg.vercel.app/players/player-1",
  );
  assert.equal(
    contract.exactReplies.ranking,
    "🏆 K-LOL.GG 랭킹 TOP 5\n기준: 내전 참여 10회 이상\n\n1. 별빛#KR1 | 승률 71.4% | 참여 12회 | 12세트 | KDA 4.20",
  );
});
