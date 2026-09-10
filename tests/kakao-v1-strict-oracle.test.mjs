import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { analyzeRhinoStatic } from "../scripts/lib/messengerbot-rhino-static.mjs";

const root = resolve(import.meta.dirname, "..");
const strictFixturePath = resolve(
  root,
  "tests/fixtures/kakao/v1/KLOL_KAKAO_BOT_V40_GUIDED_HUB.js",
);
const compatibilityFixturePath = resolve(
  root,
  "tests/fixtures/kakao-v4-v1-compatibility-contract.json",
);
const source = await readFile(strictFixturePath, "utf8");
const compatibilityFixture = JSON.parse(await readFile(compatibilityFixturePath, "utf8"));
const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");

const EXPECTED_CRLF_SHA256 = "c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7";
const EXPECTED_LF_SHA256 = "0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2";
const EXPECTED_VERSION = "KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31";

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function normalizedLf(text) {
  return String(text).replace(/\r\n?/gu, "\n");
}

function strictHarness() {
  const stored = new Map();
  const replies = [];
  const context = vm.createContext({
    console,
    DataBase: {
      getDataBase(key) { return stored.get(String(key)) ?? ""; },
      setDataBase(key, value) { stored.set(String(key), String(value)); },
    },
  });
  new vm.Script(source, { filename: strictFixturePath }).runInContext(context);
  return {
    replies,
    respond(message, options = {}) {
      context.response(
        options.room ?? "K롤방 구인구직방",
        message,
        options.sender ?? "일반 사용자",
        true,
        { reply(value) { replies.push(String(value)); } },
        null,
        "com.xfl.msgbot",
      );
    },
  };
}

test("V1_STRICT fixture preserves the canonical V1 bytes across checkout line endings", () => {
  const lf = normalizedLf(source);
  assert.equal(sha256(lf), EXPECTED_LF_SHA256);
  assert.equal(sha256(lf.replace(/\n/gu, "\r\n")), EXPECTED_CRLF_SHA256);
  assert.equal(compatibilityFixture.source.v1Sha256, EXPECTED_CRLF_SHA256);
});

test("V1_STRICT fixture contains no hard-coded credential value", () => {
  assert.doesNotMatch(source, /(?:secret|token|password|api[_-]?key)\s*=\s*["'][^"']+["']/iu);
  assert.doesNotMatch(source, /(?:Bearer\s+[A-Za-z0-9._~+/-]{12,}|(?:sk|pk)_[A-Za-z0-9_-]{12,}|postgres(?:ql)?:\/\/[^\s"']+)/iu);
  assert.match(source, /DataBase\.getDataBase\(key\)/u);
  for (const key of ["KLOL_KAKAO_RECRUIT_SECRET", "KLOL_KAKAO_OPENCHAT_SECRET", "KLOL_KAKAO_SEARCH_PLAYER_SECRET"]) {
    assert.match(source, new RegExp(`readPrivateBotSetting\\("${key}"\\)`, "u"));
  }
});

test("V1_STRICT fixture remains ES5 and Rhino-static warning free", () => {
  const program = acorn.parse(source, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
  const findings = analyzeRhinoStatic(program);
  assert.deepEqual({
    statementCandidates: findings.statementCandidates.length,
    unsafeSequenceOperands: findings.unsafeSequenceOperands.length,
    voidExpressions: findings.voidExpressions.length,
    bareAssignmentConditions: findings.bareAssignmentConditions.length,
  }, {
    statementCandidates: 0,
    unsafeSequenceOperands: 0,
    voidExpressions: 0,
    bareAssignmentConditions: 0,
  });
});

test("V1_STRICT executes the original bot-version reply with or without slash", () => {
  for (const command of ["봇버전", "/봇버전"]) {
    const bot = strictHarness();
    bot.respond(command);
    assert.deepEqual(bot.replies, [`[K-LOL.GG 카카오봇 코드 버전]\n${EXPECTED_VERSION}`]);
  }
});

test("V1_STRICT executes the original user help exactly", () => {
  for (const command of ["도움말", "/도움말", "명령어", "/명령어"]) {
    const bot = strictHarness();
    bot.respond(command);
    assert.deepEqual(bot.replies, [compatibilityFixture.exactReplies.generalHelp]);
  }
});

test("APPROVED_EXTENSIONS cannot be mislabeled as commands from the V1_STRICT oracle", () => {
  for (const command of [
    "내전모집 칼바람",
    "내전신청 #2",
    "스크림참가 #1 별빛단",
    "사진상태",
    "자동공지 18",
    "V2진단",
  ]) {
    const bot = strictHarness();
    bot.respond(command);
    assert.deepEqual(bot.replies, [], command);
  }

  const participant = strictHarness();
  participant.respond("/내전참가");
  assert.match(participant.replies[0], /^\[K-LOL\.GG 내전 참가 방법 안내\]/u);

  const numberedParticipant = strictHarness();
  numberedParticipant.respond("/내전참가 #2");
  assert.deepEqual(numberedParticipant.replies, []);
});
