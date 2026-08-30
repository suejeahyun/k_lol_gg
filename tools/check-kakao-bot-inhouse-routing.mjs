import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  "KLOL_KAKAO_BOT_V39_FAST_REGISTRATION.js",
  "utf8",
);

const requests = [];
const replies = [];
let apiResponseOverride = null;

function createConnection(url) {
  const request = { url, body: "" };
  const connection = {
    ignoreContentType() {
      return connection;
    },
    ignoreHttpErrors() {
      return connection;
    },
    header() {
      return connection;
    },
    timeout() {
      return connection;
    },
    requestBody(body) {
      request.body = String(body || "");
      return connection;
    },
    method() {
      return connection;
    },
    execute() {
      requests.push({ ...request });
      const parsedBody = JSON.parse(request.body || "{}");
      return {
        body() {
          return JSON.stringify(
            apiResponseOverride || {
              ok: true,
              reply: `[TEST] ${parsedBody.message || ""}`,
            },
          );
        },
        statusCode() {
          return 200;
        },
      };
    },
  };

  return connection;
}

const context = {
  console,
  DataBase: {
    getDataBase() {
      return "test-secret";
    },
    setDataBase() {},
  },
  org: {
    jsoup: {
      Connection: { Method: { POST: "POST" } },
      Jsoup: { connect: createConnection },
    },
  },
};

vm.runInNewContext(source, context, {
  filename: "KLOL_KAKAO_BOT_V39_FAST_REGISTRATION.js",
});

function runMessage(message) {
  requests.length = 0;
  replies.length = 0;

  context.response(
    "K롤방 테스트방",
    message,
    "테스트 사용자",
    true,
    {
      reply(text) {
        replies.push(String(text));
      },
    },
    { getImage: () => "" },
    "com.kakao.talk",
  );

  return {
    requests: [...requests],
    replies: [...replies],
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const commands = [
  "/내전구인",
  "/내전구인 #2",
  "/내전구인 협곡",
  "/내전구인구직 협곡",
  "/내전구인 칼바람 2026-08-28 21:00 #3 10명",
  "/내전구인 증바람",
  "/내전구인 지원하지않는종목",
];

for (const command of commands) {
  const result = runMessage(command);
  assert(
    result.requests.length === 1,
    `${command}: 내전 구인 API 호출이 ${result.requests.length}건입니다.`,
  );
  assert(
    result.requests[0].url.endsWith("/api/kakao/recruit/season-apply/status"),
    `${command}: 잘못된 API로 전달됐습니다.`,
  );
  const requestBody = JSON.parse(result.requests[0].body);
  assert(
    requestBody.message === command,
    `${command}: 원본 명령이 API에 보존되지 않았습니다.`,
  );
  assert(
    requestBody.room === "K롤방 테스트방" &&
      requestBody.sender === "테스트 사용자",
    `${command}: 방 또는 발신자 정보가 API 요청에서 달라졌습니다.`,
  );
  assert(
    result.replies.length === 1 && result.replies[0] === `[TEST] ${command}`,
    `${command}: API 응답이 카카오 답장으로 전달되지 않았습니다.`,
  );
}

const freeChat = runMessage("오늘 내전하실 분?");
assert(
  freeChat.requests.length === 0 && freeChat.replies.length === 0,
  "일반 대화가 내전 구인 명령으로 잘못 처리됐습니다.",
);

apiResponseOverride = {
  ok: false,
  reply: "[K-LOL.GG 내전현황]\n인증값이 올바르지 않습니다.",
};
const authFailure = runMessage("/내전구인 칼바람");
assert(
  authFailure.requests.length === 1,
  "인증 실패 응답을 확인하기 위한 API 호출이 발생하지 않았습니다.",
);
assert(
  authFailure.replies.length === 1 &&
    authFailure.replies[0].includes("인증값이 올바르지 않습니다.") &&
    !authFailure.replies[0].includes("협곡내전하실분"),
  "API 인증 오류가 협곡 기본 양식으로 잘못 대체됐습니다.",
);

apiResponseOverride = null;
context.KAKAO_RECRUIT_SECRET = "";
const missingSecret = runMessage("/내전구인 증바람");
assert(
  missingSecret.requests.length === 0,
  "봇 인증값이 없는데도 내전 구인 API를 호출했습니다.",
);
assert(
  missingSecret.replies.length === 1 &&
    missingSecret.replies[0].includes("KLOL_KAKAO_RECRUIT_SECRET"),
  "봇 인증값 누락 안내가 출력되지 않았습니다.",
);

console.log("Kakao bot inhouse routing checks passed.");
