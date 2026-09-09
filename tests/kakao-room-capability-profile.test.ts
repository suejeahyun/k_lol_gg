import assert from "node:assert/strict";
import test from "node:test";

import {
  KAKAO_ROOM_CAPABILITY_PROFILES,
  kakaoRoomAllowsCapability,
} from "../src/modules/recruiting/kakao-access/domain";
import {
  FEATURES_KAKAO_ROOM_COMMAND,
  RECRUIT_KAKAO_ROOM_COMMAND,
} from "../src/modules/recruiting/infrastructure/kakao-http-request";

test("room capability profiles are exclusive and exposed as authorization policies", () => {
  assert.deepEqual(KAKAO_ROOM_CAPABILITY_PROFILES, ["RECRUIT", "FEATURES"]);
  assert.equal(kakaoRoomAllowsCapability("RECRUIT", "RECRUIT"), true);
  assert.equal(kakaoRoomAllowsCapability("FEATURES", "FEATURES"), true);
  assert.equal(kakaoRoomAllowsCapability("RECRUIT", "FEATURES"), false);
  assert.equal(kakaoRoomAllowsCapability("FEATURES", "RECRUIT"), false);
  assert.deepEqual(RECRUIT_KAKAO_ROOM_COMMAND, {
    capability: "PUBLIC_ROOM_COMMAND",
    roomCapabilityProfile: "RECRUIT",
  });
  assert.deepEqual(FEATURES_KAKAO_ROOM_COMMAND, {
    capability: "PUBLIC_ROOM_COMMAND",
    roomCapabilityProfile: "FEATURES",
  });
});
