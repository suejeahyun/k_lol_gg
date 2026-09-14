import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { analyzeRhinoStatic } from "../scripts/lib/messengerbot-rhino-static.mjs";

const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const root = resolve(import.meta.dirname, "..");
const sourcePath = "KLOL_KAKAO_BOT_V40_GUIDED_HUB.js";
const sourceSha256 = "0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2";
const fixturePath = resolve(root, "tests/fixtures/kakao/v1", sourcePath);
const artifactPath = resolve(
  root,
  "integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js"
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSource() {
  return readFileSync(fixturePath, "utf8");
}

function functionSources(source) {
  const program = acorn.parse(source, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
  const functions = new Map();
  for (const node of program.body) {
    if (node.type === "FunctionDeclaration") functions.set(node.id.name, source.slice(node.start, node.end));
  }
  return functions;
}

function withoutComments(source) {
  const comments = [];
  acorn.parse(source, {
    ecmaVersion: 5,
    allowReserved: true,
    preserveParens: true,
    onComment: comments,
  });
  let output = source;
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    const newlineCount = (output.slice(comment.start, comment.end).match(/\n/gu) ?? []).length;
    output = `${output.slice(0, comment.start)} ${"\n".repeat(newlineCount)}${output.slice(comment.end)}`;
  }
  return output;
}

function identifierCalls(node, output = new Set()) {
  if (!node || typeof node !== "object") return output;
  if (node.type === "CallExpression" && node.callee.type === "Identifier") output.add(node.callee.name);
  for (const [key, value] of Object.entries(node)) {
    if (key === "start" || key === "end" || key === "loc") continue;
    if (Array.isArray(value)) {
      for (const item of value) identifierCalls(item, output);
    } else if (value && typeof value === "object") {
      identifierCalls(value, output);
    }
  }
  return output;
}

function responseReachableFunctions(source, transportSeams) {
  const program = acorn.parse(source, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
  const functions = new Map(
    program.body
      .filter((node) => node.type === "FunctionDeclaration")
      .map((node) => [node.id.name, node])
  );
  const reachable = new Set();
  const queue = ["response"];
  while (queue.length > 0) {
    const name = queue.shift();
    if (reachable.has(name)) continue;
    reachable.add(name);
    if (transportSeams.has(name)) continue;
    const node = functions.get(name);
    if (!node) continue;
    for (const calledName of identifierCalls(node)) {
      if (functions.has(calledName) && !reachable.has(calledName)) queue.push(calledName);
    }
  }
  return reachable;
}

function makeRuntime({ responseBody = { reply: "[V1 server reply]" }, responseStatus = 200, rawResponseText, executeError, settings = {} } = {}) {
  const data = new Map([
    ["KLOL_V2_BASE_URL", "https://k-lol-gg.vercel.app"],
    ["KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT", "s".repeat(32)],
    ["KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT", "current"],
    ["KLOL_V4_KAKAO_IDENTITY_SECRET", "i".repeat(32)],
    ...Object.entries(settings)
  ]);
  const http = { calls: 0, url: "", timeout: 0, body: "", headers: {} };
  const seenEventIds = new Set();
  let lastResponseReplayed = false;

  function JavaString(value) {
    this.value = String(value);
  }
  JavaString.prototype.getBytes = function getBytes() {
    return Buffer.from(this.value, "utf8");
  };

  function StringBuilder() {
    this.value = "";
  }
  StringBuilder.prototype.append = function append(value) {
    this.value += String(value);
    return this;
  };
  StringBuilder.prototype.toString = function toString() {
    return this.value;
  };

  const java = {
    lang: {
      Integer: { toHexString: (value) => Number(value).toString(16) },
      String: JavaString,
      StringBuilder
    },
    nio: { charset: { StandardCharsets: { UTF_8: "UTF-8" } } },
    security: {
      MessageDigest: {
        getInstance: () => ({ digest: (bytes) => createHash("sha256").update(bytes).digest() })
      }
    },
    util: {
      UUID: { randomUUID: () => ({ toString: () => "12345678-1234-1234-1234-123456789abc" }) }
    }
  };
  const javax = {
    crypto: {
      Mac: {
        getInstance: () => ({
          secret: Buffer.alloc(0),
          init(key) {
            this.secret = key.bytes;
          },
          doFinal(bytes) {
            return createHmac("sha256", this.secret).update(bytes).digest();
          }
        })
      },
      spec: {
        SecretKeySpec: function SecretKeySpec(bytes) {
          this.bytes = bytes;
        }
      }
    }
  };
  const org = {
    jsoup: {
      Connection: { Method: { POST: "POST" } },
      Jsoup: {
        connect(url) {
          http.calls += 1;
          http.url = url;
          const chain = {
            ignoreContentType: () => chain,
            ignoreHttpErrors: () => chain,
            method: () => chain,
            header(name, value) {
              http.headers[name] = value;
              return chain;
            },
            timeout(value) {
              http.timeout = value;
              return chain;
            },
            requestBody(value) {
              http.body = value;
              return chain;
            },
            execute() {
              if (executeError) throw executeError;
              const eventId = JSON.parse(http.body).eventId;
              lastResponseReplayed = seenEventIds.has(eventId);
              seenEventIds.add(eventId);
              return {
                statusCode: () => responseStatus,
                body: () => rawResponseText === undefined ? JSON.stringify(responseBody) : rawResponseText,
                header: (name) => name === "Idempotency-Replayed" && lastResponseReplayed ? "true" : ""
              };
            }
          };
          return chain;
        }
      }
    }
  };
  return {
    Buffer,
    DataBase: {
      getDataBase: (key) => data.get(String(key)) ?? "",
      setDataBase: (key, value) => data.set(String(key), String(value))
    },
    java,
    javax,
    org,
    http
  };
}

function evaluate(source, options) {
  const runtime = makeRuntime(options);
  vm.createContext(runtime);
  vm.runInContext(source, runtime, { timeout: 2_000 });
  return runtime;
}

function replyFor(runtime, message, options = {}) {
  const replies = [];
  const replier = { reply: (value) => replies.push(String(value)) };
  runtime.__testLogCounter = Number(runtime.__testLogCounter || 0) + 1;
  runtime.response(
    options.room ?? "K롤방 구인구직방",
    message,
    options.sender ?? "재현",
    true,
    replier,
    options.imageDB ?? {},
    "com.kakao.talk",
    false,
    options.logId ?? `log-${runtime.__testLogCounter}`,
    "channel",
    options.userHash ?? "user-hash"
  );
  return replies;
}

test("builder pins the canonical V1 hash and produces an ES5/Rhino-safe artifact", async () => {
  execFileSync(process.execPath, ["scripts/build-messengerbot-v1-strict.mjs"], { cwd: root });
  const canonical = canonicalSource();
  const artifact = await readFile(artifactPath, "utf8");
  const comments = [];
  const program = acorn.parse(artifact, { ecmaVersion: 5, allowReserved: true, preserveParens: true, onComment: comments });
  const findings = analyzeRhinoStatic(program);

  assert.equal(sha256(canonical), sourceSha256);
  assert.match(artifact, new RegExp(`KLOL_V1_SOURCE_SHA256 = "${sourceSha256}"`));
  assert.ok(artifact.length < 65_535, `artifact length: ${artifact.length}`);
  assert.ok(artifact.replace(/\n/gu, "\r\n").length < 65_535, `CRLF artifact length: ${artifact.replace(/\n/gu, "\r\n").length}`);
  assert.equal((artifact.match(/function\s+response\s*\(/gu) ?? []).length, 1);
  assert.equal((artifact.match(/org\.jsoup\.Jsoup\.connect\s*\(/gu) ?? []).length, 1);
  assert.match(artifact, /\.timeout\(5000\)/u);
  assert.deepEqual(findings.statementCandidates, []);
  assert.deepEqual(findings.unsafeSequenceOperands, []);
  assert.deepEqual(findings.voidExpressions, []);
  assert.deepEqual(findings.bareAssignmentConditions, []);
  assert.deepEqual(findings.inconsistentReturnFunctions, []);
  assert.deepEqual(comments, []);
});

test("Rhino audit detects functions that mix value and bare returns", () => {
  const program = acorn.parse("function mixed(flag) { if (flag) return 1; return; }", {
    ecmaVersion: 5,
    allowReserved: true,
    preserveParens: true,
  });
  assert.deepEqual(analyzeRhinoStatic(program).inconsistentReturnFunctions.map((finding) => finding.name), ["mixed"]);
});

test("V1 strict routes organizer-only metadata activation forms with or without one slash", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  const base = "[K-LOL.GG 구인구직 양식]\n📢 2인 파티 구인\n모집번호: #6\n\n》시작시간 :\n》게임정보 :\n》주최자 : 재현";
  for (const prefix of ["", "/"]) {
    const runtime = evaluate(artifact, { responseBody: { reply: "[활성화 완료]" } });
    assert.deepEqual(replyFor(runtime, `${prefix}${base}`), ["[활성화 완료]"]);
    assert.equal(runtime.http.calls, 1);
    assert.match(JSON.parse(runtime.http.body).text, /》주최자 : 재현/u);
  }
});

test("V1 strict R14 routes scoped in-house and scrim finish commands as unchanged raw text", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  for (const [message, profileId] of [
    ["내전 2ㅉ", "FEATURES"],
    ["/내전 2ㅉ", "FEATURES"],
    ["스크림 7ㅉ", "RECRUIT"],
    ["/스크림 7ㅉ", "RECRUIT"],
  ]) {
    const runtime = evaluate(artifact, { responseBody: { reply: "[서버 마감 응답]" } });
    assert.deepEqual(replyFor(runtime, message), ["[서버 마감 응답]"]);
    assert.equal(runtime.http.calls, 1);
    const request = JSON.parse(runtime.http.body);
    assert.equal(request.profileId, profileId);
    assert.equal(request.text, message);
  }
  for (const message of ["//내전 2ㅉ", "내전2ㅉ", "내전 0ㅉ", "스크림 1000ㅉ", "내전\n2ㅉ"]) {
    const runtime = evaluate(artifact);
    assert.deepEqual(replyFor(runtime, message), [], message);
    assert.equal(runtime.http.calls, 0, message);
  }
});

test("V1 strict routes the full organizer-only template returned by the production server", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  const message = [
    "[K-LOL.GG 구인구직 양식]",
    "같이 할사람~",
    "",
    "아래 양식의 모집번호는 유지해서 작성해주세요.",
    "",
    "📢 5인 파티 구인",
    "모집번호: #11",
    "운영일: 2026-09-13",
    "",
    "》시작시간 : test",
    "》게임정보 :test",
    "》주최자 :test",
    "",
    "위 항목을 작성해 전체 전송해주세요.",
    "비워 둔 시간과 게임 정보는 자동으로 채워집니다.",
    "활성화 후 상세 번호 추가 이름으로 참가할 수 있습니다.",
    "",
    "참여해주실 분은 태그해주세요.",
    "*상호배려와 존중 부탁드립니다.",
  ].join("\n");
  const runtime = evaluate(artifact, { responseBody: { reply: "[활성화 완료]" } });

  assert.equal(runtime.isPartyMetadataActivationForm(message), true);
  assert.equal(runtime.isPartyRecruitFormMessage(message), true);
  assert.equal(runtime.isRecruitCommand(message), true);
  assert.deepEqual(replyFor(runtime, message, { sender: "관리자. 99 재현 M(M)" }), ["[활성화 완료]"]);
  assert.equal(runtime.http.calls, 1);
  const request = JSON.parse(runtime.http.body);
  assert.equal(request.profileId, "RECRUIT");
  assert.equal(request.text, message);
});

test("artifact excludes legacy HTTP, bearer, and embedded secret material", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  const banned = [
    "/api/kakao/party-recruits/",
    "/api/kakao/destruction-scrim-recruits/",
    "/api/kakao/recruit/season-apply",
    "/api/kakao/openchat",
    "/api/kakao/search-player",
    "Authorization",
    "Bearer ",
    "x-kakao-recruit-secret"
  ];
  for (const value of banned) assert.equal(artifact.includes(value), false, value);
  for (const legacySecretKey of [
    "KLOL_KAKAO_RECRUIT_SECRET",
    "KLOL_KAKAO_OPENCHAT_SECRET",
    "KLOL_KAKAO_SEARCH_PLAYER_SECRET"
  ]) {
    assert.equal(artifact.includes(`setting("${legacySecretKey}")`), false);
    assert.equal(artifact.includes(`DataBase.getDataBase("${legacySecretKey}")`), false);
  }
});

test("all response-reachable non-transport V1 executable lines are preserved without comments or blank spacers", async () => {
  const canonical = canonicalSource();
  const artifact = await readFile(artifactPath, "utf8");
  const strict = evaluate(artifact);
  const canonicalFunctions = functionSources(canonical);
  const artifactFunctions = functionSources(artifact);
  const transportSeams = new Set(strict.KLOL_V1_TRANSPORT_SEAMS);
  const reachable = responseReachableFunctions(canonical, transportSeams);
  const requiredOriginal = [...reachable].filter((name) => !transportSeams.has(name));
  const slices = [];

  assert.equal(reachable.size, 72);
  assert.equal(requiredOriginal.length, 63);
  assert.deepEqual(new Set(strict.KLOL_V1_SOURCE_FUNCTIONS), new Set(requiredOriginal));
  for (const name of strict.KLOL_V1_SOURCE_FUNCTIONS) {
    const expected = withoutComments(canonicalFunctions.get(name));
    const actualName = name === "response" ? "v1SourceResponse" : name;
    let actual = artifactFunctions.get(actualName);
    assert.ok(expected, `canonical function missing: ${name}`);
    assert.ok(actual, `artifact function missing: ${actualName}`);
    slices.push(actual);
    if (name === "response") actual = actual.replace(/^function v1SourceResponse\s*\(/u, "function response(");
    assert.equal(
      actual.split("\n").filter((line) => line.trim().length > 0).join("\n"),
      expected.split("\n").filter((line) => line.trim().length > 0).join("\n"),
      name
    );
  }
  assert.equal(
    sha256(slices.join("\n\n").split("\n").filter((line) => line.trim().length > 0).join("\n")),
    strict.KLOL_V1_EXTRACTED_SHA256
  );

  assert.equal(transportSeams.size, 9);
  for (const name of transportSeams) {
    assert.equal(reachable.has(name), true, `transport seam must be response-reachable: ${name}`);
    assert.ok(artifactFunctions.has(name), `adapter seam missing: ${name}`);
    assert.notEqual(artifactFunctions.get(name), canonicalFunctions.get(name), `legacy transport was not replaced: ${name}`);
  }
});

test("strict adapter reuses the canonical V1 local dedupe storage keys", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  assert.match(artifact, /var RECRUIT_SAVE_KEY = "KLOL_RECRUIT_LAST_HASH_UNIFIED_V24";/u);
  assert.match(artifact, /var PARTY_RECRUIT_SAVE_KEY = "KLOL_PARTY_RECRUIT_LAST_HASH_UNIFIED_V18";/u);
  assert.match(artifact, /var OPERATION_FORM_SAVE_KEY = "KLOL_OPERATION_FORM_LAST_HASH_V1";/u);
});

test("local replies, echo rules, events, and no-reply behavior equal the canonical V1", async () => {
  const canonical = evaluate(canonicalSource());
  const strict = evaluate(await readFile(artifactPath, "utf8"));
  const cases = [
    { message: "/도움말" },
    { message: "명령어" },
    { message: "내전참가" },
    { message: "/참가신청" },
    { message: "등록" },
    { message: "/등록도움말" },
    { message: "내전등록" },
    { message: "경고등록" },
    { message: "인증" },
    { message: "경고현황" },
    { message: "결과현황" },
    { message: "구인도움말" },
    { message: "/구인웹도우미" },
    { message: "홍길동님이 들어왔습니다" },
    { message: "홍길동님이 나갔습니다" },
    { message: "홍길동님이 초대되었습니다" },
    { message: "아무 관계 없는 대화" },
    { message: "[K-LOL.GG 구인구직 현황]\n현재 없음", sender: "K-LOL 구인구직 도우미" },
    {
      message: "📢 5인 파티 구인\n》시작시간 :\n》게임정보 :\n\n1. 재현\n2.\n3.\n4.\n5."
    }
  ];
  for (const item of cases) {
    const expected = replyFor(canonical, item.message, { sender: item.sender }).map((reply) => item.message === "구인도움말"
      ? reply.replace(
        "현황: 구인현황\n종료: 번호ㅉ",
        "활성화: 주최자 입력 후 전체 전송 (시간·게임은 비우면 자동)\n현황: 구인현황\n추가: 상세 번호 추가 이름\n삭제: 상세 번호 삭제 이름\n종료: 번호ㅉ",
      )
      : reply);
    const actual = replyFor(strict, item.message, { sender: item.sender });
    assert.deepEqual(actual, expected, item.message);
  }
  assert.deepEqual(
    replyFor(strict, "봇버전"),
    ["[K-LOL.GG 카카오봇 코드 버전]\nKLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R14_2026_09_14_RHINO_CLEAN"],
  );
});

test("approved party member mutations parse safely and use one RECRUIT gateway request", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  const accepted = [
    ["상세 15 추가 재현", "PARTY_MEMBER_ADD", "재현"],
    ["/상세 15 삭제 재현", "PARTY_MEMBER_REMOVE", "재현"],
    ["구인상세 15 추가 김 별", "PARTY_MEMBER_ADD", "김 별"],
    ["상세 #15 삭제 재현", "PARTY_MEMBER_REMOVE", "재현"],
    [String.raw`상세 \#15 추가 재현`, "PARTY_MEMBER_ADD", "재현"],
    ["／상세　＃１５　추가　ＡＢＣ", "PARTY_MEMBER_ADD", "ABC"],
  ];
  for (const [message, command, name] of accepted) {
    const strict = evaluate(artifact, { responseBody: { reply: "[인원 변경 완료]" } });
    const parsed = strict.parsePartyMemberMutationCommand(message);
    assert.equal(parsed.command, command, message);
    assert.equal(parsed.recruitNumber, 15, message);
    assert.equal(parsed.name, name, message);
    assert.deepEqual(replyFor(strict, message), ["[인원 변경 완료]"], message);
    assert.equal(strict.http.calls, 1, message);
    const body = JSON.parse(strict.http.body);
    assert.equal(body.profileId, "RECRUIT", message);
    assert.equal(body.text, message, message);
  }
});

test("inhouse and scrim member shortcuts reach the matching profile gateway", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  for (const [message, surface, command, profileId] of [
    ["/내전상세 #3 추가 재현", "INHOUSE", "ADD", "FEATURES"],
    ["내전 명단 3 삭재 재현", "INHOUSE", "REMOVE", "FEATURES"],
    ["스크림상세 4 참가 재현", "SCRIM", "ADD", "RECRUIT"],
    [String.raw`/스크림 명단 \#4 제외 재현`, "SCRIM", "REMOVE", "RECRUIT"],
  ]) {
    const strict = evaluate(artifact, { responseBody: { reply: "[명단 변경 완료]" } });
    const parsed = strict.parseMemberMutationCommand(message);
    assert.equal(parsed.surface, surface, message);
    assert.equal(parsed.command, command, message);
    assert.deepEqual(replyFor(strict, message), ["[명단 변경 완료]"], message);
    assert.equal(JSON.parse(strict.http.body).profileId, profileId, message);
  }
});

test("reported inhouse loading echo is ignored while user commands and explicit member edits keep one reply", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  const strict = evaluate(artifact, { responseBody: { reply: "[K-LOL.GG 정상 응답]" } });

  for (const loading of ["내전구인 양식 불러오는 중…", "내전구인 양식 불러오는 중..."]) {
    assert.equal(strict.isOpenChatBotInhouseLoadingNotice(loading, "오픈채팅봇"), true, loading);
    assert.deepEqual(replyFor(strict, loading, { sender: "오픈채팅봇" }), [], loading);
  }
  assert.equal(strict.http.calls, 0);

  assert.equal(strict.isOpenChatBotInhouseLoadingNotice("/내전구인", "운영진. 94 은지 U(U)"), false);
  assert.deepEqual(replyFor(strict, "/내전구인", { sender: "운영진. 94 은지 U(U)" }), ["[K-LOL.GG 정상 응답]"]);
  assert.deepEqual(replyFor(strict, "/내전구인 증바람", { sender: "운영진. 94 은지 U(U)" }), ["[K-LOL.GG 정상 응답]"]);
  assert.deepEqual(replyFor(strict, "내전상세 2 추가 은지", { sender: "운영진. 94 은지 U(U)" }), ["[K-LOL.GG 정상 응답]"]);
  assert.equal(strict.http.calls, 3);

  assert.equal(strict.parseMemberMutationCommand("2 추가 은지"), null);
  assert.deepEqual(replyFor(strict, "2 추가 은지", { sender: "운영진. 94 은지 U(U)" }), []);
  assert.equal(strict.http.calls, 3);
});

test("same MessengerBot logId replay suppresses only the duplicate visible reply", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  const strict = evaluate(artifact, { responseBody: { reply: "[K-LOL.GG 내전 종목 선택]" } });
  const options = { sender: "운영진. 94 은지 U(U)", logId: "same-kakao-notification-1" };

  assert.deepEqual(replyFor(strict, "/내전구인", options), ["[K-LOL.GG 내전 종목 선택]"]);
  assert.deepEqual(replyFor(strict, "/내전구인", options), []);
  assert.equal(strict.http.calls, 2, "the server receives the retry and marks it replayed");

  assert.deepEqual(
    replyFor(strict, "/내전구인 증바람", { ...options, logId: "different-kakao-notification-2" }),
    ["[K-LOL.GG 내전 종목 선택]"],
  );
  assert.equal(strict.http.calls, 3, "a different real Kakao log remains independently replyable");
});

test("ambiguous party member text never reaches the mutation gateway", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  for (const message of [
    "15 추가 재현",
    "상세 15 추가",
    "상세 0 추가 재현",
    "상세 100 추가 재현",
    "상세 15 추가 재현, 민서",
    "상세 15 추가 재현/민서",
    "상세 15 추가 삭제 재현",
    "상세 15 추가 재현\n민서",
    `상세 15 추가 ${"가".repeat(81)}`,
  ]) {
    const strict = evaluate(artifact);
    assert.equal(strict.parsePartyMemberMutationCommand(message), null, message.slice(0, 30));
    assert.deepEqual(replyFor(strict, message), [], message.slice(0, 30));
    assert.equal(strict.http.calls, 0, message.slice(0, 30));
  }
});

test("local recruit help documents member commands and keeps full-form guidance", async () => {
  const strict = evaluate(await readFile(artifactPath, "utf8"));
  const [reply] = replyFor(strict, "구인도움말");
  assert.match(reply, /추가: 상세 번호 추가 이름/u);
  assert.match(reply, /삭제: 상세 번호 삭제 이름/u);
  assert.match(reply, /공통: 양식 복사 → 이름 추가·삭제 → 양식 전체 전송/u);
});

test("command and form predicates are byte-derived and behaviorally equal to V1", async () => {
  const canonical = evaluate(canonicalSource());
  const strict = evaluate(await readFile(artifactPath, "utf8"));
  const functions = [
    "isLolKCommand",
    "isRecruitCommand",
    "isScrimRecruitCommand",
    "isSeasonApplyFormMessage",
    "isPartyRecruitFormWithoutNumber",
    "isOperationFormMessage",
    "isManagedWorkflowMessage"
  ];
  const messages = [
    "5인파티",
    "/5인파티",
    "5인 파티 10",
    "구인현황",
    "/3ㅉ",
    "스크림구인",
    "/멸망전 스크림 현황 #2",
    "내전현황",
    "/전적 Sax0Ph0ne#99단굵묵",
    "랭킹",
    "📢 내전하실분 #1\n1.재현/M/M/TOP/SUP",
    "<외출>\n1. 이름 및 닉네임 :근열\n2. 외출기간 :삼일내로\n3. 외출사유 :휴식\n4. 외출범위 :소통방",
    "평범한 대화"
  ];
  for (const functionName of functions) {
    for (const message of messages) {
      assert.equal(strict[functionName](message), canonical[functionName](message), `${functionName}: ${message}`);
    }
  }
});

test("one public command performs one five-second signed gateway request without room binding", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  for (const room of ["K롤방 구인구직방", "K롤방 고객센터"]) {
    const strict = evaluate(artifact);
    assert.deepEqual(replyFor(strict, "5인파티", { room }), ["[V1 server reply]"]);
    assert.equal(strict.http.calls, 1);
    assert.equal(strict.http.url, "https://k-lol-gg.vercel.app/api/integrations/kakao/v4/commands");
    assert.equal(strict.http.timeout, 5000);
    assert.match(strict.http.headers["x-klol-signature"], /^v4=[a-f0-9]{64}$/u);
    assert.equal(strict.http.headers["x-klol-key-id"], "current");
    const body = JSON.parse(strict.http.body);
    assert.equal(body.profileId, "RECRUIT");
    assert.equal(body.text, "5인파티");
    assert.equal(body.protocol, "KLOL_KAKAO_V1_STRICT");
    assert.equal(body.responseFormat, "V1_SERVER_EXACT");
    assert.match(body.installationId, /^install-[a-f0-9]{32}$/u);
    assert.match(body.senderId, /^sender-user-[a-f0-9]{32}$/u);
    assert.match(body.eventId, /^event-log-[a-f0-9]{32}$/u);
  }
});

test("recoverable season rows reach the gateway once even with whitespace numbering and partial fields", async () => {
  const strict = evaluate(await readFile(artifactPath, "utf8"), {
    responseBody: { reply: "[참가 신청 반영]\n정상 1 · 확인 필요 1" },
  });
  const message = [
    "📢 내전하실분 #1",
    "》협곡",
    "》2026-09-12 21:00 시작",
    "*참가 신청 양식*",
    "이름/현티어/최고티어/주라인/부라인",
    "1 참가자/G/E/TOP, MID",
    "2. 이름만",
    "3.",
  ].join("\n");

  assert.deepEqual(replyFor(strict, message), ["[참가 신청 반영]\n정상 1 · 확인 필요 1"]);
  assert.equal(strict.http.calls, 1);
  assert.equal(JSON.parse(strict.http.body).text, message);
});

test("a complete empty season snapshot reaches the gateway once for authoritative cancellation", async () => {
  const lines = [
    "📢 내전하실분 #1",
    "》협곡",
    "》2026-09-12 20:00 시작 승리팀 랜덤 1인 스킨 증정",
    "👥 0/10명",
    "",
    "*참가 신청 양식*",
    "이름/현티어/최고티어/주라인/부라인",
    "EX) 1.지후/P/E/AD/MD",
    "",
    ...Array.from({ length: 10 }, (_, index) => `${index + 1}.`),
  ];
  const empty = lines.join("\n");
  for (const message of [empty, `/${empty}`, `／${empty}`]) {
    const strict = evaluate(await readFile(artifactPath, "utf8"), {
      responseBody: { reply: "[K-LOL.GG 내전 #1 명단 업데이트]\n제외: 재현\n현재: 0/10" },
    });
    assert.equal(strict.isCompleteEmptySeasonApplySnapshot(message), true);
    assert.deepEqual(replyFor(strict, message), ["[K-LOL.GG 내전 #1 명단 업데이트]\n제외: 재현\n현재: 0/10"]);
    assert.equal(strict.http.calls, 1);
    assert.equal(JSON.parse(strict.http.body).text, message.replace(/^／/u, "/"));
  }
});

test("empty-snapshot gate rejects incomplete forms and ordinary conversation", async () => {
  const complete = [
    "📢 내전하실분 #1",
    "》협곡",
    "》2026-09-12 20:00 시작",
    "👥 0/10명",
    "*참가 신청 양식*",
    "이름/현티어/최고티어/주라인/부라인",
    "EX) 1.지후/P/E/AD/MD",
    ...Array.from({ length: 10 }, (_, index) => `${index + 1}.`),
  ];
  const malformed = complete.filter((line) => line !== "10.").join("\n");
  for (const message of [malformed, "오늘 내전 모두 취소할까요?", "1.\n2.\n3."]) {
    const strict = evaluate(await readFile(artifactPath, "utf8"));
    assert.equal(strict.isCompleteEmptySeasonApplySnapshot(message), false, message.slice(0, 30));
    assert.equal(strict.isSeasonApplyCandidateMessage(message), false, message.slice(0, 30));
    assert.deepEqual(replyFor(strict, message), [], message.slice(0, 30));
    assert.equal(strict.http.calls, 0, message.slice(0, 30));
  }
  const strictMalformed = evaluate(await readFile(artifactPath, "utf8"));
  assert.equal(strictMalformed.isSeasonApplySnapshotEnvelope(malformed), true);
  assert.equal(strictMalformed.isPartyRecruitFormMessage(malformed), false);
  const doubleSlash = `//${complete.join("\n")}`;
  const strict = evaluate(await readFile(artifactPath, "utf8"));
  assert.equal(strict.isCompleteEmptySeasonApplySnapshot(doubleSlash), false);
});

test("clean-session imageDB input preserves the active V40 R2 no-reply and no-HTTP behavior", async () => {
  const canonical = evaluate(canonicalSource(), { settings: { KLOL_KAKAO_RECRUIT_SECRET: "r".repeat(32) } });
  const strict = evaluate(await readFile(artifactPath, "utf8"));
  const imageDB = { getImage: () => "base64-image" };
  assert.deepEqual(replyFor(strict, "사진", { imageDB }), replyFor(canonical, "사진", { imageDB }));
  assert.equal(strict.http.calls, 0);
});

test("all seven active text seams preserve V1 success and empty replies while failures use safe common notices", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  const replyCollector = () => {
    const values = [];
    return { values, replier: { reply: (value) => values.push(String(value)) } };
  };
  const runtimeFor = (responseStatus, responseBody) => {
    const runtime = evaluate(artifact, { responseStatus, responseBody });
    runtime.KLOL_V1_GATEWAY.beginRequest("log-matrix", "user-matrix", "재현");
    return runtime;
  };
  const failureNotice = (status, title) => status === 401
    ? `${title}\n요청 권한을 확인하지 못했습니다. 최신 전체 설치본인지 확인해 주세요.`
    : `${title}\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.`;

  for (const [status, body] of [[200, { reply: "정상 응답" }], [404, { reply: "도메인 오류" }], [401, { reply: "인증되지 않은 요청입니다." }], [500, { reply: "서버 처리 오류" }]]) {
    const search = runtimeFor(status, body);
    const searchReply = replyCollector();
    search.sendSearchPlayerCommand("전적 재현#KR1", "기능방", "재현", searchReply.replier);
    assert.deepEqual(searchReply.values, [status === 200 ? body.reply : failureNotice(status, "[전적 검색 오류]")], `search ${status}`);

    const openchat = runtimeFor(status, body);
    const openchatReply = replyCollector();
    openchat.sendOpenchatCommand("최근 재현#KR1", openchatReply.replier);
    assert.deepEqual(openchatReply.values, [status === 200 ? body.reply : failureNotice(status, "[전적/명령어 서버 오류]")], `openchat ${status}`);

    const seasonStatus = runtimeFor(status, body);
    assert.equal(seasonStatus.fetchSeasonRecruitStatusText("기능방", "내전현황", "재현"),
      status === 200 ? body.reply : failureNotice(status, "[내전현황 오류]"));

    const seasonApply = runtimeFor(status, body);
    const seasonApplyReply = replyCollector();
    seasonApply.handleSeasonApplyMessage("기능방", "📢 내전하실분 #1\n1.재현/M/M/TOP/SUP", "재현", seasonApplyReply.replier);
    assert.deepEqual(seasonApplyReply.values, [status === 200 ? body.reply : failureNotice(status, "[참가 신청 등록 오류]")], `season apply ${status}`);

    const party = runtimeFor(status, body);
    const partyReply = replyCollector();
    party.handlePartyRecruitApi("PARTY_SYNC", "구인방", "모집번호: #1\n1.재현", "재현", partyReply.replier, "구인구직 반영");
    assert.deepEqual(partyReply.values, [status === 200 ? body.reply : failureNotice(status, "[K-LOL.GG 구인구직 반영]")], `party ${status}`);

    const partyStatus = runtimeFor(status, body);
    assert.equal(partyStatus.fetchPartyRecruitStatusText(false, "구인현황", "구인방", "재현"),
      status === 200 ? body.reply : failureNotice(status, "[K-LOL.GG 구인구직 현황]"));

    const operation = runtimeFor(status, body);
    const operationReply = replyCollector();
    operation.handleOperationFormMessage("기능방", "<외출>\n1. 이름 및 닉네임 :재현\n2. 외출기간 :하루\n3. 외출사유 :휴식\n4. 외출범위 :소통방", "재현", operationReply.replier);
    assert.deepEqual(operationReply.values, [status === 200 ? body.reply : failureNotice(status, "[K-LOL.GG 운영 양식]")], `operation ${status}`);
  }

  const emptySearch = runtimeFor(200, {});
  const emptySearchReply = replyCollector();
  emptySearch.sendSearchPlayerCommand("전적 재현#KR1", "기능방", "재현", emptySearchReply.replier);
  assert.deepEqual(emptySearchReply.values, ["[전적 검색 서버 응답 확인 필요]\n서버 응답이 비어 있습니다."]);

  const emptyOpenchat = runtimeFor(200, {});
  const emptyOpenchatReply = replyCollector();
  emptyOpenchat.sendOpenchatCommand("최근 재현#KR1", emptyOpenchatReply.replier);
  assert.deepEqual(emptyOpenchatReply.values, ["[전적/명령어 서버 응답 확인 필요]\n서버 응답이 비어 있습니다."]);

  assert.equal(runtimeFor(200, {}).fetchSeasonRecruitStatusText("기능방", "내전현황", "재현"), "[내전현황]\n현황 응답이 비어 있습니다.");

  const emptySeasonApply = runtimeFor(200, {});
  const emptySeasonApplyReply = replyCollector();
  emptySeasonApply.handleSeasonApplyMessage("기능방", "📢 내전하실분 #1\n1.재현/M/M/TOP/SUP", "재현", emptySeasonApplyReply.replier);
  assert.deepEqual(emptySeasonApplyReply.values, ["[참가 신청 등록 서버 응답 확인 필요]\n서버 응답이 비어 있습니다."]);

  const emptyParty = runtimeFor(200, {});
  const emptyPartyReply = replyCollector();
  assert.equal(emptyParty.handlePartyRecruitApi("PARTY_SYNC", "구인방", "모집번호: #1\n1.재현", "재현", emptyPartyReply.replier, "구인구직 반영"), false);
  assert.deepEqual(emptyPartyReply.values, ["[K-LOL.GG 구인구직 반영]\n서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요."]);
  assert.equal(runtimeFor(200, {}).fetchPartyRecruitStatusText(false, "구인현황", "구인방", "재현"), "");

  const emptyOperation = runtimeFor(200, {});
  const emptyOperationReply = replyCollector();
  emptyOperation.handleOperationFormMessage("기능방", "<외출>\n1. 이름 및 닉네임 :재현\n2. 외출기간 :하루\n3. 외출사유 :휴식\n4. 외출범위 :소통방", "재현", emptyOperationReply.replier);
  assert.deepEqual(emptyOperationReply.values, ["[K-LOL.GG 운영 양식]\n서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요."]);
});

test("literal transport failures distinguish settings, input, and connection errors without exposing values", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  const replies = [];
  const replier = { reply: (value) => replies.push(String(value)) };
  const search = evaluate(artifact, { responseStatus: 401, responseBody: { code: "INVALID_SIGNATURE", reply: "인증되지 않은 요청입니다.", secret: "must-not-leak" } });
  search.KLOL_V1_GATEWAY.beginRequest("log-auth", "user-auth", "재현");
  search.sendSearchPlayerCommand("전적 재현#KR1", "기능방", "재현", replier);
  assert.equal(replies.pop(), "[K-LOL.GG 연결 설정 확인]\n봇 인증 정보를 확인할 수 없습니다. 관리자에게 문의해주세요.");

  const seasonWrongProfile = evaluate(artifact, { responseStatus: 403, responseBody: { code: "WRONG_PROFILE", reply: "인증되지 않은 요청입니다.", secret: "must-not-leak" } });
  seasonWrongProfile.KLOL_V1_GATEWAY.beginRequest("log-season-wrong-profile", "user-season-wrong-profile", "재현");
  seasonWrongProfile.handleSeasonApplyMessage("기능방", "📢 내전하실분 #1\n1.재현/M/M/TOP/SUP", "재현", replier);
  const seasonWrongProfileReply = replies.pop();
  assert.equal(seasonWrongProfileReply, "[K-LOL.GG 휴대폰 봇 업데이트 필요]\n휴대폰 봇 코드를 최신 전체 설치본으로 교체해 주세요.");
  assert.doesNotMatch(seasonWrongProfileReply, /must-not-leak|봇 인증 정보/u);

  const seasonStatusWrongProfile = evaluate(artifact, { responseStatus: 403, responseBody: { code: "WRONG_PROFILE", reply: "인증되지 않은 요청입니다.", secret: "must-not-leak" } });
  seasonStatusWrongProfile.KLOL_V1_GATEWAY.beginRequest("log-season-status-wrong-profile", "user-season-status-wrong-profile", "재현");
  const seasonStatusWrongProfileReply = seasonStatusWrongProfile.fetchSeasonRecruitStatusText("기능방", "내전현황", "재현");
  assert.equal(seasonStatusWrongProfileReply, "[K-LOL.GG 휴대폰 봇 업데이트 필요]\n휴대폰 봇 코드를 최신 전체 설치본으로 교체해 주세요.");
  assert.doesNotMatch(seasonStatusWrongProfileReply, /must-not-leak|봇 인증 정보/u);

  const openchat = evaluate(artifact, { responseStatus: 500, responseBody: { code: "SERVER_UNAVAILABLE", secret: "must-not-leak" } });
  openchat.KLOL_V1_GATEWAY.beginRequest("log-500", "user-500", "재현");
  openchat.sendOpenchatCommand("랭킹", replier);
  const safeFailure = replies.pop();
  assert.equal(safeFailure, "[전적/명령어 서버 오류]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
  assert.doesNotMatch(safeFailure, /must-not-leak|SERVER_UNAVAILABLE/u);

  const party = evaluate(artifact, { responseStatus: 401, responseBody: { code: "INVALID_SIGNATURE", statusCode: 401 } });
  party.KLOL_V1_GATEWAY.beginRequest("log-party-auth", "user-party-auth", "재현");
  party.handlePartyRecruitApi("PARTY_CREATE", "구인방", "5인파티", "재현", replier, "구인구직 생성");
  assert.equal(replies.pop(), "[K-LOL.GG 연결 설정 확인]\n봇 인증 정보를 확인할 수 없습니다. 관리자에게 문의해주세요.");

  const staleClock = evaluate(artifact, { responseStatus: 401, responseBody: { code: "KAKAO_V4_TIMESTAMP_STALE", reply: "인증되지 않은 요청입니다.", secret: "must-not-leak" } });
  staleClock.KLOL_V1_GATEWAY.beginRequest("log-stale-clock", "user-stale-clock", "재현");
  staleClock.handlePartyRecruitApi("PARTY_CREATE", "구인방", "5인파티", "재현", replier, "구인구직 생성");
  const staleClockReply = replies.pop();
  assert.equal(staleClockReply, "[K-LOL.GG 휴대폰 시간 확인]\n휴대폰 날짜와 시간을 자동으로 설정한 뒤 다시 시도해 주세요.");
  assert.doesNotMatch(staleClockReply, /must-not-leak|KAKAO_V4_TIMESTAMP_STALE/u);

  const partyStatusStaleClock = evaluate(artifact, { responseStatus: 401, responseBody: { code: "KAKAO_V4_TIMESTAMP_STALE", reply: "인증되지 않은 요청입니다.", secret: "must-not-leak" } });
  partyStatusStaleClock.KLOL_V1_GATEWAY.beginRequest("log-party-status-stale-clock", "user-party-status-stale-clock", "재현");
  const partyStatusStaleClockReply = partyStatusStaleClock.fetchPartyRecruitStatusText(false, "구인현황", "구인방", "재현");
  assert.equal(partyStatusStaleClockReply, "[K-LOL.GG 휴대폰 시간 확인]\n휴대폰 날짜와 시간을 자동으로 설정한 뒤 다시 시도해 주세요.");
  assert.doesNotMatch(partyStatusStaleClockReply, /must-not-leak|KAKAO_V4_TIMESTAMP_STALE/u);

  const unknownForbidden = evaluate(artifact, { responseStatus: 403, responseBody: { statusCode: 403, secret: "must-not-leak" } });
  unknownForbidden.KLOL_V1_GATEWAY.beginRequest("log-unknown-forbidden", "user-unknown-forbidden", "재현");
  unknownForbidden.handlePartyRecruitApi("PARTY_CREATE", "구인방", "5인파티", "재현", replier, "구인구직 생성");
  const unknownForbiddenReply = replies.pop();
  assert.equal(unknownForbiddenReply, "[K-LOL.GG 구인구직 생성]\n요청 권한을 확인하지 못했습니다. 최신 전체 설치본인지 확인해 주세요.");
  assert.doesNotMatch(unknownForbiddenReply, /must-not-leak|봇 인증 정보/u);

  const wrappedWrongProfile = evaluate(artifact, { responseStatus: 200, responseBody: { statusCode: 403, code: "WRONG_PROFILE", reply: "인증되지 않은 요청입니다.", secret: "must-not-leak" } });
  wrappedWrongProfile.KLOL_V1_GATEWAY.beginRequest("log-wrapped-wrong-profile", "user-wrapped-wrong-profile", "재현");
  wrappedWrongProfile.sendOpenchatCommand("랭킹", replier);
  const wrappedWrongProfileReply = replies.pop();
  assert.equal(wrappedWrongProfileReply, "[K-LOL.GG 휴대폰 봇 업데이트 필요]\n휴대폰 봇 코드를 최신 전체 설치본으로 교체해 주세요.");
  assert.doesNotMatch(wrappedWrongProfileReply, /must-not-leak|봇 인증 정보/u);

  const invalidParty = evaluate(artifact, { responseStatus: 400, responseBody: { code: "INVALID_FORM", secret: "must-not-leak" } });
  invalidParty.KLOL_V1_GATEWAY.beginRequest("log-party-invalid", "user-party-invalid", "재현");
  invalidParty.handlePartyRecruitApi("PARTY_CREATE", "구인방", "5인파티", "재현", replier, "구인구직 생성");
  const invalidPartyReply = replies.pop();
  assert.equal(invalidPartyReply, "[K-LOL.GG 구인구직 생성]\n입력 형식이 올바르지 않습니다. 양식을 확인한 뒤 다시 보내주세요.");
  assert.doesNotMatch(invalidPartyReply, /must-not-leak|INVALID_FORM/u);

  const operation = evaluate(artifact, { responseStatus: 403, responseBody: { code: "WRONG_PROFILE", reply: "인증되지 않은 요청입니다." } });
  operation.KLOL_V1_GATEWAY.beginRequest("log-operation-auth", "user-operation-auth", "재현");
  operation.handleOperationFormMessage("기능방", "<외출>\n1. 이름 및 닉네임 :재현\n2. 외출기간 :하루\n3. 외출사유 :휴식\n4. 외출범위 :소통방", "재현", replier);
  assert.equal(replies.pop(), "[K-LOL.GG 휴대폰 봇 업데이트 필요]\n휴대폰 봇 코드를 최신 전체 설치본으로 교체해 주세요.");

  const invalidOperation = evaluate(artifact, { responseStatus: 400, responseBody: { code: "INVALID_FORM", detail: "must-not-leak" } });
  invalidOperation.KLOL_V1_GATEWAY.beginRequest("log-operation-invalid", "user-operation-invalid", "재현");
  invalidOperation.handleOperationFormMessage("기능방", "<외출>\n1. 이름 및 닉네임 :재현\n2. 외출기간 :하루\n3. 외출사유 :휴식\n4. 외출범위 :소통방", "재현", replier);
  const invalidOperationReply = replies.pop();
  assert.equal(invalidOperationReply, "[K-LOL.GG 운영 양식]\n입력 형식이 올바르지 않습니다. 양식을 확인한 뒤 다시 보내주세요.");
  assert.doesNotMatch(invalidOperationReply, /must-not-leak|INVALID_FORM/u);

  const unavailableParty = evaluate(artifact, { responseStatus: 503, responseBody: { code: "SERVER_UNAVAILABLE", detail: "must-not-leak" } });
  unavailableParty.KLOL_V1_GATEWAY.beginRequest("log-party-503", "user-party-503", "재현");
  unavailableParty.handlePartyRecruitApi("PARTY_SYNC", "구인방", "모집번호: #1\n1.재현", "재현", replier, "구인구직 반영");
  const unavailablePartyReply = replies.pop();
  assert.equal(unavailablePartyReply, "[K-LOL.GG 구인구직 반영]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
  assert.doesNotMatch(unavailablePartyReply, /must-not-leak|SERVER_UNAVAILABLE/u);

  const timedOutOperation = evaluate(artifact, { executeError: new Error("SocketTimeoutException must-not-leak") });
  timedOutOperation.KLOL_V1_GATEWAY.beginRequest("log-operation-timeout", "user-operation-timeout", "재현");
  timedOutOperation.handleOperationFormMessage("기능방", "<외출>\n1. 이름 및 닉네임 :재현\n2. 외출기간 :하루\n3. 외출사유 :휴식\n4. 외출범위 :소통방", "재현", replier);
  const timedOutOperationReply = replies.pop();
  assert.equal(timedOutOperationReply, "[K-LOL.GG 운영 양식]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
  assert.doesNotMatch(timedOutOperationReply, /must-not-leak|SocketTimeoutException/u);
});

test("both V40 R2 image seams stay inactive for every transport outcome", async () => {
  const artifact = await readFile(artifactPath, "utf8");
  for (const status of [200, 204, 401, 403, 404, 500]) {
    const runtime = evaluate(artifact, { responseStatus: status, responseBody: { reply: "should not be used" } });
    const replies = [];
    const replier = { reply: (value) => replies.push(String(value)) };
    assert.equal(runtime.handleManagedImage("기능방", "재현", "base64", replier), false);
    assert.equal(runtime.replyManagedImageFallback("기능방", "재현", replier), false);
    assert.deepEqual(replies, []);
    assert.equal(runtime.http.calls, 0);
  }
});
