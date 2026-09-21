import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { parseSiteNoticeRequest, siteNoticeConfig, siteNoticeExpiry, siteNoticeSignatureMaterial, verifySiteNoticeRequest } from "../src/modules/seasons/kakao-site-notices/domain";
import { parseAdminKakaoPendingQuery } from "../src/modules/seasons/infrastructure/admin-kakao-pending-query";
import { handleSiteNoticeRequest } from "../src/modules/seasons/kakao-site-notices/http";
import { SiteNoticeLeaseError, SiteNoticeReplayError } from "../src/modules/seasons/kakao-site-notices/repository";
import { KakaoV4InstallationScopeAuthorizer } from "../src/modules/recruiting/kakao-v4/installation-scope";
import { KAKAO_V4_PROFILE_COMMAND_MATRIX } from "../src/modules/recruiting/kakao-v4/classifier";

const config = siteNoticeConfig({ KAKAO_SITE_NOTICE_ENABLED: "true", KAKAO_SITE_NOTICE_TARGET_HASH: "a".repeat(64), KAKAO_V4_IDENTITY_SECRET: "synthetic-identity-for-notice-tests-0001" })!;
const secret = Buffer.from("synthetic-signing-for-notice-tests-0002");
const now = new Date("2026-09-22T01:00:00Z");
const request = { action: "POLL" as const, installationId: config.installationId, targetHash: "a".repeat(64), timestamp: now.getTime() / 1000, nonce: "b".repeat(32) };

test("site notices are OFF by default and require an explicit target and identity", () => {
  assert.equal(siteNoticeConfig({}), null);
  assert.equal(siteNoticeConfig({ KAKAO_SITE_NOTICE_ENABLED: "true" }), null);
  assert.equal(siteNoticeConfig({ KAKAO_SITE_NOTICE_ENABLED: "false", KAKAO_SITE_NOTICE_TARGET_HASH: "a".repeat(64), KAKAO_V4_IDENTITY_SECRET: "x".repeat(32) }), null);
});

test("notice source scope matches the real FEATURES inhouse router and rejects PARTY scope", async () => {
  assert.ok(KAKAO_V4_PROFILE_COMMAND_MATRIX.FEATURES.includes("INHOUSE_CREATE"));
  assert.ok(KAKAO_V4_PROFILE_COMMAND_MATRIX.FEATURES.includes("INHOUSE_SNAPSHOT"));
  assert.equal(KAKAO_V4_PROFILE_COMMAND_MATRIX.RECRUIT.includes("INHOUSE_SNAPSHOT"), false);
  const authorizer = new KakaoV4InstallationScopeAuthorizer(Buffer.from("synthetic-identity-for-notice-tests-0001"));
  const auth = await authorizer.authorizeProfile({ installationPublicId: config.installationId, requiredCapabilityProfile: "FEATURES" });
  assert.deepEqual(config.sourceRoomIdHash, createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${auth.roomId}`).digest());
  await assert.rejects(authorizer.authorizeProfile({ installationPublicId: config.installationId, requiredCapabilityProfile: "RECRUIT" }));
});

test("notice signatures bind action, exact target and installation with a separate protocol", () => {
  const rawBody = Buffer.from(JSON.stringify(request));
  const signature = "notice-v1=" + createHmac("sha256", secret).update(siteNoticeSignatureMaterial("test", rawBody)).digest("hex");
  const input = { request, config, rawBody, signature, keyId: "test", secrets: [{ keyId: "test", secret }], now };
  assert.equal(verifySiteNoticeRequest(input), true);
  assert.equal(verifySiteNoticeRequest({ ...input, request: { ...request, targetHash: "c".repeat(64) } }), false);
  assert.equal(verifySiteNoticeRequest({ ...input, request: { ...request, installationId: "install-" + "c".repeat(32) } }), false);
  assert.equal(verifySiteNoticeRequest({ ...input, rawBody: Buffer.from(JSON.stringify({ ...request, action: "REGISTER" })) }), false);
  assert.equal(verifySiteNoticeRequest({ ...input, signature: signature.replace("notice-v1=", "v4=") }), false);
  assert.equal(verifySiteNoticeRequest({ ...input, now: new Date(now.getTime() + 301_000) }), false);
  assert.equal(verifySiteNoticeRequest({ ...input, secrets: null }), false);
});

test("bounded envelope rejects arbitrary payload, room names and malformed ACK", () => {
  assert.deepEqual(parseSiteNoticeRequest(request), request);
  for (const bad of [null, [], { ...request, room: "private" }, { ...request, action: "SEND" }, { ...request, action: "ACK" },
    { ...request, timestamp: 1.5 }, { ...request, nonce: "short" }]) assert.equal(parseSiteNoticeRequest(bad), null);
  const ack = { ...request, action: "ACK", eventId: "00000000-0000-4000-8000-000000000001", leaseToken: "e".repeat(64), outcome: "SENT" };
  assert.deepEqual(parseSiteNoticeRequest(ack), ack);
  assert.equal(parseSiteNoticeRequest({ ...ack, outcome: "anything" }), null);
});

test("site notices expire by recruiting-day rollover and unverified filter is distinct", () => {
  assert.equal(siteNoticeExpiry("2026-09-22", now).toISOString(), "2026-09-22T21:00:00.000Z");
  assert.equal(siteNoticeExpiry("2026-09-25", now).getTime(), now.getTime() + 86_400_000);
  assert.equal(parseAdminKakaoPendingQuery("https://local.test?matchState=UNVERIFIED").matchState, "UNVERIFIED");
});

test("HTTP boundary authenticates before DB access, rejects replay and never caches", async () => {
  const environment = { KAKAO_SITE_NOTICE_ENABLED: "true", KAKAO_SITE_NOTICE_TARGET_HASH: "a".repeat(64),
    KAKAO_V4_IDENTITY_SECRET: "synthetic-identity-for-notice-tests-0001", KAKAO_V4_WEBHOOK_SECRET_CURRENT: secret.toString(), KAKAO_V4_WEBHOOK_KEY_ID_CURRENT: "test" };
  const httpRequest = (payload: unknown = request, overrides: Record<string, string> = {}, suffix = "") => {
    const rawBody = JSON.stringify(payload);
    return new Request(`https://local.test/api/integrations/kakao/site-notices${suffix}`, { method: "POST", body: rawBody,
      headers: { "content-type": "application/json", "x-klol-key-id": "test", "x-klol-signature": "notice-v1=" + createHmac("sha256", secret)
        .update(siteNoticeSignatureMaterial("test", Buffer.from(rawBody))).digest("hex"), ...overrides } });
  };
  let calls = 0;
  const execute = async () => { calls += 1; return { event: null }; };
  const success = await handleSiteNoticeRequest(httpRequest(), execute, environment, now);
  assert.equal(success.status, 200); assert.match(success.headers.get("cache-control")!, /no-store/);
  assert.equal((await success.json()).contract, "KLOL_KAKAO_SITE_NOTICE_V1"); assert.equal(calls, 1);
  for (const [incoming, status] of [
    [httpRequest(request, { "x-klol-signature": "invalid" }), 401],
    [httpRequest({ ...request, targetHash: "b".repeat(64) }), 401],
    [httpRequest({ ...request, timestamp: request.timestamp - 301 }), 401],
    [httpRequest(request, { "content-type": "application/json-malformed" }), 400],
    [httpRequest({ ...request, roomName: "should-not-pass" }), 400],
    [httpRequest(request, {}, "?room=unknown"), 400],
    [httpRequest({ ...request, roomName: "x".repeat(4100) }), 400],
  ] as const) assert.equal((await handleSiteNoticeRequest(incoming, execute, environment, now)).status, status);
  assert.equal(calls, 1, "unauthenticated requests cannot reach persistence");
  assert.equal((await handleSiteNoticeRequest(httpRequest(), execute, {}, now)).status, 503);
  for (const error of [new SiteNoticeReplayError(), new SiteNoticeLeaseError()]) {
    const response = await handleSiteNoticeRequest(httpRequest(), async () => { throw error; }, environment, now);
    assert.equal(response.status, 409);
  }
});
