import assert from "node:assert/strict";
import test from "node:test";

import { KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command, type CanonicalKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandDispatcher } from "../src/modules/recruiting/kakao-v4/dispatcher";
import type { KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";
import { parseKakaoV4InhouseParticipantRow } from "../src/modules/recruiting/kakao-v4/inhouse-snapshot-parser";

const NOW_SECONDS = Date.parse("2026-09-11T12:00:00.000Z") / 1_000;

function liveForm(secondName: "동휘" | "김동휘", secondPositionText = "Mid all") {
  return [
    "📢 내전하실분 #1",
    " 》협곡",
    " 》2026-09-11 21:00 시작",
    "👥 2/10명",
    "",
    "*참가 신청 양식*",
    "이름/현티어/최고티어/주라인/부라인",
    "EX) 1.지후/P/E/AD/MD",
    "",
    "1.지오/G/E/AD/Mid",
    `2.${secondName}/M/M/${secondPositionText}`,
    "3.",
    "4.",
    "5.",
    "6.",
    "7.",
    "8.",
    "9.",
    "10.",
  ].join("\n");
}

function envelope(text: string, eventId: string): KakaoV4CommandEnvelope {
  return {
    profileId: "FEATURES",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId,
    timestamp: NOW_SECONDS,
    nonce: "3".repeat(32),
    text,
  };
}

function canonical(text: string) {
  const input = envelope(text, "event-live-inhouse-canonical-01");
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "FEATURES", text }), input);
}

test("[P0-INHOUSE-LIVE-01] 동휘/김동휘 실양식은 Mid all을 복구해 같은 semantic payload로 dispatch한다", async () => {
  for (const [index, secondName] of (["동휘", "김동휘"] as const).entries()) {
    const text = liveForm(secondName);
    const classification = classifyKakaoV4Command({ profileId: "FEATURES", text });
    assert.equal(classification.kind, "SNAPSHOT", secondName);
    if (classification.kind === "SNAPSHOT") assert.equal(classification.command, "INHOUSE_SNAPSHOT", secondName);
    const command = canonical(text);
    assert.equal(command?.domain, "SEASON", secondName);
    assert.equal(command?.action, "SYNC", secondName);
    if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail("expected SEASON/SYNC");
    assert.deepEqual(command.participants, [
      { slotNo: 1, name: "지오", riotId: null, mainPosition: "ADC", subPositions: ["MID"], reserve: false },
      { slotNo: 2, name: secondName, riotId: null, mainPosition: "MID", subPositions: [], reserve: false },
    ]);

    let dispatchCount = 0;
    const service = new KakaoV4CommandService({
      async authorizeProfile() {
        return {
          roomId: "00000000-0000-4000-8000-000000000001",
          roomStatus: "ACTIVE" as const,
          capabilityProfile: "FEATURES" as const,
          installationId: "00000000-0000-4000-8000-000000000002",
        };
      },
    }, {
      async dispatch(_context: unknown, dispatchedCommand: CanonicalKakaoV4Command) {
        dispatchCount += 1;
        return {
          kind: "SEASON",
          action: dispatchedCommand.action,
          aggregate: null,
          legacyReply: "fixture accepted",
          replayed: false,
        };
      },
    } as unknown as KakaoV4CommandDispatcher);

    const result = await service.execute(
      envelope(text, `event-live-inhouse-${String(index + 1).padStart(8, "0")}`),
      "current",
    );
    assert.equal(result.reply, "fixture accepted");
    assert.equal(dispatchCount, 1);
  }
});

test("[P0-INHOUSE-LIVE-02] slash 계약에 맞춘 MID 또는 ALL 입력은 이름과 무관하게 정상 payload를 만든다", () => {
  for (const secondName of ["동휘", "김동휘"] as const) {
    for (const [positionText, expectedMain] of [["MID", "MID"], ["ALL", "ALL"]] as const) {
      const command = canonical(liveForm(secondName, positionText));
      assert.equal(command?.domain, "SEASON");
      assert.equal(command?.action, "SYNC");
      if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail("expected SEASON/SYNC");
      assert.deepEqual(command.participants, [
        { slotNo: 1, name: "지오", riotId: null, mainPosition: "ADC", subPositions: ["MID"], reserve: false },
        { slotNo: 2, name: secondName, riotId: null, mainPosition: expectedMain, subPositions: [], reserve: false },
      ]);
    }
  }
});

test("[P0-INHOUSE-LIVE-03] Mid all 복구는 mainPosition MID를 유지하고 ALL 부라인을 저장하지 않는다", () => {
  const parsed = parseKakaoV4InhouseParticipantRow("2.동휘/M/M/Mid all", "RIFT");
  assert.equal(parsed.matched, true);
  if (!parsed.matched) assert.fail("expected a numbered row");
  assert.equal(parsed.valid, true);
  if (!parsed.valid) assert.fail("expected a recovered participant row");
  assert.deepEqual(parsed.participant, {
    slotNo: 2,
    name: "동휘",
    riotId: null,
    mainPosition: "MID",
    subPositions: [],
    reserve: false,
  });
  assert.deepEqual(parsed.diagnostics, [{
    code: "RECOVERED_MISSING_POSITION_DELIMITER",
    field: "mainPosition/subPositions",
  }]);
});
