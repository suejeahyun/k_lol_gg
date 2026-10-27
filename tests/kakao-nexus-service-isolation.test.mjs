import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { klolNexusRoomGuard, nexusCompanionSource, nexusMessengerbotSource, nexusPrivatePreamble, nexusPrivateSettings } from "../scripts/build-messengerbot-service.mjs";
import { analyzeRhinoStatic } from "../scripts/lib/messengerbot-rhino-static.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, "integrations/messengerbot-r", path), "utf8");
const klol = read("v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js");
const nexus = read("nexus/NEXUS_KAKAO_BOT_MESSENGERBOT_R.js");
const companion = read("nexus/NEXUS_SITE_NOTICE_COMPANION.js");
const klolCompanion = read("site-notices/KLOL_SITE_NOTICE_COMPANION.js");
const syntheticNexus = {
  NEXUS_V2_BASE_URL: "https://nexus.example.test",
  NEXUS_V4_KAKAO_IDENTITY_SECRET: "synthetic-nexus-identity-".repeat(2),
  NEXUS_V4_KAKAO_WEBHOOK_SECRET_CURRENT: "synthetic-nexus-signing-".repeat(2),
  NEXUS_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT: "nexus-current",
};
const klolSettings = {
  KLOL_V2_BASE_URL: "https://k-lol-gg.vercel.app",
  KLOL_V4_KAKAO_IDENTITY_SECRET: "synthetic-klol-identity-".repeat(2),
  KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT: "synthetic-klol-signing-".repeat(2),
  KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT: "klol-current",
};

function runtime(source, data = new Map()) {
  const calls = [], reads = [], writes = [], timers = [];
  function JavaString(value) { this.value = String(value); }
  JavaString.prototype.getBytes = function () { return Buffer.from(this.value, "utf8"); };
  function StringBuilder() { this.value = ""; }
  StringBuilder.prototype.append = function (value) { this.value += value; return this; };
  StringBuilder.prototype.toString = function () { return this.value; };
  const context = vm.createContext({
    DataBase: {
      getDataBase(key) { reads.push(key); return data.get(key) ?? ""; },
      setDataBase(key, value) { writes.push(key); data.set(key, String(value)); },
    },
    java: {
      lang: { String: JavaString, StringBuilder, Integer: { toHexString: (n) => n.toString(16) } },
      nio: { charset: { StandardCharsets: { UTF_8: "UTF-8" } } },
      security: { MessageDigest: { getInstance: () => ({ digest: (bytes) => createHash("sha256").update(bytes).digest() }) } },
      util: {
        UUID: { randomUUID: () => ({ toString: () => "00000000-0000-4000-8000-000000000001" }) },
        concurrent: { locks: { ReentrantLock: function () { this.tryLock = () => true; this.unlock = () => {}; } } },
      },
    },
    javax: { crypto: {
      Mac: { getInstance: () => ({ init(key) { this.key = key.bytes; }, doFinal(bytes) { return createHmac("sha256", this.key).update(bytes).digest(); } }) },
      spec: { SecretKeySpec: function (bytes) { this.bytes = bytes; } },
    } },
    org: { jsoup: { Connection: { Method: { POST: "POST" } }, Jsoup: { connect(url) {
      const call = { url, headers: {}, body: null }; calls.push(call);
      const chain = {
        ignoreContentType: () => chain, ignoreHttpErrors: () => chain, method: () => chain, timeout: () => chain,
        header(key, value) { call.headers[key] = value; return chain; },
        requestBody(value) { call.body = JSON.parse(value); return chain; },
        execute: () => ({ statusCode: () => 200, header: () => "", body: () => JSON.stringify({ reply: "synthetic server response", contract: "KLOL_KAKAO_SITE_NOTICE_V1", registered: true }) }),
      };
      return chain;
    } } } },
    Log: { i() {} }, setInterval(fn) { timers.push(fn); return timers.length; }, clearInterval() {},
  });
  vm.runInContext(source, context, { timeout: 2000 });
  return { context, calls, reads, writes, data, timers };
}

function reply(bot, message, room = "NEXUS", packageName = "com.kakao.talk", sender = "합성참가자") {
  const replies = [];
  bot.context.response(room, message, sender, true, { reply: (text) => replies.push(String(text)) }, {}, packageName, false, "same-log", "unused-channel", "same-user");
  return replies;
}

test("R30 changes only the KLOL room guard and version while preserving NEXUS artifacts and phone limits", () => {
  execFileSync(process.execPath, ["scripts/build-messengerbot-v1-strict.mjs", "--service", "nexus"], { cwd: root });
  assert.equal(read("v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js"), klol);
  assert.equal(klol.split(klolNexusRoomGuard).length, 2, "exactly one early room guard");
  const previousKLOL = klol.replace(`${klolNexusRoomGuard}\n`, "")
    .replaceAll("KLOL_KAKAO_BOT_V40_R30_2026_10_27", "KLOL_KAKAO_BOT_V40_R29_2026_10_14");
  assert.equal(createHash("sha256").update(previousKLOL).digest("hex"), "ae3909a24b5fb33a93a81ac7f99a8a9067ee135fe850aec9e6173f11524bed6c");
  assert.equal(createHash("sha256").update(nexus).digest("hex"), "e18a5f7afb501a960fc5269cd3fbb46b131e670f4ba63babe08e2a7886ff7e9f");
  assert.equal(createHash("sha256").update(companion).digest("hex"), "bf3fdd3cecf928ffd202f0e7967b7d5e6f1b3ea46e11ba68b6a5e47414171766");
  assert.equal(read("nexus/NEXUS_KAKAO_BOT_MESSENGERBOT_R.js"), nexusMessengerbotSource(klol));
  assert.equal(companion, nexusCompanionSource(klolCompanion));
  const acorn = createRequire(import.meta.url)("next/dist/compiled/acorn");
  for (const value of [klol, klolCompanion, nexus, companion]) {
    assert.ok(value.replace(/\r?\n/gu, "\r\n").length < 65535);
    assert.ok(Object.values(analyzeRhinoStatic(acorn.parse(value, { ecmaVersion: 5 }))).every((items) => items.length === 0));
  }
});

test("KLOL R30 ignores NEXUS rooms before any reply, request or storage access and preserves warm settings", () => {
  const original = new Map(Object.entries({ ...klolSettings, ...syntheticNexus,
    KLOL_RECRUIT_LAST_HASH_UNIFIED_V24: "existing-klol-state", NEXUS_RECRUIT_LAST_HASH_UNIFIED_V24: "existing-nexus-state",
  }));
  const data = new Map(original);
  const bot = runtime(klol, data);
  assert.deepEqual(bot.writes, [], "public replacement must not overwrite an existing phone configuration");
  const initialReads = bot.reads.length;
  for (const room of ["NEXUS", "NEXUS 구인구직방", new String("NEXUS"), new String("NEXUS 구인구직방")]) {
    for (const message of ["구인현황", "봇버전", "등록도움말", "내전구인 협곡"]) assert.deepEqual(reply(bot, message, room), []);
  }
  assert.equal(bot.calls.length, 0);
  assert.equal(bot.reads.length, initialReads);
  assert.deepEqual(bot.writes, []);
  assert.deepEqual(data, original);
  for (const room of ["K롤방 구인구직방", "기존 소통방"]) {
    const active = runtime(klol, data);
    assert.deepEqual(reply(active, "구인현황", room), ["synthetic server response"]);
    assert.equal(active.calls[0].url, "https://k-lol-gg.vercel.app/api/integrations/kakao/v4/commands");
    assert.equal(active.calls[0].body.profileId, "RECRUIT");
    assert.deepEqual(active.writes, []);
    assert.deepEqual(data, original);
  }
  for (const room of ["NEXUS", "NEXUS 구인구직방"]) {
    const active = runtime(nexus, data);
    assert.deepEqual(reply(active, "구인현황", room), ["synthetic server response"]);
    assert.equal(active.calls[0].url, "https://nexus.example.test/api/integrations/kakao/v4/commands");
  }
});

test("main and companion callbacks reject the other service's rooms without requests, replies or writes", () => {
  const code = "a".repeat(32);
  const settings = { ...klolSettings, ...syntheticNexus,
    KLOL_SITE_NOTICE_ENABLED: "true", KLOL_SITE_NOTICE_TARGET_ID: "b".repeat(32), KLOL_SITE_NOTICE_REGISTRATION_CODE: code,
    NEXUS_SITE_NOTICE_ENABLED: "true", NEXUS_SITE_NOTICE_TARGET_ID: "c".repeat(32), NEXUS_SITE_NOTICE_REGISTRATION_CODE: code,
  };
  for (const [source, rooms, messages] of [
    [nexus, ["K롤방 구인구직방", "기존 소통방"], ["구인현황", "봇버전", "내전구인 협곡"]],
    [klolCompanion, ["NEXUS", "NEXUS 구인구직방"], ["사이트알림상태", "사이트알림버전", "사이트알림연동 " + code]],
    [companion, ["K롤방 구인구직방", "기존 소통방"], ["사이트알림상태", "사이트알림버전", "사이트알림연동 " + code]],
  ]) {
    const original = new Map(Object.entries(settings));
    const bot = runtime(source, new Map(original));
    const initialReads = bot.reads.length;
    for (const room of rooms) for (const message of messages) assert.deepEqual(reply(bot, message, room), []);
    assert.equal(bot.calls.length, 0);
    assert.equal(bot.reads.length, initialReads);
    assert.deepEqual(bot.writes, []);
    assert.deepEqual(bot.data, original);
  }
  for (const [source, rooms, origin] of [
    [klolCompanion, ["K롤방 구인구직방", "기존 소통방"], "https://k-lol-gg.vercel.app"],
    [companion, ["NEXUS", "NEXUS 구인구직방"], "https://nexus.example.test"],
  ]) {
    for (const room of rooms) {
      const bot = runtime(source, new Map(Object.entries(settings)));
      assert.match(reply(bot, "사이트알림연동 " + code, room).join("\n"), /수신 세션을 등록/);
      assert.equal(bot.calls[0].url, origin + "/api/integrations/kakao/site-notices");
      assert.equal(bot.calls[0].body.action, "REGISTER");
      for (const [key, value] of Object.entries({ ...klolSettings, ...syntheticNexus })) assert.equal(bot.data.get(key), value);
    }
  }
});

test("two phone bots share storage without sharing config, persistent state, identity or request IDs", () => {
  const data = new Map(Object.entries(klolSettings));
  const a = runtime(klol, data);
  const b = runtime(nexusPrivatePreamble(nexusPrivateSettings(syntheticNexus)) + nexus, data);
  for (const [key, value] of Object.entries(klolSettings)) assert.equal(data.get(key), value);
  assert.ok(b.writes.every((key) => key.startsWith("NEXUS_")));
  reply(a, "내전상세 1", "K롤방 구인구직방");
  reply(b, "내전상세 1");
  assert.equal(a.calls.length, 1); assert.equal(b.calls.length, 1);
  assert.equal(a.calls[0].url, "https://k-lol-gg.vercel.app/api/integrations/kakao/v4/commands");
  assert.equal(b.calls[0].url, "https://nexus.example.test/api/integrations/kakao/v4/commands");
  assert.notEqual(a.calls[0].body.installationId, b.calls[0].body.installationId);
  assert.notEqual(a.calls[0].body.senderId, b.calls[0].body.senderId);
  assert.notEqual(a.calls[0].body.eventId, b.calls[0].body.eventId);
  assert.equal(b.calls[0].body.protocol, "KLOL_KAKAO_V1_STRICT", "wire protocol remains compatible with the existing server");
  assert.equal(b.calls[0].headers["x-klol-key-id"], "nexus-current");
  // Exercise the real server boundary as well as the phone VM; a syntactically
  // valid phone request can still be rejected by its envelope/signature rules.
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { parseKakaoV4CommandEnvelope, verifyKakaoV4Signature } from "./src/modules/recruiting/kakao-v4/domain.ts";
    let raw = ""; for await (const chunk of process.stdin) raw += chunk;
    const { call, signing } = JSON.parse(raw);
    const envelope = parseKakaoV4CommandEnvelope(call.body);
    assert.ok(envelope, "NEXUS phone request must pass the actual server envelope parser");
    const keyId = call.headers["x-klol-key-id"];
    assert.equal(verifyKakaoV4Signature({ envelope, rawBody: Buffer.from(JSON.stringify(call.body)), keyId,
      signature: call.headers["x-klol-signature"], secrets: [{ keyId, secret: Buffer.from(signing) }] }).ok, true);
  `], { cwd: root, input: JSON.stringify({ call: b.calls[0], signing: syntheticNexus.NEXUS_V4_KAKAO_WEBHOOK_SECRET_CURRENT }) });
  b.context.NEXUS_DB.setDataBase("KLOL_RECRUIT_LAST_HASH_UNIFIED_V24", "nexus-only");
  assert.equal(data.get("KLOL_RECRUIT_LAST_HASH_UNIFIED_V24"), undefined);
  assert.equal(data.get("NEXUS_RECRUIT_LAST_HASH_UNIFIED_V24"), "nexus-only");
  assert.ok(b.reads.every((key) => key.startsWith("NEXUS_")), "NEXUS never reads KLOL configuration or state");
});

test("NEXUS only responds in its two named rooms and all local links belong to NEXUS", () => {
  const bot = runtime(nexus, new Map(Object.entries(syntheticNexus)));
  assert.deepEqual(reply(bot, "내전상세 1", "K롤방 구인구직방"), []);
  assert.deepEqual(reply(bot, "내전상세 1", "NEXUS", "other.app"), []);
  assert.equal(bot.calls.length, 0);
  for (const room of ["NEXUS", "NEXUS 구인구직방"]) {
    const notice = reply(bot, "등록도움말", room).join("\n");
    assert.match(notice, /NEXUS\.GG/); assert.match(notice, /https:\/\/nexus\.example\.test\/start/);
    assert.doesNotMatch(notice, /k-lol|K-LOL|undefined/);
  }
  const welcome = reply(bot, "입장시 할 일", "NEXUS", "com.kakao.talk", "오픈채팅봇").join("\n");
  assert.match(welcome, /https:\/\/nexus\.example\.test/);
  assert.doesNotMatch(welcome, /open\.kakao\.com|discord\.gg|7942/);
});

test("missing NEXUS settings fail closed even when complete KLOL settings exist", () => {
  for (const omitted of Object.keys(syntheticNexus)) {
    const values = { ...klolSettings, ...syntheticNexus }; delete values[omitted];
    const bot = runtime(nexus, new Map(Object.entries(values)));
    assert.deepEqual(reply(bot, "내전상세 1"), []);
    assert.deepEqual(reply(bot, "등록도움말"), []);
    assert.equal(bot.calls.length, 0);
  }
  const bot = runtime(nexus, new Map(Object.entries({ ...syntheticNexus, NEXUS_V2_BASE_URL: "https://k-lol-gg.vercel.app" })));
  reply(bot, "내전상세 1"); assert.equal(bot.calls.length, 0);
  assert.throws(() => nexusPrivateSettings(klolSettings), /NEXUS_V2_BASE_URL/);
  assert.throws(() => nexusPrivateSettings({ ...syntheticNexus, NEXUS_V4_KAKAO_WEBHOOK_SECRET_CURRENT: syntheticNexus.NEXUS_V4_KAKAO_IDENTITY_SECRET }), /distinct/);
  assert.throws(() => nexusPrivateSettings({ ...syntheticNexus, KLOL_V4_KAKAO_IDENTITY_SECRET: syntheticNexus.NEXUS_V4_KAKAO_IDENTITY_SECRET }), /independent/);
});

test("NEXUS companion has an independent registration code, target and ledger on shared storage", () => {
  const code = "a".repeat(32);
  const data = new Map(Object.entries({ ...klolSettings, ...syntheticNexus,
    KLOL_SITE_NOTICE_ENABLED: "true", KLOL_SITE_NOTICE_REGISTRATION_CODE: "b".repeat(32), KLOL_SITE_NOTICE_LEDGER_V1: "klol-ledger",
    NEXUS_SITE_NOTICE_ENABLED: "true", NEXUS_SITE_NOTICE_TARGET_ID: "c".repeat(32), NEXUS_SITE_NOTICE_REGISTRATION_CODE: code,
  }));
  const bot = runtime(companion, data);
  assert.deepEqual(reply(bot, "사이트알림연동 " + code, "K롤방 구인구직방"), []);
  assert.equal(bot.calls.length, 0);
  const result = reply(bot, "사이트알림연동 " + code, "NEXUS 구인구직방").join("\n");
  assert.match(result, /수신 세션을 등록/);
  assert.equal(bot.calls.length, 1);
  assert.equal(bot.calls[0].url, "https://nexus.example.test/api/integrations/kakao/site-notices");
  assert.equal(bot.calls[0].body.targetHash, createHmac("sha256", syntheticNexus.NEXUS_V4_KAKAO_IDENTITY_SECRET).update("site-notice-target\n" + "c".repeat(32)).digest("hex"));
  assert.equal(data.get("NEXUS_SITE_NOTICE_REGISTRATION_CODE"), "");
  assert.equal(data.get("KLOL_SITE_NOTICE_REGISTRATION_CODE"), "b".repeat(32));
  bot.context.NEXUS_DB.setDataBase("KLOL_SITE_NOTICE_LEDGER_V1", "nexus-ledger");
  assert.equal(data.get("KLOL_SITE_NOTICE_LEDGER_V1"), "klol-ledger");
  assert.ok([...bot.reads, ...bot.writes].every((key) => key.startsWith("NEXUS_")));
});
