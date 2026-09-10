import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import type { KakaoV4CommandDispatcher } from "../src/modules/recruiting/kakao-v4/dispatcher";
import {
  kakaoV4SignatureMaterial,
  verifyKakaoV4Signature,
  type KakaoV4CommandEnvelope,
  type KakaoV4ProfileId,
} from "../src/modules/recruiting/kakao-v4/domain";
import {
  getRuntimeKakaoV4ProfileAuthorizer,
  kakaoV4InstallationId,
  kakaoV4InstallationScopeId,
  KakaoV4InstallationScopeAuthorizer,
  KakaoV4InstallationScopeError,
} from "../src/modules/recruiting/kakao-v4/installation-scope";

const secret = new TextEncoder().encode("phase5-installation-identity-secret-1234567890");

function envelope(profileId: KakaoV4ProfileId, sender: string, event: number, text: string): KakaoV4CommandEnvelope {
  return Object.freeze({
    profileId,
    installationId: kakaoV4InstallationId(profileId, secret),
    senderId: `sender-user-${sender.repeat(32).slice(0, 32)}`,
    eventId: `event-phase5-${String(event).padStart(8, "0")}`,
    timestamp: 1_789_000_000,
    nonce: String(event).padStart(32, "0"),
    text,
  });
}

test("V4 installation identity exactly mirrors the phone HMAC contract", () => {
  for (const profileId of ["RECRUIT", "FEATURES"] as const) {
    const expected = `install-${createHmac("sha256", secret)
      .update(`installation-id\nKLOL_V4\n${profileId}`)
      .digest("hex")
      .slice(0, 32)}`;
    assert.equal(kakaoV4InstallationId(profileId, secret), expected);
  }
});

test("one phone may share one identity secret while RECRUIT and FEATURES keep distinct stable installation scopes", async () => {
  const authorizer = new KakaoV4InstallationScopeAuthorizer(secret);
  const recruitId = kakaoV4InstallationId("RECRUIT", secret);
  const featuresId = kakaoV4InstallationId("FEATURES", secret);
  assert.equal(kakaoV4InstallationId("RECRUIT", secret), recruitId);
  assert.equal(kakaoV4InstallationId("FEATURES", secret), featuresId);
  const recruit = await authorizer.authorizeProfile({ installationPublicId: recruitId, requiredCapabilityProfile: "RECRUIT" });
  const features = await authorizer.authorizeProfile({ installationPublicId: featuresId, requiredCapabilityProfile: "FEATURES" });
  assert.notEqual(recruit.installationId, features.installationId);
  assert.notEqual(recruit.roomId, features.roomId);
  assert.equal(recruit.roomId, kakaoV4InstallationScopeId(recruitId));
  assert.equal(features.roomId, kakaoV4InstallationScopeId(featuresId));
});

test("the server rejects cross-profile commands before dispatch for both phone profiles", async () => {
  let dispatches = 0;
  const dispatcher = {
    async dispatch() {
      dispatches += 1;
      return Object.freeze({ kind: "PARTY", action: "CREATE", aggregate: null, legacyReply: "unexpected", replayed: false });
    },
  } as unknown as KakaoV4CommandDispatcher;
  const service = new KakaoV4CommandService(new KakaoV4InstallationScopeAuthorizer(secret), dispatcher);
  await assert.rejects(
    service.execute(envelope("RECRUIT", "a", 20, "랭킹"), "current"),
    (error) => error instanceof Error && "code" in error && error.code === "WRONG_PROFILE",
  );
  await assert.rejects(
    service.execute(envelope("FEATURES", "b", 21, "5인파티"), "current"),
    (error) => error instanceof Error && "code" in error && error.code === "WRONG_PROFILE",
  );
  assert.equal(dispatches, 0);
});

test("arbitrary installation IDs and cross-profile IDs fail closed", async () => {
  const authorizer = new KakaoV4InstallationScopeAuthorizer(secret);
  await assert.rejects(
    authorizer.authorizeProfile({ installationPublicId: `install-${"f".repeat(32)}`, requiredCapabilityProfile: "RECRUIT" }),
    (error) => error instanceof KakaoV4InstallationScopeError && error.code === "INSTALLATION_INVALID",
  );
  await assert.rejects(
    authorizer.authorizeProfile({ installationPublicId: kakaoV4InstallationId("FEATURES", secret), requiredCapabilityProfile: "RECRUIT" }),
    (error) => error instanceof KakaoV4InstallationScopeError && error.code === "INSTALLATION_INVALID",
  );
});

test("current and previous signing keys authenticate only their exact HMAC", () => {
  const recruit = envelope("RECRUIT", "a", 10, "V4상태");
  const rawBody = Buffer.from(JSON.stringify(recruit));
  const digest = createHash("sha256").update(rawBody).digest("hex");
  const keys = [
    { keyId: "current", secret: new TextEncoder().encode("phase5-current-signing-secret-123456") },
    { keyId: "previous", secret: new TextEncoder().encode("phase5-previous-signing-secret-12345") },
  ] as const;
  for (const key of keys) {
    const signature = `v4=${createHmac("sha256", key.secret)
      .update(kakaoV4SignatureMaterial(key.keyId, digest))
      .digest("hex")}`;
    assert.deepEqual(
      verifyKakaoV4Signature({ envelope: recruit, rawBody, keyId: key.keyId, signature, secrets: keys, now: new Date(recruit.timestamp * 1_000) }),
      { ok: true, requestDigestHex: digest },
    );
    assert.deepEqual(
      verifyKakaoV4Signature({
        envelope: recruit,
        rawBody,
        keyId: key.keyId,
        signature: `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`,
        secrets: keys,
        now: new Date(recruit.timestamp * 1_000),
      }),
      { ok: false, code: "SIGNATURE_INVALID" },
    );
  }
});

test("two senders share one installation scope for create, cross-edit and finish", async () => {
  const calls: Array<Readonly<{ senderId: string; roomId: string; action: string }>> = [];
  const dispatcher = {
    async dispatch(context: { envelope: KakaoV4CommandEnvelope; authorization: { roomId: string } }, command: { action: string }) {
      calls.push(Object.freeze({ senderId: context.envelope.senderId, roomId: context.authorization.roomId, action: command.action }));
      return Object.freeze({ kind: "PARTY", action: command.action, aggregate: null, legacyReply: "ok", replayed: false });
    },
  } as unknown as KakaoV4CommandDispatcher;
  const service = new KakaoV4CommandService(new KakaoV4InstallationScopeAuthorizer(secret), dispatcher);
  await service.execute(envelope("RECRUIT", "a", 1, "5인파티 5"), "current");
  await service.execute(envelope("RECRUIT", "b", 2, "📢 5인 파티 구인\n모집번호: #5\n1. 재현\n2. 기용"), "current");
  await service.execute(envelope("RECRUIT", "b", 3, "5ㅉ"), "current");
  assert.deepEqual(calls.map((call) => call.action), ["CREATE", "SYNC", "FINISH"]);
  assert.equal(new Set(calls.map((call) => call.roomId)).size, 1);
  assert.equal(new Set(calls.map((call) => call.senderId)).size, 2);
});

test("runtime identity configuration is bounded without inspecting real environment values", () => {
  assert.equal(getRuntimeKakaoV4ProfileAuthorizer({}), null);
  assert.equal(getRuntimeKakaoV4ProfileAuthorizer({ KLOL_V2_KAKAO_IDENTITY_SECRET: "short" }), null);
  assert.ok(getRuntimeKakaoV4ProfileAuthorizer({ KLOL_V2_KAKAO_IDENTITY_SECRET: "x".repeat(32) }));
});

test("V4 route is registry-free and keeps the seven-field identity-free boundary", () => {
  const route = readFileSync(resolve(import.meta.dirname, "../src/app/api/integrations/kakao/v4/commands/route.ts"), "utf8");
  const domain = readFileSync(resolve(import.meta.dirname, "../src/modules/recruiting/kakao-v4/domain.ts"), "utf8");
  const shared = readFileSync(resolve(import.meta.dirname, "../integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_SHARED.js"), "utf8");
  assert.doesNotMatch(route, /KakaoRoomRegistry|getRuntimeKakaoRoomRegistry|authorizeProfile\(/u);
  assert.match(route, /getRuntimeKakaoV4ProfileAuthorizer/u);
  assert.match(route, /KakaoV4InstallationScopeError[\s\S]+?SIGNATURE_INVALID/u);
  assert.match(domain, /\["profileId", "installationId", "senderId", "eventId", "timestamp", "nonce", "text"\]/u);
  assert.doesNotMatch(domain, /roomName|channelId/u);
  assert.doesNotMatch(shared, /body\s*=\s*JSON\.stringify\(\{[\s\S]*?(?:room|channel|isGroupChat)\s*:/u);
});

test("V4 phone callbacks ignore room and channel values", () => {
  const replies: string[] = [];
  for (const file of ["KLOL_KAKAO_BOT_V4_RECRUIT.js", "KLOL_KAKAO_BOT_V4_FEATURES.js"] as const) {
    const source = readFileSync(resolve(import.meta.dirname, `../integrations/messengerbot-r/v4/${file}`), "utf8");
    const sends: unknown[][] = [];
    const context = {
      KLOL_V4: {
        shouldIgnore: () => false,
        localReply: () => null,
        send: (...args: unknown[]) => {
          sends.push(args);
          return { ok: true, body: { reply: "ok" } };
        },
        resultReply: () => "ok",
      },
    } as Record<string, unknown>;
    runInNewContext(source, context);
    const callback = context.response as (...args: unknown[]) => void;
    callback("first-room", "테스트명령", "같은사용자", true, { reply: (value: string) => replies.push(value) }, null, "pkg", false, "same-log", "first-channel", "same-hash");
    callback("other-room", "테스트명령", "같은사용자", false, { reply: (value: string) => replies.push(value) }, null, "pkg", false, "same-log", "other-channel", "same-hash");
    assert.equal(sends.length, 2);
    assert.deepEqual(sends[0], sends[1]);
  }
  assert.deepEqual(replies, ["ok", "ok", "ok", "ok"]);
});
