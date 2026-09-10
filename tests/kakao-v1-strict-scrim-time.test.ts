import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeV1StrictScrimTimeText,
  parseV1StrictScrimTime,
  publicScrimMemo,
} from "../src/modules/recruiting/domain/v1-strict-scrim-time";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import {
  KAKAO_V1_STRICT_PROTOCOL,
  KAKAO_V1_STRICT_RESPONSE_FORMAT,
  type KakaoV4CommandEnvelope,
} from "../src/modules/recruiting/kakao-v4/domain";

const FORM = [
  "[K-LOL.GG 스크림 구인 양식]", "", "운영일: 2026-09-11", "번호: #7", "",
  "일시: __TIME__", "방식: 3판2선", "", "우리팀: 하늘단",
  "TOP: 하늘탑", "JUG: ", "MID: ", "ADC: ", "SUP: ", "", "상대팀: ",
  "TOP: ", "JUG: ", "MID: ", "ADC: ", "SUP: ",
].join("\n");

function envelope(text: string, strict: boolean): KakaoV4CommandEnvelope {
  const base = {
    profileId: "RECRUIT" as const,
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: "event-v1-strict-scrim-time-0001",
    timestamp: Date.parse("2026-09-11T12:00:00.000Z") / 1_000,
    nonce: "11111111111111111111111111111111",
    text,
  };
  return strict ? {
    ...base,
    protocol: KAKAO_V1_STRICT_PROTOCOL,
    responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT,
  } : base;
}

function strictPayload(timeText: string) {
  const value = envelope(FORM.replace("__TIME__", timeText), true);
  const command = canonicalizeKakaoV4Command(classifyKakaoV4Command(value), value);
  assert.ok(command && command.domain === "SCRIM" && command.action === "UPSERT");
  return command.payload;
}

test("V1 strict scrim time keeps an explicit M/D instead of forcing the operation date", () => {
  const payload = strictPayload("9/12 21:00");
  assert.equal(payload.scheduledAt, "2026-09-12T12:00:00.000Z");
  assert.equal(payload.memo, null);

  const normal = envelope(FORM.replace("__TIME__", "9/12 21:00"), false);
  const normalCommand = canonicalizeKakaoV4Command(classifyKakaoV4Command(normal), normal);
  assert.ok(normalCommand && normalCommand.domain === "SCRIM" && normalCommand.action === "UPSERT");
  assert.equal(normalCommand.payload.scheduledAt, "2026-09-11T12:00:00.000Z", "ordinary V4 parsing must not change");
});

test("V1 strict scrim time accepts 오전/오후 and H시 forms", () => {
  assert.deepEqual(parseV1StrictScrimTime("오후 9시", "2026-09-11"), {
    scheduledAt: "2026-09-11T12:00:00.000Z",
    startTimeText: "21:00",
  });
  assert.equal(strictPayload("오후 9시").scheduledAt, "2026-09-11T12:00:00.000Z");
});

test("V1 strict scrim time preserves free text without exposing its internal memo carrier", () => {
  const payload = strictPayload("협의");
  assert.equal(payload.scheduledAt, null);
  assert.equal(decodeV1StrictScrimTimeText(payload.memo), "협의");
  assert.equal(publicScrimMemo(payload.memo), null);
});
