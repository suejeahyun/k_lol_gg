import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "integrations/messengerbot-r/v4");
const profiles = ["RECRUIT", "FEATURES"];

async function entrySource(profile) {
  return readFile(resolve(directory, `KLOL_KAKAO_BOT_V4_${profile}.js`), "utf8");
}

async function entryHarness(profile) {
  const calls = [];
  const replies = [];
  const context = vm.createContext({
    KLOL_V4: {
      shouldIgnore() { return false; },
      localReply() { return null; },
      send(profileId, text, sender, logId, userHash) {
        calls.push({ profileId, text, sender, logId, userHash });
        return { ok: true, body: { reply: `[${profileId}] ${text}` } };
      },
      resultReply(result) { return result.body.reply; },
    },
  });
  vm.runInContext(await entrySource(profile), context);
  return {
    calls,
    replies,
    respond(text, options = {}) {
      context.response(
        options.room ?? "poison-room-name",
        text,
        options.sender ?? "USER_A",
        options.isGroupChat ?? false,
        { reply(value) { replies.push(String(value)); } },
        null,
        "qa.package",
        false,
        options.logId ?? null,
        options.channelId ?? "poison-channel",
        options.userHash ?? "qa-user-hash",
      );
    },
  };
}

async function sharedInternals(bootUuid = "01234567-89ab-cdef-0123-456789abcdef", settings = {}) {
  const source = (await readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_SHARED.js"), "utf8")).replace(/\r\n?/gu, "\n");
  const instrumented = source.replace(
    "return {\n    localReply: localReply,",
    "return {\n    __testNextEventId: nextEventId,\n    __testLogEventMaterial: logEventMaterial,\n    __testCanonicalLocalCommand: canonicalLocalCommand,\n    localReply: localReply,",
  );
  assert.notEqual(instrumented, source, "shared export instrumentation point disappeared");
  const context = vm.createContext({
    java: {
      util: {
        UUID: {
          randomUUID() { return { toString() { return bootUuid; } }; },
        },
      },
    },
    DataBase: {
      getDataBase(key) { return settings[key] ?? ""; },
    },
  });
  vm.runInContext(instrumented, context);
  return { source, api: context.KLOL_V4, context };
}

async function unifiedHarness() {
  const { api, context } = await sharedInternals();
  const calls = [];
  const replies = [];
  api.send = (profileId, text, sender, logId, userHash) => {
    calls.push({ profileId, text, sender, logId, userHash });
    return { ok: true, body: { reply: `[${profileId}] ${text}` } };
  };
  api.resultReply = (result) => result.body.reply;
  vm.runInContext(await readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_UNIFIED.js"), "utf8"), context);
  return {
    api,
    calls,
    replies,
    respond(text, options = {}) {
      context.response(
        options.room ?? "untrusted-room",
        text,
        options.sender ?? "USER_A",
        true,
        { reply(value) { replies.push(String(value)); } },
        null,
        "qa.package",
        false,
        options.logId ?? null,
        options.channelId ?? "untrusted-channel",
        options.userHash ?? "qa-user-hash",
      );
    },
  };
}

test("[C01] each entry sends its own static profile regardless of poisoned callback room values", async () => {
  for (const profile of profiles) {
    const bot = await entryHarness(profile);
    bot.respond("V4상태", { room: "sender-is-room", channelId: "different-channel", isGroupChat: false });
    assert.equal(bot.calls.length, 1);
    assert.equal(bot.calls[0].profileId, profile);
    assert.doesNotMatch(JSON.stringify(bot.calls[0]), /poison-room-name|sender-is-room|different-channel/u);
  }
});

test("[C02] RECRUIT ignores FEATURES commands locally without a server call", async () => {
  const bot = await entryHarness("RECRUIT");
  for (const command of ["랭킹", "전적 별빛#KR1", "최근 별빛#KR1", "내전구인 협곡"]) bot.respond(command);
  assert.equal(bot.calls.length, 0);
  assert.equal(bot.replies.length, 0);
});

test("[C03] FEATURES ignores RECRUIT commands locally without a server call", async () => {
  const bot = await entryHarness("FEATURES");
  for (const command of ["5인파티", "구인현황", "12ㅉ", "스크림구인"]) bot.respond(command);
  assert.equal(bot.calls.length, 0);
  assert.equal(bot.replies.length, 0);
});

test("[C03A] one unified phone bot routes both room command families exactly once", async () => {
  const bot = await unifiedHarness();
  for (const [command, profileId, room] of [
    ["5인파티", "RECRUIT", "구인 관련방"],
    ["구인현황", "RECRUIT", "구인 관련방"],
    ["스크림구인", "RECRUIT", "구인 관련방"],
    ["랭킹", "FEATURES", "기능방"],
    ["전적 별빛#KR1", "FEATURES", "기능방"],
    ["내전구인 협곡", "FEATURES", "기능방"],
  ]) {
    const before = bot.calls.length;
    bot.respond(command, { room, logId: `unified-${before}` });
    assert.equal(bot.calls.length, before + 1, command);
    assert.equal(bot.calls.at(-1).profileId, profileId, command);
  }
  assert.equal(bot.replies.length, 6);
  assert.doesNotMatch(JSON.stringify(bot.calls), /구인 관련방|기능방|untrusted-room|untrusted-channel/u);
});

test("[C03B] unified bot version is one local reply and never reaches transport", async () => {
  const bot = await unifiedHarness();
  bot.api.unifiedLocalReply = (text) => text === "/봇버전" ? "통합 봇 버전" : null;
  bot.respond("/봇버전", { room: "어느 방이든 동일" });
  assert.deepEqual(bot.replies, ["통합 봇 버전"]);
  assert.equal(bot.calls.length, 0);
});

test("[C04] malformed slash, URLs and middle slash are rejected before transport", async () => {
  for (const profile of profiles) {
    const bot = await entryHarness(profile);
    for (const command of ["//도움말", "/ 5인파티", "/", "https://k-lol.gg/도움말", "오늘 /내전현황", "구인/현황"]) {
      bot.respond(command);
    }
    assert.equal(bot.calls.length, 0, profile);
    assert.equal(bot.replies.length, 0, profile);
  }
});

test("[C05] no-logId boot counter gives every independent command a new event ID", async () => {
  const { api } = await sharedInternals();
  const first = api.__testNextEventId("RECRUIT", null);
  const second = api.__testNextEventId("RECRUIT", "");
  const third = api.__testNextEventId("RECRUIT", undefined);
  assert.match(first, /^event-boot-[a-f0-9]{16}-1$/u);
  assert.match(second, /-2$/u);
  assert.match(third, /-3$/u);
  assert.equal(new Set([first, second, third]).size, 3);
});

test("[C06] one command performs one HTTP execute with a five-second maximum", async () => {
  const { source } = await sharedInternals();
  const send = source.slice(source.indexOf("function send("), source.indexOf("function resultReply("));
  assert.equal((send.match(/\.execute\(\)/gu) ?? []).length, 1);
  assert.equal((send.match(/\.timeout\(5000\)/gu) ?? []).length, 1);
  assert.doesNotMatch(send, /(?:retry|attempt|firstNetworkError|secondNetworkError)/iu);
});

test("[C05A] logId replay is stable in one boot and isolated across profiles and restarts", async () => {
  const firstBoot = (await sharedInternals("11111111-1111-1111-1111-111111111111")).api;
  const secondBoot = (await sharedInternals("22222222-2222-2222-2222-222222222222")).api;
  const first = firstBoot.__testLogEventMaterial("RECRUIT", "room-local-log-1");
  assert.equal(firstBoot.__testLogEventMaterial("RECRUIT", "room-local-log-1"), first);
  assert.notEqual(firstBoot.__testLogEventMaterial("FEATURES", "room-local-log-1"), first);
  assert.notEqual(secondBoot.__testLogEventMaterial("RECRUIT", "room-local-log-1"), first);
});

test("[C05B] unified echo suppression checks both room-specific bot display names", async () => {
  const { api } = await sharedInternals("01234567-89ab-cdef-0123-456789abcdef", {
    KLOL_V4_BOT_SELF_NAME_RECRUIT: "K-LOL 구인구직 도우미",
    KLOL_V4_BOT_SELF_NAME_FEATURES: "Klol",
  });
  assert.equal(api.shouldIgnoreUnified("5인파티", "K-LOL 구인구직 도우미"), true);
  assert.equal(api.shouldIgnoreUnified("랭킹", "Klol"), true);
  assert.equal(api.shouldIgnoreUnified("랭킹", "일반 사용자"), false);
});

test("[C07] one scrim command performs exactly one client-to-server send", async () => {
  const bot = await entryHarness("RECRUIT");
  bot.respond("스크림구인");
  assert.equal(bot.calls.length, 1);
});

for (const code of [
  "WRONG_PROFILE",
  "INVALID_SIGNATURE",
  "REPLAY_CONFLICT",
  "SERVER_UNAVAILABLE",
  "INVALID_FORM",
]) {
  test(`[C08:${code}] client exposes the ${code} error category`, async () => {
    const { source } = await sharedInternals();
    assert.match(source, new RegExp(code, "u"), `missing client error category ${code}`);
  });
}
