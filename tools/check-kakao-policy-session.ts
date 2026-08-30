import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canAccessKakaoOwnedResource,
  evaluateKakaoRequestPolicy,
  evaluatePartyMutationOwnership,
  isKakaoOperatorSender,
} from "../src/lib/kakao/policy";
import type { KakaoOperationSettings } from "../src/lib/kakao/settings";

const base = {
  globalEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: "점검 중",
  allowedRoomNames: ["K-LOL 구인방"],
  blockedRoomNames: [],
  blockedSenders: [],
  operatorSenderNames: ["관리자 재현"],
  ignoreBotSender: true,
  botSenderPatterns: ["오픈채팅봇"],
  recruitCommandEnabled: true,
  recruitCreateCommandEnabled: true,
  recruitJoinCommandEnabled: true,
  recruitFinishCommandEnabled: true,
  recruitStatusCommandEnabled: true,
  seasonApplyCommandEnabled: true,
  seasonSnapshotForwardEnabled: true,
  seasonStatusCommandEnabled: true,
  playerRecordSearchEnabled: true,
  operationFormsEnabled: true,
  disciplineFormEnabled: true,
  disciplineStatusEnabled: true,
  disciplineEvidenceEnabled: true,
  inhouseResultFormEnabled: true,
  inhouseResultImageEnabled: true,
  allowedDisciplineRooms: [],
  allowedInhouseResultRooms: [],
  disabledFeatureMessage: "기능 중지",
  blockedRoomMessage: "사용할 수 없는 방",
} as unknown as KakaoOperationSettings;

assert.deepEqual(
  evaluateKakaoRequestPolicy(base, {
    feature: "RECRUIT_CREATE",
    roomName: "K-LOL 구인방",
    sender: "재현",
    requireRoom: true,
    requireSender: true,
  }),
  { ok: true },
);

assert.equal(
  evaluateKakaoRequestPolicy(base, {
    feature: "RECRUIT_CREATE",
    roomName: "다른 방",
    sender: "재현",
  }).ok,
  false,
);

assert.equal(
  evaluateKakaoRequestPolicy(
    { ...base, recruitFinishCommandEnabled: false },
    { feature: "RECRUIT_FINISH", roomName: "K-LOL 구인방", sender: "재현" },
  ).ok,
  false,
);

assert.equal(isKakaoOperatorSender(base, "관리자 재현"), true);
assert.equal(isKakaoOperatorSender(base, "관리자 재현2"), false);

assert.equal(
  canAccessKakaoOwnedResource(base, {
    resourceRoomName: "K-LOL 구인방",
    resourceSender: "재현",
    roomName: "K-LOL 구인방",
    sender: "재현",
  }),
  true,
);
assert.equal(
  canAccessKakaoOwnedResource(base, {
    resourceRoomName: "K-LOL 구인방",
    resourceSender: "재현",
    roomName: "K-LOL 구인방",
    sender: "다른 사람",
  }),
  false,
);
assert.equal(
  canAccessKakaoOwnedResource(base, {
    resourceRoomName: "다른 방",
    resourceSender: "다른 사람",
    roomName: "K-LOL 구인방",
    sender: "관리자 재현",
  }),
  true,
);

assert.deepEqual(
  evaluatePartyMutationOwnership(base, {
    partyRoomName: "K-LOL 구인방",
    partyHostName: "재현",
    roomName: "K-LOL 구인방",
    sender: "재현",
  }),
  { ok: true, operatorOverride: false },
);

assert.equal(
  evaluatePartyMutationOwnership(base, {
    partyRoomName: "K-LOL 구인방",
    partyHostName: "재현",
    roomName: "K-LOL 구인방",
    sender: "관리자 재현",
  }).ok,
  false,
);

assert.deepEqual(
  evaluatePartyMutationOwnership(base, {
    partyRoomName: "K-LOL 구인방",
    partyHostName: "재현",
    roomName: "K-LOL 구인방",
    sender: "관리자 재현",
    operatorOverride: true,
  }),
  { ok: true, operatorOverride: true },
);

const botSource = readFileSync(
  resolve(process.cwd(), "KLOL_KAKAO_BOT_V40_GUIDED_HUB.js"),
  "utf8",
);
assert.match(botSource, /KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31/);
assert.doesNotMatch(botSource, /\?code=/);
assert.match(botSource, /if \(publicCode == ""\) return false;/);
assert.match(botSource, /clearSession === true/);
assert.match(botSource, /new Date\(\)\.getTime\(\) - savedAt > 30 \* 60 \* 1000/);
assert.match(botSource, /data\.duplicate === true && data\.ok === true/);

const managedRouteSource = readFileSync(
  resolve(process.cwd(), "src/app/api/kakao/managed-forms/route.ts"),
  "utf8",
);
const imageRouteSource = readFileSync(
  resolve(process.cwd(), "src/app/api/kakao/image-receive/route.ts"),
  "utf8",
);
assert.match(managedRouteSource, /isKakaoOperatorSender\(settings, sender\)/);
assert.match(managedRouteSource, /senderMatchesDisciplineTarget\(sender, task\.disciplineRecord\)/);
assert.match(managedRouteSource, /canAccessKakaoOwnedResource\(settings/);
assert.match(managedRouteSource, /message === "\/사진취소"/);
assert.match(imageRouteSource, /\{ publicCode, roomKey, senderKey, status: "ACTIVE" \}/);
assert.match(imageRouteSource, /data: \{ status: "EXPIRED" \}/);
assert.match(imageRouteSource, /clearSession: result\.completed/);

console.log("카카오 공통 정책·소유권·사진 세션 회귀 검사를 통과했습니다.");
