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
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), envelope);
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
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), envelope);
}

test("recruiting operating day changes exactly at 06:00 KST", () => {
  assert.equal(recruitingOperatingDateKey(new Date("2026-09-12T05:59:59.999+09:00")), "2026-09-11");
  assert.equal(recruitingOperatingDateKey(new Date("2026-09-12T06:00:00.000+09:00")), "2026-09-12");
  assert.equal(recruitingOperatingDateKey(new Date("2026-09-12T06:01:00.000+09:00")), "2026-09-12");
  assert.throws(() => recruitingOperatingDateKey(new Date(Number.NaN)), /INVALID_RECRUITING_OPERATING_INSTANT/u);
});

test("signed party targets use the envelope instant and the 06:00 KST operating boundary", () => {
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
    domain: "SCRIM", action: "TEMPLATE", recruitDate: "2026-09-11",
  });
  assert.deepEqual(scrimCommand("2026-09-12T06:00:00.000+09:00", "스크림구인"), {
    domain: "SCRIM", action: "TEMPLATE", recruitDate: "2026-09-12",
  });
  assert.deepEqual(scrimCommand("2026-09-12T05:59:59.000+09:00", "스크림상세 15"), {
    domain: "SCRIM", action: "DETAIL", target: { recruitDate: "2026-09-11", recruitNumber: 15 },
  });
  assert.deepEqual(scrimCommand("2026-09-12T06:00:00.000+09:00", "스크림상세 15"), {
    domain: "SCRIM", action: "DETAIL", target: { recruitDate: "2026-09-12", recruitNumber: 15 },
  });
});
