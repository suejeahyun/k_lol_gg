import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createHmac } from "node:crypto";
import vm from "node:vm";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");

test("room identity is derived only from the callback room string and the private identity secret", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  const identityBody = transport.match(/function identityForChat\(room, sender\) \{([\s\S]*?)\n  \}/u)?.[1] ?? "";
  assert.match(identityBody, /var secret = identitySecret\(\)/u);
  assert.match(identityBody, /"room-id\\n" \+ normalizedRoom/u);
  assert.doesNotMatch(identityBody.match(/roomId:[^\n]+/u)?.[0] ?? "", /sender/u);
  assert.match(identityBody, /"sender-id\\n" \+ trimText\(sender\)/u);
});

test("one shared identity module derives and signs the public bot installation fingerprint", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  assert.match(transport, /function installationId\(\)/u);
  assert.match(transport, /"installation-id\\nKLOL_V41"/u);
  assert.match(transport, /KLOL_KAKAO_WEBHOOK_V3/u);
  assert.match(transport, /header\("x-klol-installation", installId\)/u);
  assert.match(transport, /header\("x-klol-key-id", keyId\)/u);
  assert.match(transport, /signatureMaterial\(timestampSeconds, nonce, installId, keyId, deliveryId, version, roomId, senderId, bodyDigestHex\)/u);
});

test("current callback accepts stable channel and user identity arguments", async () => {
  const router = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js"), "utf8");
  assert.match(router, /function response\(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash\)/u);
  assert.match(router, /KLOL_V2_KAKAO\.contextFromChat\(room, sender/u);
});

test("both field diagnostics expose the installation fingerprint", async () => {
  const router = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js"), "utf8");
  assert.match(router, /text === "봇버전"/u);
  assert.match(router, /\[K-LOL\.GG V2 연동 ID\]/u);
  assert.equal((router.match(/KLOL_V2_KAKAO\.installationId\(\)/gu) ?? []).length, 2);
  assert.equal((router.match(/KLOL_V2_KAKAO\.signingKeyId\(\)/gu) ?? []).length, 2);
  assert.match(router, /방 식별 기준:/u);
  assert.match(router, /KLOL_V2_KAKAO\.roomIdentityInput\(room, sender, isGroupChat, channelId\)/u);
});

test("room normalization canonicalizes Unicode and removes unstable invisible characters", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  assert.match(transport, /function trimText\(value\) \{\s*return String\(value == null \? "" : value\)\.replace\(\/\^\\s\+\|\\s\+\$\/g, ""\);\s*\}/u);
  assert.match(transport, /java\.text\.Normalizer\.Form\.NFKC/u);
  assert.match(transport, /\\u200B\\u200C\\u200D\\uFEFF/u);
});

function loadIdentityRuntime(source, identitySecret) {
  class JavaString { constructor(value) { this.value = String(value); } getBytes() { return Buffer.from(this.value, "utf8"); } toString() { return this.value; } }
  class StringBuilder { constructor() { this.value = ""; } append(value) { this.value += String(value); return this; } toString() { return this.value; } }
  class SecretKeySpec { constructor(bytes) { this.bytes = Buffer.from(bytes); } }
  const context = vm.createContext({
    Buffer,
    DataBase: { getDataBase: (key) => key === "KLOL_V2_KAKAO_IDENTITY_SECRET" ? identitySecret : "https://example.test" },
    java: { lang: { String: JavaString, StringBuilder, Integer: { toHexString: (value) => Number(value).toString(16) } }, nio: { charset: { StandardCharsets: { UTF_8: "UTF_8" } } }, text: { Normalizer: { normalize: (value) => String(value).normalize("NFKC"), Form: { NFKC: "NFKC" } } } },
    javax: { crypto: { Mac: { getInstance: () => { let key = Buffer.alloc(0); return { init: (spec) => { key = spec.bytes; }, doFinal: (bytes) => createHmac("sha256", key).update(Buffer.from(bytes)).digest() }; } }, spec: { SecretKeySpec } } },
  });
  vm.runInContext(source, context);
  return context.KLOL_V2_KAKAO;
}

test("one installation and room yields one room fingerprint for 100 unique senders", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  const runtime = loadIdentityRuntime(transport, "identity-secret-a-0123456789abcdef");
  const identities = Array.from({ length: 100 }, (_, index) => runtime.identityForChat(runtime.roomIdentityInput(`사용자-${index}`, `사용자-${index}`, false, "987654321"), `사용자-${index}`));
  assert.equal(new Set(identities.map((item) => item.roomId)).size, 1);
  assert.equal(new Set(identities.map((item) => item.senderId)).size, 100);
  assert.equal(runtime.identityForChat("Ｋ－ＬＯＬ 공식방", "별도 사용자").roomId, runtime.identityForChat("K-LOL 공식방", "별도 사용자").roomId);
  assert.equal(runtime.identityForChat("\u200B K-LOL 공식방 \u200B", "또 다른 사용자").roomId, runtime.identityForChat("K-LOL 공식방", "또 다른 사용자").roomId);
  assert.equal(runtime.roomIdentityInput("관리자. 99", "관리자. 99", false, null), "");
  assert.equal(runtime.roomIdentityInput("K-LOL 공식방", "관리자. 99", true, null), "K-LOL 공식방");
});

test("different identity secrets remain different installations until administrator pairing", async () => {
  const transport = await readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js"), "utf8");
  const first = loadIdentityRuntime(transport, "identity-secret-a-0123456789abcdef"); const second = loadIdentityRuntime(transport, "identity-secret-b-0123456789abcdef");
  assert.notEqual(first.installationId(), second.installationId());
  assert.notEqual(first.identityForChat("K-LOL 공식방", "사용자").roomId, second.identityForChat("K-LOL 공식방", "사용자").roomId);
});
