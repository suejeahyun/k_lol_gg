import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  "KLOL_KAKAO_BOT_V40_GUIDED_HUB.js",
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
    post() {
      requests.push({ ...request });
      const parsedBody = JSON.parse(request.body || "{}");
      return {
        text() {
          return JSON.stringify(
            apiResponseOverride || {
              ok: true,
              reply: `[TEST] ${parsedBody.message || ""}`,
            },
          );
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
  filename: "KLOL_KAKAO_BOT_V40_GUIDED_HUB.js",
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

for (const command of ["/등록", "등록도움말"]) {
  const result = runMessage(command);
  assert(result.requests.length === 0, `${command}: 등록 센터가 서버 API를 호출했습니다.`);
  assert(
    result.replies.length === 1 &&
      result.replies[0].includes("쉬운 등록 센터") &&
      result.replies[0].includes("https://k-lol-gg.vercel.app/start") &&
      result.replies[0].includes("https://k-lol-gg.vercel.app/matches/submit") &&
      result.replies[0].includes("https://k-lol-gg.vercel.app/admin/discipline/new") &&
      result.replies[0].includes("https://k-lol-gg.vercel.app/discipline/evidence"),
    `${command}: 세 가지 웹 등록 동선이 한 화면에 안내되지 않았습니다.`,
  );
}

const guidedInhouse = runMessage("/내전등록");
assert(
    guidedInhouse.requests.length === 0 &&
    guidedInhouse.replies.length === 1 &&
    guidedInhouse.replies[0].includes("/matches/submit") &&
    guidedInhouse.replies[0].includes("진행 중인 제출을 자동으로 찾아") &&
    !guidedInhouse.replies[0].includes("/결과등록 3세트"),
  "/내전등록이 번호 없는 사이트 등록만 명확히 안내하지 않습니다.",
);

const guidedDiscipline = runMessage("/경고등록");
assert(
  guidedDiscipline.requests.length === 0 &&
    guidedDiscipline.replies.length === 1 &&
    guidedDiscipline.replies[0].includes("/admin/discipline/new") &&
    guidedDiscipline.replies[0].includes("관리자 로그인") &&
    guidedDiscipline.replies[0].includes("2차 인증") &&
    !guidedDiscipline.replies[0].includes("/경고 닉네임#태그"),
  "/경고등록이 사이트 관리자 인증 흐름만 명확히 안내하지 않습니다.",
);

const guidedEvidence = runMessage("/인증");
assert(
  guidedEvidence.requests.length === 0 &&
    guidedEvidence.replies.length === 1 &&
    guidedEvidence.replies[0].includes("/discipline/evidence") &&
    guidedEvidence.replies[0].includes("본인의 진행 과제만") &&
    !guidedEvidence.replies[0].includes("?code="),
  "/인증이 서버 접수 없이 본인 전용 사이트 링크를 안내하지 않습니다.",
);

const guidedWarningStatus = runMessage("/경고현황");
assert(
  guidedWarningStatus.requests.length === 0 &&
    guidedWarningStatus.replies[0].includes("/account#discipline") &&
    !guidedWarningStatus.replies[0].includes("WR"),
  "/경고현황이 접수번호 없이 내정보로 연결되지 않습니다.",
);

const guidedResultStatus = runMessage("/결과현황");
assert(
  guidedResultStatus.requests.length === 0 &&
    guidedResultStatus.replies[0].includes("/matches/submit") &&
    !guidedResultStatus.replies[0].includes("MR"),
  "/결과현황이 접수번호 없이 내 제출 화면으로 연결되지 않습니다.",
);

for (const command of ["/경고", "/경고인증", "/결과등록", "/내전결과", "/내전등록현황"]) {
  const siteOnlyAlias = runMessage(command);
  assert(
    siteOnlyAlias.requests.length === 0 &&
      siteOnlyAlias.replies.length === 1 &&
      siteOnlyAlias.replies[0].includes("https://k-lol-gg.vercel.app/") &&
      !siteOnlyAlias.replies[0].includes("접수번호:"),
    `${command}: 인자 없는 기존 별칭도 사이트 우선으로 전환되어야 합니다.`,
  );
}

const compatibleLegacyEvidence = runMessage("/인증 WR0123456789");
assert(
  compatibleLegacyEvidence.requests.length === 0 &&
    compatibleLegacyEvidence.replies[0].includes("/discipline/evidence") &&
    !compatibleLegacyEvidence.replies[0].includes("WR0123456789"),
  "기존 코드 포함 인증도 서버 쓰기 없이 번호 없는 사이트로 전환되어야 합니다.",
);

const compatibleQuickResult = runMessage("/결과등록 3세트 1회차");
assert(
  compatibleQuickResult.requests.length === 0 &&
    compatibleQuickResult.replies[0].includes("/matches/submit") &&
    !compatibleQuickResult.replies[0].includes("MR"),
  "기존 /결과등록 빠른 접수도 서버 쓰기 없이 사이트로 전환되어야 합니다.",
);

const compatibleLegacyForm = runMessage("[K-LOL.GG 내전 결과 등록 양식 v1]\n진행일: 2026-08-31");
assert(
  compatibleLegacyForm.requests.length === 0 &&
    compatibleLegacyForm.replies[0].includes("/matches/submit"),
  "붙여넣은 구형 내전 양식도 새 카카오 접수를 만들지 않고 사이트로 안내해야 합니다.",
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

const evidenceWithoutSecret = runMessage("/인증");
assert(
  evidenceWithoutSecret.requests.length === 0 &&
    evidenceWithoutSecret.replies.length === 1 &&
    evidenceWithoutSecret.replies[0].includes("/discipline/evidence") &&
    !evidenceWithoutSecret.replies[0].includes("KLOL_KAKAO_RECRUIT_SECRET"),
  "봇 인증값과 관계없이 /인증은 사이트 제출만 안내해야 합니다.",
);

console.log("Kakao bot inhouse routing checks passed.");
