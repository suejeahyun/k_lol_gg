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

async function sharedInternals() {
  const source = (await readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_SHARED.js"), "utf8")).replace(/\r\n?/gu, "\n");
  const instrumented = source.replace(
    "return {\n    localReply: localReply,",
    "return {\n    __testNextEventId: nextEventId,\n    __testCanonicalLocalCommand: canonicalLocalCommand,\n    localReply: localReply,",
  );
  assert.notEqual(instrumented, source, "shared export instrumentation point disappeared");
  const context = vm.createContext({
    java: {
      util: {
        UUID: {
          randomUUID() { return { toString() { return "01234567-89ab-cdef-0123-456789abcdef"; } }; },
        },
      },
    },
  });
  vm.runInContext(instrumented, context);
  return { source, api: context.KLOL_V4 };
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

test("[C03A] one phone with two room-selected bot profiles emits only the matching profile command", async () => {
  const recruitRoomBot = await entryHarness("RECRUIT");
  const featuresRoomBot = await entryHarness("FEATURES");

  recruitRoomBot.respond("5인파티", { room: "구인 관련방", logId: "same-phone-recruit-1" });
  recruitRoomBot.respond("랭킹", { room: "구인 관련방", logId: "same-phone-recruit-cross" });
  featuresRoomBot.respond("랭킹", { room: "기능방", logId: "same-phone-features-1" });
  featuresRoomBot.respond("5인파티", { room: "기능방", logId: "same-phone-features-cross" });

  assert.deepEqual(recruitRoomBot.calls.map((call) => call.profileId), ["RECRUIT"]);
  assert.deepEqual(featuresRoomBot.calls.map((call) => call.profileId), ["FEATURES"]);
  assert.equal(recruitRoomBot.replies.length, 1);
  assert.equal(featuresRoomBot.replies.length, 1);
  assert.doesNotMatch(JSON.stringify([...recruitRoomBot.calls, ...featuresRoomBot.calls]), /구인 관련방|기능방/u);
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

test("[C06] a network retry reuses one preallocated event ID", async () => {
  const { source } = await sharedInternals();
  const send = source.slice(source.indexOf("function send("), source.indexOf("function resultReply("));
  assert.match(send, /(?:retry|attempt)/iu, "transport has no observable retry path");
  assert.match(send, /eventId[\s\S]*execute\([\s\S]*execute\(/u, "retry must execute with the same eventId");
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
