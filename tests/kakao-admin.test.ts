import assert from "node:assert/strict";
import test from "node:test";

import {
  isKakaoOperationMessageAllowed,
  parseKakaoOperationSettingsPatch,
  readKakaoRuntimeConfiguration,
} from "../src/modules/recruiting/kakao-admin/domain";
import {
  kakaoAdminRequiredRole,
  parseKakaoAdminTabQuery,
} from "../src/modules/recruiting/kakao-admin/tab-query";
import {
  PARTY_MEMBER_STATS_MAXIMUM_QUERY_LENGTH,
  parsePartyMemberStatsQuery,
} from "../src/modules/recruiting/application/party-member-statistics";

test("Kakao operation settings accept only bounded secret-free fields", () => {
  assert.deepEqual(parseKakaoOperationSettingsPatch({ globalEnabled: false, maxMessageLength: 2000 }), { globalEnabled: false, maxMessageLength: 2000 });
  assert.equal(parseKakaoOperationSettingsPatch({}), null);
  assert.equal(parseKakaoOperationSettingsPatch({ signingSecret: "must-not-enter-db" }), null);
  assert.equal(parseKakaoOperationSettingsPatch({ maxMessageLength: 99 }), null);
  assert.equal(parseKakaoOperationSettingsPatch({ playerSearchEnabled: "yes" }), null);
});

test("Kakao runtime configuration exposes booleans, never secret values", () => {
  const previous = process.env.KAKAO_WEBHOOK_SECRET_CURRENT;
  process.env.KAKAO_WEBHOOK_SECRET_CURRENT = "contract-secret-never-exposed";
  try {
    const status = readKakaoRuntimeConfiguration();
    assert.equal(status.currentSigningKeyConfigured, true);
    assert.equal(JSON.stringify(status).includes("contract-secret-never-exposed"), false);
  } finally {
    if (previous === undefined) delete process.env.KAKAO_WEBHOOK_SECRET_CURRENT;
    else process.env.KAKAO_WEBHOOK_SECRET_CURRENT = previous;
  }
});

test("Kakao message policy normalizes before applying the stored length limit", () => {
  assert.equal(isKakaoOperationMessageAllowed("  ＡＢＣ  ", 3), true);
  assert.equal(isKakaoOperationMessageAllowed("  ＡＢＣ  ", 2), false);
});

test("Kakao admin tab query accepts only allowlisted keys for the selected tab", () => {
  assert.equal(parseKakaoAdminTabQuery({}), "recruits");
  assert.equal(parseKakaoAdminTabQuery({ tab: "health" }), "health");
  assert.equal(parseKakaoAdminTabQuery({ tab: "stats", q: "재현" }), "stats");
  assert.equal(parseKakaoAdminTabQuery({ tab: ["health", "logs"] }), null);
  assert.equal(parseKakaoAdminTabQuery({ tab: "unknown" }), null);
  assert.equal(parseKakaoAdminTabQuery({ tab: "logs", page: "1" }), null);
  assert.equal(parseKakaoAdminTabQuery({ tab: "logs", q: "재현" }), null);
  assert.equal(parseKakaoAdminTabQuery({ tab: "stats", q: ["재현", "지오"] }), null);
});

test("sensitive Kakao admin tabs require SUPER_ADMIN while operating tabs remain ADMIN", () => {
  for (const tab of ["recruits", "scrims", "stats"] as const) assert.equal(kakaoAdminRequiredRole(tab), "ADMIN");
  for (const tab of ["settings", "logs", "health"] as const) assert.equal(kakaoAdminRequiredRole(tab), "SUPER_ADMIN");
});

test("party member statistics search is normalized and bounded", () => {
  assert.deepEqual(parsePartyMemberStatsQuery("  ＡＢ   재현 "), { state: "ready", query: "ab 재현" });
  assert.deepEqual(parsePartyMemberStatsQuery(undefined), { state: "empty", query: "" });
  assert.equal(parsePartyMemberStatsQuery("가").state, "invalid");
  assert.equal(parsePartyMemberStatsQuery("가".repeat(PARTY_MEMBER_STATS_MAXIMUM_QUERY_LENGTH + 1)).state, "invalid");
  assert.equal(parsePartyMemberStatsQuery("재현\u202e").state, "invalid");
  assert.equal(parsePartyMemberStatsQuery(["재현"]).state, "invalid");
});
