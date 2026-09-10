import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { KakaoV4CommandError, KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";
import { kakaoV4CommandFailureResponse } from "../src/modules/recruiting/kakao-v4/http";

type Contract = Readonly<{
  routes: readonly Readonly<{ domain: string; action: string; aliases: readonly string[] }>[];
  exactReplies: Readonly<{ generalHelp: string; recruitHelp: string; recruitWebHelp: string }>;
}>;

const fixture = JSON.parse(await readFile(resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json"), "utf8")) as Contract;
const parityFixture = JSON.parse(await readFile(resolve(import.meta.dirname, "../integrations/messengerbot-r/command-parity-contract.json"), "utf8")) as Readonly<{
  commands: readonly Readonly<{ domain: string; name: string; sample: string }>[];
}>;
const localCommands = new Set([
  "LOCAL_BOT_VERSION", "LOCAL_USER_HELP", "LOCAL_RECRUIT_HELP", "LOCAL_RECRUIT_WEB_HELP",
  "LOCAL_V4_STATUS", "LOCAL_V4_CONTRACT", "OPERATIONS_PHOTO_STATUS",
  "OPERATIONS_INHOUSE_PREVIEW_CANCEL", "OPERATIONS_INHOUSE_CONFIRM",
]);

function routeProfile(route: Contract["routes"][number]): KakaoV4ProfileId {
  if (route.domain === "PARTY" || route.domain === "SCRIM") return "RECRUIT";
  if (route.domain === "HELP" && route.action !== "GENERAL_HELP") return "RECRUIT";
  return "FEATURES";
}

function envelope(profileId: KakaoV4ProfileId, text: string, serial: number): KakaoV4CommandEnvelope {
  return {
    profileId,
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: `event-boot-abcdef0123456789-${serial}`,
    timestamp: 1_789_000_000,
    nonce: serial.toString(16).padStart(32, "0"),
    text,
  };
}

const authorizer = {
  async authorizeProfile(input: { requiredCapabilityProfile: KakaoV4ProfileId }) {
    return { roomId: "00000000-0000-4000-8000-000000000001", roomStatus: "ACTIVE" as const, capabilityProfile: input.requiredCapabilityProfile, installationId: "00000000-0000-4000-8000-000000000002" };
  },
};

test("[P4-S01] every public fixture alias has a local reply or canonical dispatcher route", () => {
  for (const route of fixture.routes) {
    const profileId = routeProfile(route);
    for (const text of route.aliases) {
      const classification = classifyKakaoV4Command({ profileId, text });
      assert.notEqual(classification.kind, "UNKNOWN", text);
      assert.notEqual(classification.kind, "WRONG_PROFILE", text);
      if (classification.kind === "UNKNOWN" || classification.kind === "WRONG_PROFILE") continue;
      assert.equal(classification.audience, "USER", text);
      assert.ok(localCommands.has(classification.command) || canonicalizeKakaoV4Command(classification, envelope(profileId, text, 1)), text);
    }
  }
});

test("[P4-S02] server fallback gives exact local help, photo guidance, and no-mutation preview notices", async () => {
  const service = new KakaoV4CommandService(authorizer);
  const cases = [
    ["FEATURES", "도움말", fixture.exactReplies.generalHelp],
    ["RECRUIT", "구인도움말", fixture.exactReplies.recruitHelp],
    ["RECRUIT", "구인도우미", fixture.exactReplies.recruitWebHelp],
  ] as const;
  let serial = 1;
  for (const [profileId, text, expected] of cases) {
    const result = await service.execute(envelope(profileId, text, serial++), "current");
    assert.equal(result.reply, expected);
  }
  const photo = await service.execute(envelope("FEATURES", "사진상태", serial++), "current");
  assert.match(photo.reply, /사이트에 로그인해 사진을 제출/u);
  const cancel = await service.execute(envelope("FEATURES", "내전미리보기취소", serial++), "current");
  const confirm = await service.execute(envelope("FEATURES", "내전확인 ABCDEF", serial++), "current");
  assert.equal(cancel.reply, confirm.reply);
  assert.match(confirm.reply, /변경된 내용은 없습니다/u);
});

test("[P4-S01A] every actual V41 public sample has a local reply or canonical dispatcher route", () => {
  const internalNames = new Set(["V2도움말", "V2진단", "V2연동확인", "연동확인", "V2사진취소", "V2모집", "V2시즌", "V2양식", "V2사진세션"]);
  for (const sample of parityFixture.commands) {
    if (internalNames.has(sample.name)) continue;
    const profileId: KakaoV4ProfileId = sample.domain === "PARTY" || sample.domain === "SCRIM" ? "RECRUIT" : "FEATURES";
    const classification = classifyKakaoV4Command({ profileId, text: sample.sample });
    assert.notEqual(classification.kind, "UNKNOWN", sample.name);
    assert.notEqual(classification.kind, "WRONG_PROFILE", sample.name);
    if (classification.kind === "UNKNOWN" || classification.kind === "WRONG_PROFILE") continue;
    assert.equal(classification.audience, "USER", sample.name);
    assert.ok(localCommands.has(classification.command) || canonicalizeKakaoV4Command(classification, envelope(profileId, sample.sample, 2)), sample.name);
  }
});

test("[P4-S03] unknown and internal direct API inputs normalize to explicit HTTP 400", async () => {
  const service = new KakaoV4CommandService(authorizer);
  let serial = 20;
  for (const text of ["모르는명령", "//도움말", "V2도움말", "V2진단", "V2연동확인", "V2사진취소", 'V2모집 {"type":"GET_PARTY_STATUS"}']) {
    let caught: unknown;
    try {
      await service.execute(envelope("RECRUIT", text, serial++), "current");
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof KakaoV4CommandError, text);
    assert.equal(caught.code, "INVALID_FORM", text);
    const response = kakaoV4CommandFailureResponse(caught);
    assert.equal(response.status, 400, text);
    assert.equal((await response.json()).code, "INVALID_FORM", text);
  }
});

test("[P4-S04] V4 command HTTP surface contains no 501 or router-not-enabled response", async () => {
  const sources = await Promise.all([
    readFile(resolve(import.meta.dirname, "../src/modules/recruiting/kakao-v4/application.ts"), "utf8"),
    readFile(resolve(import.meta.dirname, "../src/modules/recruiting/kakao-v4/http.ts"), "utf8"),
    readFile(resolve(import.meta.dirname, "../src/app/api/integrations/kakao/v4/commands/route.ts"), "utf8"),
  ]);
  assert.doesNotMatch(sources.join("\n"), /NOT_IMPLEMENTED|ROUTER_NOT_ENABLED|status:\s*501/u);
});
