import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the ADR freezes every non-negotiable V1-exact adapter constraint", async () => {
  const adr = await read("docs/architecture/0008-kakao-v1-exact-v4-transport-adapter.md");

  for (const contract of [
    "c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7",
    "휴대폰 1대",
    "카카오톡 방 2개",
    "모든 방 사용자",
    "DRAFT",
    "timeout 5,000ms",
    "imageDB",
    "DB migration을 추가하지 않는다",
  ]) {
    assert.match(adr, new RegExp(contract, "u"), contract);
  }
  assert.match(adr, /구형 `\/api\/kakao\/\*`, bearer token, query secret, body `secret`을 재개하지 않는다/u);
});

test("the reusable V4 text transport is one signed five-second request without bearer fallback", async () => {
  const [shared, entry, domain] = await Promise.all([
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js"),
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_UNIFIED.js"),
    read("src/modules/recruiting/kakao-v4/domain.ts"),
  ]);

  assert.equal((shared.match(/\.execute\(\)/gu) ?? []).length, 1);
  assert.equal((entry.match(/KLOL_V4\.send\(/gu) ?? []).length, 1);
  assert.match(shared, /\.timeout\(5000\)/u);
  assert.match(shared, /\.header\("x-klol-signature", "v4="/u);
  assert.match(shared, /\.header\("Idempotency-Key", currentDelivery\.eventId\)/u);
  assert.match(domain, /KLOL_KAKAO_COMMAND_V4/u);
  assert.match(domain, /KAKAO_V4_TIMESTAMP_TOLERANCE_SECONDS = 300/u);
  assert.doesNotMatch(shared, /Authorization/u);
});

test("installation profiles, not callback room or sender role, form the V4 text authorization boundary", async () => {
  const [shared, entry, installationScope] = await Promise.all([
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js"),
    read("integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_UNIFIED.js"),
    read("src/modules/recruiting/kakao-v4/installation-scope.ts"),
  ]);

  assert.match(shared, /value !== "RECRUIT" && value !== "FEATURES"/u);
  assert.match(installationScope, /klol-v2:kakao-installation-room-scope:v1/u);
  assert.match(installationScope, /authorizeProfile\(input:/u);
  assert.doesNotMatch(installationScope, /requiredRole/u);
  assert.match(entry, /function response\(room, msg, sender,[^)]*imageDB,[^)]*logId, channelId, userHash\)/u);
  assert.doesNotMatch(entry, /KLOL_V4\.send\([^\n]*room/u);
  assert.doesNotMatch(entry, /KLOL_V4\.send\([^\n]*channelId/u);
});

test("V2 services can reserve a hidden DRAFT and legacy bearer routes remain closed", async () => {
  const [route, dispatcher, recruitingDomain, recruitingReadModel, transition] = await Promise.all([
    read("src/app/api/integrations/kakao/v4/commands/route.ts"),
    read("src/modules/recruiting/kakao-v4/dispatcher.ts"),
    read("src/modules/recruiting/domain/recruiting.ts"),
    read("src/modules/recruiting/infrastructure/postgres-recruiting-adapter.ts"),
    read("src/modules/recruiting/infrastructure/legacy-kakao-recruit-transition.ts"),
  ]);

  for (const dependency of ["getRuntimeRecruitingService", "getRuntimeKakaoAssistant", "getRuntimeOperationForms"]) {
    assert.match(route, new RegExp(dependency, "u"));
  }
  assert.match(dispatcher, /initialStatus: "DRAFT"/u);
  assert.match(recruitingDomain, /status: "IN_PROGRESS"/u);
  assert.match(recruitingReadModel, /inArray\(recruitParties\.status, \["IN_PROGRESS"\]\)/u);
  assert.match(transition, /KAKAO_BOT_UPGRADE_REQUIRED/u);
  assert.match(transition, /status: 410/u);
});

test("the existing image service is separately signed, bounded, and session-backed", async () => {
  const [route, requestBoundary, imageService] = await Promise.all([
    read("src/app/api/integrations/kakao/image-receive/route.ts"),
    read("src/modules/recruiting/infrastructure/kakao-http-request.ts"),
    read("src/modules/recruiting/kakao-assistant/postgres-kakao-image-receive.ts"),
  ]);

  assert.match(route, /prepareKakaoSignedJson\(request, MAXIMUM_KAKAO_IMAGE_BODY_BYTES/u);
  assert.match(route, /getRuntimeKakaoImageReceive\(\)/u);
  assert.match(requestBoundary, /MAXIMUM_KAKAO_IMAGE_BODY_BYTES = 4_200_000/u);
  assert.match(imageService, /session\.status !== "ACTIVE"/u);
  assert.match(imageService, /sameBytes\(session\.senderIdHash, hiddenIdentity\("sender", input\.intent\.senderId\)\)/u);
});
