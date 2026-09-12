import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");

function loadRuntime(source, identitySecret, signingSecret = "signing-secret-0123456789abcdef0123456789") {
  class JavaString { constructor(value) { this.value = String(value); } getBytes() { return Buffer.from(this.value, "utf8"); } toString() { return this.value; } }
  class StringBuilder { constructor() { this.value = ""; } append(value) { this.value += String(value); return this; } toString() { return this.value; } }
  class SecretKeySpec { constructor(bytes) { this.bytes = Buffer.from(bytes); } }
  const values = { KLOL_V2_KAKAO_IDENTITY_SECRET: identitySecret, KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT: signingSecret, KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT: "current", KLOL_V2_BASE_URL: "https://example.test" };
  const context = vm.createContext({
    Buffer,
    KLOL_V41_BOT_CODE_VERSION: "KLOL_KAKAO_BOT_V41_V3_2026_09_12_R15_OP_DAY_STATUS",
    KLOL_V41_CURRENT_DELIVERY_ID: "",
    KLOL_V41_CURRENT_USER_HASH: "",
    DataBase: { getDataBase: (key) => values[key] ?? "" },
    java: { lang: { String: JavaString, StringBuilder, Integer: { toHexString: (value) => Number(value).toString(16) } }, nio: { charset: { StandardCharsets: { UTF_8: "UTF_8" } } }, security: { MessageDigest: { getInstance: () => ({ digest: (bytes) => createHash("sha256").update(Buffer.from(bytes)).digest() }) } }, util: { UUID: { randomUUID: () => ({ toString: () => "12345678-1234-4234-8234-123456789abc" }) } } },
    javax: { crypto: { Mac: { getInstance: () => { let key = Buffer.alloc(0); return { init: (spec) => { key = spec.bytes; }, doFinal: (bytes) => createHmac("sha256", key).update(Buffer.from(bytes)).digest() }; } }, spec: { SecretKeySpec } } },
  });
  vm.runInContext(source, context);
  return { runtime: context.KLOL_V2_KAKAO, context };
}

test("room and channel callback fields are not used for installation scope", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  assert.doesNotMatch(transport, /canonicalRoomName|roomIdentityInput|java\.text\.Normalizer/u);
  assert.match(transport, /function installationScopeId\(\)/u);
  assert.match(transport, /klol-v2:kakao-installation-room-scope:v1\\u0000/u);
  const { runtime } = loadRuntime(transport, "identity-secret-a-0123456789abcdef");
  const expectedScope = `room-${createHash("sha256").update(`klol-v2:kakao-installation-room-scope:v1\0${runtime.installationId()}`).digest("hex").slice(0, 32)}`;
  const scopes = [
    runtime.identityForChat("첫 방", "사용자").roomId,
    runtime.identityForChat("완전히 다른 방", "사용자").roomId,
    runtime.identityForChat("사용자", "사용자").roomId,
  ];
  assert.equal(new Set(scopes).size, 1);
  assert.equal(scopes[0], expectedScope);
});

test("installation scope is stable across signing-key rotation and differs across installations", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  const first = loadRuntime(transport, "identity-secret-a-0123456789abcdef", "signing-secret-a-0123456789abcdef012345").runtime;
  const rotated = loadRuntime(transport, "identity-secret-a-0123456789abcdef", "signing-secret-b-0123456789abcdef012345").runtime;
  const other = loadRuntime(transport, "identity-secret-b-0123456789abcdef", "signing-secret-a-0123456789abcdef012345").runtime;
  assert.equal(first.installationScopeId(), rotated.installationScopeId());
  assert.notEqual(first.installationScopeId(), other.installationScopeId());
});

test("delivery identity ignores raw room and channel while binding installation, sender, log, and message", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  const first = loadRuntime(transport, "identity-secret-a-0123456789abcdef").runtime;
  const other = loadRuntime(transport, "identity-secret-b-0123456789abcdef").runtime;
  assert.equal(first.messageDeliveryId("방A", "표시명", "5인파티", "log-1", "channel-1", "user-1"), first.messageDeliveryId("방B", "표시명", "5인파티", "log-1", "channel-2", "user-1"));
  assert.notEqual(first.messageDeliveryId("방A", "표시명", "5인파티", "log-1", "channel-1", "user-1"), first.messageDeliveryId("방A", "표시명", "5인파티", "log-2", "channel-1", "user-1"));
  assert.notEqual(first.messageDeliveryId("방A", "표시명", "5인파티", "log-1", "channel-1", "user-1"), other.messageDeliveryId("방A", "표시명", "5인파티", "log-1", "channel-1", "user-1"));
});

test("opaque sender uses userHash when available and display-name fallback is labeled", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  const loaded = loadRuntime(transport, "identity-secret-a-0123456789abcdef");
  assert.match(loaded.runtime.identityForChat("ignored", "같은 표시명").senderId, /^sender-display-[a-f0-9]{32}$/u);
  loaded.context.KLOL_V41_CURRENT_USER_HASH = "stable-user-hash";
  assert.match(loaded.runtime.identityForChat("ignored", "같은 표시명").senderId, /^sender-user-[a-f0-9]{32}$/u);
});

test("field diagnostics explicitly use installation scope and retain opaque sender", async () => {
  const router = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js"), "utf8");
  assert.match(router, /연동 기준: 설치본/u);
  assert.match(router, /봇 설치본은 카카오톡 방 하나에서만 사용/u);
  assert.match(router, /발신자:/u);
  assert.doesNotMatch(router, /V2 방 식별 불가|방 식별 기준:|roomIdentityInput/u);
});
