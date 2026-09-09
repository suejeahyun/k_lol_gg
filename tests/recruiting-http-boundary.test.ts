import assert from "node:assert/strict";
import test from "node:test";

import { parseRecruitingCommandBody } from "../src/modules/recruiting/infrastructure/recruiting-input";
import { mayUseRawKakaoRecruitCommand } from "../src/modules/recruiting/infrastructure/kakao-http-request";
import { recruitingCommandScope } from "../src/modules/recruiting/application/commands";

const partyId = "0199a288-15d9-7ae6-9d50-2fa0b1a91111";
const teamId = "0199a288-15d9-7ae6-9d50-2fa0b1a92222";
const tournamentId = "0199a288-15d9-7ae6-9d50-2fa0b1a93333";

test("recruiting JSON boundary accepts only reviewed create fields", () => {
  const allowed = new Set(["CREATE_PARTY"] as const);
  const valid = {
    type: "CREATE_PARTY",
    payload: {
      recruitDate: "2026-09-07", resetSequence: 0, recruitNumber: 1,
      partyType: "FLEX_RANK", title: "저녁 파티", maximumMembers: 5,
      members: [{ name: "참가자", position: "TOP", slotNo: 1, substitute: false }],
      scheduledStartAt: null, protectedUntil: null,
    },
  };
  assert.equal(parseRecruitingCommandBody(valid, allowed)?.type, "CREATE_PARTY");
  assert.equal(parseRecruitingCommandBody({ ...valid, ownerUserAccountId: partyId }, allowed), null);
  assert.equal(parseRecruitingCommandBody({ ...valid, payload: { ...valid.payload, internalNote: "secret" } }, allowed), null);
  assert.equal(parseRecruitingCommandBody({ ...valid, aggregateId: partyId }, allowed)?.aggregateId, partyId);
  assert.equal(parseRecruitingCommandBody({ ...valid, source: "RAW_V2" }, allowed), null, "non-Kakao routes reject transport markers");
  assert.equal(parseRecruitingCommandBody({ ...valid, source: "RAW_V2" }, allowed, undefined, true)?.source, "RAW_V2");
  assert.equal(parseRecruitingCommandBody({ ...valid, source: "COMPAT_V1" }, allowed, undefined, true)?.source, "COMPAT_V1");
  assert.equal(parseRecruitingCommandBody(valid, allowed, undefined, true), null, "Kakao requests fail closed without a signed source marker");
  assert.equal(parseRecruitingCommandBody({ ...valid, source: "FORGED" }, allowed, undefined, true), null);
});

test("raw V2 recruit commands require an operator or explicit non-production development mode", () => {
  assert.equal(mayUseRawKakaoRecruitCommand("sender-operator", {
    NODE_ENV: "production", KAKAO_WEBHOOK_ALLOWED_SENDERS: "sender-operator",
  }), true);
  assert.equal(mayUseRawKakaoRecruitCommand("sender-member", {
    NODE_ENV: "production", KAKAO_WEBHOOK_ALLOWED_SENDERS: "sender-operator", KAKAO_RAW_RECRUIT_COMMANDS_DEVELOPMENT_ONLY: "true",
  }), false);
  assert.equal(mayUseRawKakaoRecruitCommand("sender-member", {
    NODE_ENV: "development", KAKAO_WEBHOOK_ALLOWED_SENDERS: "sender-operator", KAKAO_RAW_RECRUIT_COMMANDS_DEVELOPMENT_ONLY: "true",
  }), true);
  assert.equal(mayUseRawKakaoRecruitCommand("sender-member", {
    NODE_ENV: "development", KAKAO_WEBHOOK_ALLOWED_SENDERS: "sender-operator",
  }), false);
});

test("scrim boundary validates UUID seams and command allowlists", () => {
  const input = {
    type: "CREATE_SCRIM",
    aggregateId: partyId,
    payload: { recruitDate: "2026-09-07", scrimNumber: 1, tournamentId, requesterTeamId: teamId, scheduledAt: null, bestOf: 3 },
  };
  assert.equal(parseRecruitingCommandBody(input, new Set(["CREATE_SCRIM"] as const))?.type, "CREATE_SCRIM");
  assert.equal(parseRecruitingCommandBody({ ...input, payload: { ...input.payload, tournamentId: "not-uuid" } }, new Set(["CREATE_SCRIM"] as const)), null);
  assert.equal(parseRecruitingCommandBody(input, new Set(["CREATE_PARTY"] as const)), null);

  const legacy = {
    type: "CREATE_SCRIM", aggregateId: partyId,
    payload: {
      recruitDate: "2026-09-07", scrimNumber: 2, tournamentId: null, legacyTournamentNumber: 14,
      requesterTeamId: null, title: "별빛단 스크림", requesterTeamName: "별빛단", opponentTeamName: "달빛단",
      requesterLineup: { top: "가", jungle: "나", mid: "다", adc: "라", support: "마" },
      opponentLineup: { top: null, jungle: null, mid: null, adc: null, support: null },
      memo: "즐겁게", seriesRuleText: "3판2선", scheduledAt: null, bestOf: 3,
    },
  };
  assert.equal(parseRecruitingCommandBody(legacy, new Set(["CREATE_SCRIM"] as const))?.type, "CREATE_SCRIM");
  const v1WithoutTournamentNumber = {
    ...legacy,
    payload: { ...legacy.payload, legacyTournamentNumber: null },
  };
  assert.equal(parseRecruitingCommandBody(v1WithoutTournamentNumber, new Set(["CREATE_SCRIM"] as const))?.type, "CREATE_SCRIM");
  assert.equal(parseRecruitingCommandBody({ ...legacy, payload: { ...legacy.payload, legacyTournamentNumber: 10_000 } }, new Set(["CREATE_SCRIM"] as const)), null);
  assert.equal(parseRecruitingCommandBody({ ...legacy, payload: { ...legacy.payload, requesterTeamName: null } }, new Set(["CREATE_SCRIM"] as const)), null);

  const sync = { ...legacy, type: "SYNC_SCRIM" };
  assert.equal(parseRecruitingCommandBody(sync, new Set(["SYNC_SCRIM"] as const))?.type, "SYNC_SCRIM");
  assert.equal(parseRecruitingCommandBody({ ...sync, payload: { ...sync.payload, opponentTeamId: teamId } }, new Set(["SYNC_SCRIM"] as const))?.type, "SYNC_SCRIM");
  assert.equal(parseRecruitingCommandBody({ ...sync, payload: { ...sync.payload, internalNote: "secret" } }, new Set(["SYNC_SCRIM"] as const)), null);
  assert.equal(parseRecruitingCommandBody(sync, new Set(["JOIN_SCRIM"] as const)), null);
});

test("command scope is bound to both actor and action", () => {
  assert.equal(recruitingCommandScope("BOT", "CREATE_PARTY"), "bot:recruiting:party:create");
  assert.equal(recruitingCommandScope("ACCOUNT", "CREATE_PARTY"), "account:recruiting:party:create");
  assert.equal(recruitingCommandScope("ADMIN", "CANCEL_SCRIM"), "admin:recruiting:scrim:cancel");
  assert.equal(recruitingCommandScope("BOT", "SYNC_SCRIM"), "bot:recruiting:scrim:sync");
  assert.equal(recruitingCommandScope("ADMIN", "RESET_PARTY"), "admin:recruiting:party:reset");
});
