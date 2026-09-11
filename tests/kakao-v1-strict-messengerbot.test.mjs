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
              return {
                statusCode: () => responseStatus,
                body: () => rawResponseText === undefined ? JSON.stringify(responseBody) : rawResponseText,
                header: () => ""
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
  runtime.response(
    options.room ?? "K롤방 구인구직방",
    message,
    options.sender ?? "재현",
    true,
    replier,
    options.imageDB ?? {},
    "com.kakao.talk",
    false,
    options.logId ?? "log-1",
    "channel",
    options.userHash ?? "user-hash"
  );
  return replies;
}

test("builder pins the canonical V1 hash and produces an ES5/Rhino-safe artifact", async () => {
  execFileSync(process.execPath, ["scripts/build-messengerbot-v1-strict.mjs"], { cwd: root });
  const canonical = canonicalSource();
  const artifact = await readFile(artifactPath, "utf8");
  const program = acorn.parse(artifact, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
  const findings = analyzeRhinoStatic(program);

  assert.equal(sha256(canonical), sourceSha256);
  assert.match(artifact, new RegExp(`KLOL_V1_SOURCE_SHA256 = "${sourceSha256}"`));
  assert.ok(artifact.length < 65_535, `artifact length: ${artifact.length}`);
  assert.equal((artifact.match(/function\s+response\s*\(/gu) ?? []).length, 1);
  assert.equal((artifact.match(/org\.jsoup\.Jsoup\.connect\s*\(/gu) ?? []).length, 1);
  assert.match(artifact, /\.timeout\(5000\)/u);
  assert.deepEqual(findings.statementCandidates, []);
  assert.deepEqual(findings.unsafeSequenceOperands, []);
  assert.deepEqual(findings.voidExpressions, []);
  assert.deepEqual(findings.bareAssignmentConditions, []);
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

test("all response-reachable non-transport V1 functions are present byte-for-byte", async () => {
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
    const expected = canonicalFunctions.get(name);
    const actualName = name === "response" ? "v1SourceResponse" : name;
    let actual = artifactFunctions.get(actualName);
    assert.ok(expected, `canonical function missing: ${name}`);
    assert.ok(actual, `artifact function missing: ${actualName}`);
    slices.push(actual);
    if (name === "response") actual = actual.replace(/^function v1SourceResponse\s*\(/u, "function response(");
    assert.equal(actual, expected, name);
  }
  assert.equal(sha256(slices.join("\n\n")), strict.KLOL_V1_EXTRACTED_SHA256);

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
    const expected = replyFor(canonical, item.message, { sender: item.sender });
    const actual = replyFor(strict, item.message, { sender: item.sender });
    assert.deepEqual(actual, expected, item.message);
  }
  assert.deepEqual(
    replyFor(strict, "봇버전"),
    ["[K-LOL.GG 카카오봇 코드 버전]\nKLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R5_2026_09_11"],
  );
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

test("clean-session imageDB input preserves the active V40 R2 no-reply and no-HTTP behavior", async () => {
  const canonical = evaluate(canonicalSource(), { settings: { KLOL_KAKAO_RECRUIT_SECRET: "r".repeat(32) } });
  const strict = evaluate(await readFile(artifactPath, "utf8"));
  const imageDB = { getImage: () => "base64-image" };
  assert.deepEqual(replyFor(strict, "사진", { imageDB }), replyFor(canonical, "사진", { imageDB }));
  assert.equal(strict.http.calls, 0);
});

test("all seven active text seams preserve the V1 success, empty, 404, auth, and 5xx branches", async () => {
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

  for (const [status, body] of [[200, { reply: "정상 응답" }], [404, { reply: "도메인 오류" }], [401, { reply: "인증되지 않은 요청입니다." }], [500, { reply: "서버 처리 오류" }]]) {
    const search = runtimeFor(status, body);
    const searchReply = replyCollector();
    search.sendSearchPlayerCommand("전적 재현#KR1", "기능방", "재현", searchReply.replier);
    assert.deepEqual(searchReply.values, [body.reply], `search ${status}`);

    const openchat = runtimeFor(status, body);
    const openchatReply = replyCollector();
    openchat.sendOpenchatCommand("최근 재현#KR1", openchatReply.replier);
    assert.deepEqual(openchatReply.values, [body.reply], `openchat ${status}`);

    const seasonStatus = runtimeFor(status, body);
    assert.equal(seasonStatus.fetchSeasonRecruitStatusText("기능방", "내전현황", "재현"),
      status === 200 ? body.reply : "[내전현황]\n현황을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.");

    const seasonApply = runtimeFor(status, body);
    const seasonApplyReply = replyCollector();
    seasonApply.handleSeasonApplyMessage("기능방", "📢 내전하실분 #1\n1.재현/M/M/TOP/SUP", "재현", seasonApplyReply.replier);
    assert.deepEqual(seasonApplyReply.values, [body.reply], `season apply ${status}`);

    const party = runtimeFor(status, body);
    const partyReply = replyCollector();
    party.handlePartyRecruitApi("PARTY_SYNC", "구인방", "모집번호: #1\n1.재현", "재현", partyReply.replier, "구인구직 반영");
    assert.deepEqual(partyReply.values, [body.reply], `party ${status}`);

    const partyStatus = runtimeFor(status, body);
    assert.equal(partyStatus.fetchPartyRecruitStatusText(false, "구인현황", "구인방", "재현"),
      status === 200 ? body.reply : "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.");

    const operation = runtimeFor(status, body);
    const operationReply = replyCollector();
    operation.handleOperationFormMessage("기능방", "<외출>\n1. 이름 및 닉네임 :재현\n2. 외출기간 :하루\n3. 외출사유 :휴식\n4. 외출범위 :소통방", "재현", operationReply.replier);
    assert.deepEqual(operationReply.values, [body.reply], `operation ${status}`);
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
  const search = evaluate(artifact, { responseStatus: 401, responseBody: { code: "INVALID_SIGNATURE", secret: "must-not-leak" } });
  search.KLOL_V1_GATEWAY.beginRequest("log-auth", "user-auth", "재현");
  search.sendSearchPlayerCommand("전적 재현#KR1", "기능방", "재현", replier);
  assert.equal(replies.pop(), "[전적 검색 인증 오류]\n봇 인증 정보를 확인해 주세요.\n상태코드: 401");

  const openchat = evaluate(artifact, { responseStatus: 500, responseBody: { code: "SERVER_UNAVAILABLE", secret: "must-not-leak" } });
  openchat.KLOL_V1_GATEWAY.beginRequest("log-500", "user-500", "재현");
  openchat.sendOpenchatCommand("랭킹", replier);
  const safeFailure = replies.pop();
  assert.equal(safeFailure, "[전적/명령어 서버 오류]\n상태코드: 500\n잠시 후 다시 시도해주세요.");
  assert.doesNotMatch(safeFailure, /must-not-leak|SERVER_UNAVAILABLE/u);

  const party = evaluate(artifact, { responseStatus: 401, responseBody: { statusCode: 401 } });
  party.KLOL_V1_GATEWAY.beginRequest("log-party-auth", "user-party-auth", "재현");
  party.handlePartyRecruitApi("PARTY_CREATE", "구인방", "5인파티", "재현", replier, "구인구직 생성");
  assert.equal(replies.pop(), "[K-LOL.GG 연결 설정 확인]\n봇 인증 정보를 확인할 수 없습니다. 관리자에게 문의해주세요.");

  const invalidParty = evaluate(artifact, { responseStatus: 400, responseBody: { code: "INVALID_FORM", secret: "must-not-leak" } });
  invalidParty.KLOL_V1_GATEWAY.beginRequest("log-party-invalid", "user-party-invalid", "재현");
  invalidParty.handlePartyRecruitApi("PARTY_CREATE", "구인방", "5인파티", "재현", replier, "구인구직 생성");
  const invalidPartyReply = replies.pop();
  assert.equal(invalidPartyReply, "[K-LOL.GG 구인구직 생성]\n입력 형식이 올바르지 않습니다. 양식을 확인한 뒤 다시 보내주세요.");
  assert.doesNotMatch(invalidPartyReply, /must-not-leak|INVALID_FORM/u);

  const operation = evaluate(artifact, { responseStatus: 403, responseBody: { code: "WRONG_PROFILE" } });
  operation.KLOL_V1_GATEWAY.beginRequest("log-operation-auth", "user-operation-auth", "재현");
  operation.handleOperationFormMessage("기능방", "<외출>\n1. 이름 및 닉네임 :재현\n2. 외출기간 :하루\n3. 외출사유 :휴식\n4. 외출범위 :소통방", "재현", replier);
  assert.equal(replies.pop(), "[K-LOL.GG 연결 설정 확인]\n봇 인증 정보를 확인할 수 없습니다. 관리자에게 문의해주세요.");

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
