import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { analyzeRhinoStatic } from "../scripts/lib/messengerbot-rhino-static.mjs";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "integrations/messengerbot-r/v4");
const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const fixture = JSON.parse(await readFile(resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json"), "utf8"));

function expectedProfile(route) {
  if (route.domain === "HELP") return null;
  if (route.domain === "PARTY" || route.domain === "SCRIM") return "RECRUIT";
  return "FEATURES";
}

function JavaString(value) {
  this.value = String(value);
  this.getBytes = () => Buffer.from(this.value, "utf8");
}

function StringBuilder() {
  let value = "";
  this.append = (next) => {
    value += String(next);
    return this;
  };
  this.toString = () => value;
}

function SecretKeySpec(bytes) {
  this.bytes = Buffer.from(bytes);
}

async function phone() {
  const source = await readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R.js"), "utf8");
  const values = new Map([
    ["KLOL_V2_BASE_URL", "https://example.invalid"],
    ["KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT", "s".repeat(32)],
    ["KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT", "current"],
    ["KLOL_V2_KAKAO_IDENTITY_SECRET", "i".repeat(32)],
  ]);
  const sends = [];
  const replies = [];
  const context = vm.createContext({
    console,
    Buffer,
    DataBase: {
      getDataBase(key) { return values.get(String(key)) ?? ""; },
      setDataBase(key, value) { values.set(String(key), String(value)); },
    },
    java: {
      lang: {
        String: JavaString,
        StringBuilder,
        Integer: { toHexString(value) { return Number(value).toString(16); } },
      },
      nio: { charset: { StandardCharsets: { UTF_8: "UTF_8" } } },
      security: {
        MessageDigest: {
          getInstance() {
            return { digest(bytes) { return createHash("sha256").update(Buffer.from(bytes)).digest(); } };
          },
        },
      },
      util: { UUID: { randomUUID() { return { toString() { return "01234567-89ab-cdef-0123-456789abcdef"; } }; } } },
    },
    javax: {
      crypto: {
        Mac: {
          getInstance() {
            let key = Buffer.alloc(0);
            return {
              init(spec) { key = Buffer.from(spec.bytes); },
              doFinal(bytes) { return createHmac("sha256", key).update(Buffer.from(bytes)).digest(); },
            };
          },
        },
        spec: { SecretKeySpec },
      },
    },
    org: {
      jsoup: {
        Connection: { Method: { POST: "POST" } },
        Jsoup: {
          connect(url) {
            const request = { url, body: "" };
            const chain = {
              ignoreContentType() { return chain; },
              ignoreHttpErrors() { return chain; },
              method() { return chain; },
              header() { return chain; },
              timeout() { return chain; },
              requestBody(body) { request.body = String(body); return chain; },
              execute() {
                const parsed = JSON.parse(request.body);
                sends.push({ url: request.url, body: parsed });
                return {
                  statusCode() { return 200; },
                  body() { return JSON.stringify({ reply: `SERVER:${parsed.text}` }); },
                  header() { return "trace-phase4-client"; },
                };
              },
            };
            return chain;
          },
        },
      },
    },
  });
  vm.runInContext(source, context, { filename: "KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R.js" });
  let logSequence = 0;
  return {
    sends,
    replies,
    respond(text, sender = "일반 사용자") {
      logSequence += 1;
      context.response(
        "poison-room-name",
        text,
        sender,
        true,
        { reply(value) { replies.push(String(value)); } },
        null,
        "qa.package",
        false,
        `phase4-log-${logSequence}`,
        "poison-channel",
        `qa-user-${sender}`,
      );
    },
  };
}

const localCases = [
  ["봇버전", null],
  ["도움말", fixture.exactReplies.generalHelp],
  ["구인도움말", fixture.exactReplies.recruitHelp],
  ["구인웹도우미", fixture.exactReplies.recruitWebHelp],
];

for (const [index, [command, expected]] of localCases.entries()) {
  test(`[P4-C${String(index + 1).padStart(2, "0")}] unified ${command} is client-only with exact local content`, async () => {
    const plain = await phone();
    plain.respond(command);
    const slash = await phone();
    slash.respond(`/${command}`);
    assert.equal(plain.sends.length, 0, `${command}: plain command must not use public transport`);
    assert.equal(slash.sends.length, 0, `${command}: slash command must not use public transport`);
    assert.equal(plain.replies.length, 1);
    assert.deepEqual(slash.replies, plain.replies);
    if (expected) assert.equal(plain.replies[0], expected);
    else {
      assert.match(plain.replies[0], /^\[K-LOL\.GG V4 봇 버전\]\n/u);
      assert.match(plain.replies[0], /프로필: UNIFIED/u);
      assert.match(plain.replies[0], /RECRUIT 설치본: install-[a-f0-9]{32}/u);
      assert.match(plain.replies[0], /FEATURES 설치본: install-[a-f0-9]{32}$/u);
    }
  });
}

test("[P4-C05] every V1 PUBLIC alias is classified by the unified phone with at most one send", async () => {
  const bot = await phone();
  const failures = [];
  let executions = 0;
  for (const route of fixture.routes) {
    for (const alias of route.aliases) {
      for (const text of [alias, `/${alias}`]) {
        const beforeSends = bot.sends.length;
        const beforeReplies = bot.replies.length;
        bot.respond(text);
        const sendCount = bot.sends.length - beforeSends;
        const replyCount = bot.replies.length - beforeReplies;
        const profile = expectedProfile(route);
        executions += 1;
        if (sendCount > 1 || replyCount !== 1) failures.push(`${text}: send=${sendCount}, reply=${replyCount}`);
        if (profile && sendCount === 1 && bot.sends.at(-1).body.profileId !== profile) {
          failures.push(`${text}: expected ${profile}, got ${bot.sends.at(-1).body.profileId}`);
        }
      }
    }
  }
  assert.equal(executions, fixture.routes.reduce((total, route) => total + route.aliases.length * 2, 0));
  assert.deepEqual(failures, []);
});

test("[P4-C06] malformed slash, URL and middle-slash inputs never enter public transport", async () => {
  const rejected = [...new Set([...fixture.slashBoundary.rejected, ...fixture.invariants.notCommands, "", "/"])];
  for (const text of rejected) {
    const bot = await phone();
    bot.respond(text);
    assert.equal(bot.sends.length, 0, text);
    assert.equal(bot.replies.length, 0, text);
  }
});

const internalCases = [
  ["RECRUIT", "V2도움말"],
  ["FEATURES", "V2진단"],
  ["FEATURES", "V2연동확인"],
  ["RECRUIT", "연동확인"],
  ["RECRUIT", "V2모집 {\"type\":\"CREATE_PARTY\"}"],
  ["FEATURES", "V2시즌 {\"action\":\"STATUS\"}"],
  ["FEATURES", "V2양식 {\"formType\":\"leaves\"}"],
  ["FEATURES", "V2사진세션 123e4567-e89b-42d3-a456-426614174000"],
  ["FEATURES", "V2사진취소"],
];

for (const [index, [, command]] of internalCases.entries()) {
  test(`[P4-I${String(index + 1).padStart(2, "0")}] ${command.split(" ")[0]} never enters public V4 transport`, async () => {
    for (const text of [command, `/${command}`]) {
      const bot = await phone();
      bot.respond(text);
      assert.equal(bot.sends.length, 0, text);
    }
  });
}

test("[P4-A01] final unified phone artifact is synchronized ES5, under 40k and Rhino-static clean", async () => {
  const shared = (await readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_SHARED.js"), "utf8")).replace(/\r\n?/gu, "\n").trim();
  const entryName = "KLOL_KAKAO_BOT_V4_UNIFIED.js";
  const entry = (await readFile(resolve(directory, entryName), "utf8")).replace(/\r\n?/gu, "\n").trim();
  const output = (await readFile(resolve(directory, "KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R.js"), "utf8")).replace(/\r\n?/gu, "\n");
  const expected = `/* GENERATED by scripts/build-messengerbot-v4.mjs. Edit SHARED or ${entryName}. */\n${shared}\n\n${entry}\n`;
  assert.equal(output, expected, "UNIFIED: generated artifact is stale");
  assert.ok(output.length < 40_000, `UNIFIED: ${output.length} characters`);
  const program = acorn.parse(output, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
  const findings = analyzeRhinoStatic(program);
  assert.deepEqual({
    statements: findings.statementCandidates.length,
    sequences: findings.unsafeSequenceOperands.length,
    voids: findings.voidExpressions.length,
    assignments: findings.bareAssignmentConditions.length,
  }, { statements: 0, sequences: 0, voids: 0, assignments: 0 }, "UNIFIED");
  assert.equal((output.match(/KLOL_V4\.send\(/gu) ?? []).length, 1, "UNIFIED: entry send call count");
  const responseSource = output.slice(output.indexOf("function response("));
  assert.doesNotMatch(responseSource, /\b(?:room|channelId|isGroupChat)\b(?=[^)]*(?:KLOL_V4\.send|JSON\.stringify))/u);
  const timeout = /\.timeout\((\d+)\)/u.exec(shared);
  assert.ok(timeout);
  assert.ok(Number(timeout[1]) <= 5_000, `timeout=${String(timeout[1])}ms`);
});
