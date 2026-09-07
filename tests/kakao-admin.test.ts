import assert from "node:assert/strict";
import test from "node:test";

import {
  isKakaoOperationMessageAllowed,
  parseKakaoOperationSettingsPatch,
  readKakaoRuntimeConfiguration,
} from "../src/modules/recruiting/kakao-admin/domain";

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
