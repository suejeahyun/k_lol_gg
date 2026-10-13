import assert from "node:assert/strict";
import test from "node:test";

import { recruitingOperatingDateKey } from "../src/modules/recruiting/domain/operating-day";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";

function partyCommand(at: string) {
  const text = "15ㅉ";
  const envelope: KakaoV4CommandEnvelope = {
    profileId: "RECRUIT",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: `event-operating-day-${at}`,
    timestamp: Date.parse(at) / 1_000,
    nonce: "1".repeat(32),
    text,
  };
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), envelope, new Date((envelope).timestamp * 1_000));
}

function scrimCommand(at: string, text: string) {
  const envelope: KakaoV4CommandEnvelope = {
    profileId: "RECRUIT",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: `event-scrim-operating-day-${at}-${text}`,
    timestamp: Date.parse(at) / 1_000,
    nonce: "2".repeat(32),
    text,
  };
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), envelope, new Date((envelope).timestamp * 1_000));
}

test("recruiting operating day changes exactly at 06:00 KST", () => {
  assert.equal(recruitingOperatingDateKey(new Date("2026-09-12T05:59:59.999+09:00")), "2026-09-11");
  assert.equal(recruitingOperatingDateKey(new Date("2026-09-12T06:00:00.000+09:00")), "2026-09-12");
  assert.equal(recruitingOperatingDateKey(new Date("2026-09-12T06:01:00.000+09:00")), "2026-09-12");
  assert.throws(() => recruitingOperatingDateKey(new Date(Number.NaN)), /INVALID_RECRUITING_OPERATING_INSTANT/u);
});

test("signed party targets use the server instant and the 06:00 KST operating boundary", () => {
  assert.deepEqual(partyCommand("2026-09-12T05:59:59.000+09:00"), {
    domain: "PARTY", action: "FINISH", target: { recruitDate: "2026-09-11", recruitNumber: 15 },
  });
  assert.deepEqual(partyCommand("2026-09-12T06:00:00.000+09:00"), {
    domain: "PARTY", action: "FINISH", target: { recruitDate: "2026-09-12", recruitNumber: 15 },
  });
  assert.deepEqual(partyCommand("2026-09-12T06:01:00.000+09:00"), {
    domain: "PARTY", action: "FINISH", target: { recruitDate: "2026-09-12", recruitNumber: 15 },
  });
});

test("signed scrim templates and targets use the same 06:00 KST operating boundary", () => {
  assert.deepEqual(scrimCommand("2026-09-12T05:59:59.000+09:00", "스크림구인"), {
    domain: "SCRIM", action: "RESERVE", recruitDate: "2026-09-11",
  });
  assert.deepEqual(scrimCommand("2026-09-12T06:00:00.000+09:00", "스크림구인"), {
    domain: "SCRIM", action: "RESERVE", recruitDate: "2026-09-12",
  });
  assert.deepEqual(scrimCommand("2026-09-12T05:59:59.000+09:00", "스크림상세 15"), {
    domain: "SCRIM", action: "DETAIL", target: { recruitDate: "2026-09-11", recruitNumber: 15 },
  });
  assert.deepEqual(scrimCommand("2026-09-12T06:00:00.000+09:00", "스크림상세 15"), {
    domain: "SCRIM", action: "DETAIL", target: { recruitDate: "2026-09-12", recruitNumber: 15 },
  });
});

test("signed client clock skew cannot select a different business operating day", () => {
  for (const [serverTime, clientTime, expected] of [
    ["2026-10-14T05:56:00+09:00", "2026-10-14T06:00:00+09:00", "2026-10-13"],
    ["2026-10-14T06:01:00+09:00", "2026-10-14T05:57:00+09:00", "2026-10-14"],
  ]) {
    for (const text of ["구인상세 2", "2ㅉ", "상세 2 예비 추가 합성참가", "5인 파티"]) {
      const input: KakaoV4CommandEnvelope = { profileId: "RECRUIT", installationId: "install-" + "1".repeat(32), senderId: "sender-user-" + "2".repeat(32), eventId: "event-server-clock-00001", nonce: "3".repeat(32), timestamp: Date.parse(clientTime!) / 1_000, text };
      const command = canonicalizeKakaoV4Command(classifyKakaoV4Command(input), input, new Date(serverTime!));
      assert.ok(command?.domain === "PARTY");
      const actual = command.action === "CREATE" ? command.payload.recruitDate : "target" in command ? command.target.recruitDate : null;
      assert.equal(actual, expected, text);
    }
  }
});
