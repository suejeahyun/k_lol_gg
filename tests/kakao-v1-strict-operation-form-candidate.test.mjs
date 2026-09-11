import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const artifactPath = resolve(
  import.meta.dirname,
  "../integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js",
);

async function runtime() {
  const source = await readFile(artifactPath, "utf8");
  const stored = new Map();
  const databaseWrites = [];
  const context = vm.createContext({
    DataBase: {
      getDataBase(key) { return stored.get(String(key)) ?? ""; },
      setDataBase(key, value) {
        stored.set(String(key), String(value));
        databaseWrites.push({ key: String(key), value: String(value) });
      },
    },
    java: { util: { UUID: { randomUUID: () => ({ toString: () => "12345678-1234-1234-1234-123456789abc" }) } } },
    __databaseWrites: databaseWrites,
  });
  new vm.Script(source, { filename: artifactPath }).runInContext(context);
  return context;
}

test("V1-strict keeps completion diagnostics but routes incomplete operation-form candidates", async () => {
  const bot = await runtime();
  const incomplete = "<외출>\r\n１） 이 름 및 닉 네 임： 신청자/닉\r\n２） 외 출 기 간：\r\n３） 외 출 사 유：\r\n４） 외 출 범 위：";
  assert.equal(bot.isOperationFormCompleteMessage(incomplete), false);
  assert.equal(bot.isOperationFormMessage(incomplete), true);
  assert.equal(bot.detectOperationFormCandidateType(incomplete), "leaves");
});

test("V1-strict candidate routing ignores ordinary label discussion", async () => {
  const bot = await runtime();
  assert.equal(bot.isOperationFormMessage("외출기간은 나중에 정하고 외출범위도 의논할게요."), false);
  const prose = "건의 사유 를 같이 생각해요\n건의 내용 도 정리할게요";
  assert.equal(bot.isOperationFormMessage(prose), false);
  assert.equal(bot.detectOperationFormCandidateType(prose), "");
  assert.equal(bot.canonicalizeOperationCandidateForGateway(prose), prose);
  assert.equal(bot.isOperationFormMessage(`메모: 일반 대화\n${prose}`), false);
  assert.equal(bot.isOperationFormMessage("건의 사유:\n건의 내용:"), true);
});

test("V1-strict ordinary label discussion performs no request or local dedupe write", async () => {
  const bot = await runtime();
  const calls = [];
  const replies = [];
  bot.KLOL_V1_GATEWAY.beginRequest = () => {};
  bot.KLOL_V1_GATEWAY.send = () => {
    calls.push("unexpected");
    return { ok: true, status: 200, body: { reply: "unexpected" } };
  };
  bot.response(
    "K롤방 고객센터",
    "건의 사유 를 같이 생각해요\n건의 내용 도 정리할게요",
    "홍길동",
    true,
    { reply: (value) => replies.push(String(value)) },
    null,
    "com.xfl.msgbot",
    false,
    "log-operation-prose",
    "channel-operation-prose",
    "user-operation-prose",
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(replies, []);
  assert.deepEqual(bot.__databaseWrites, []);
});

test("V1-strict accepts standalone wrapper titles but ignores wrappers embedded in prose", async () => {
  const bot = await runtime();
  for (const [wrapper, formType] of [
    ["&lt;지인&gt;", "friends"],
    ["<건의>", "suggestions"],
    ["&lt;모임&gt;", "meetups"],
    ["<정모>", "meetups"],
    ["&lt;외출&gt;", "leaves"],
  ]) {
    assert.equal(bot.detectOperationFormCandidateType(wrapper), formType, wrapper);
    assert.equal(bot.detectOperationFormCandidateType(`▶ ${wrapper}`), formType, `bullet:${wrapper}`);
    assert.equal(bot.detectOperationFormCandidateType(`１） ${wrapper}`), formType, `number:${wrapper}`);
    assert.equal(bot.detectOperationFormCandidateType(`공지에 ${wrapper}이라고 적어 주세요.`), "", `prose:${wrapper}`);
  }

  const calls = [];
  bot.KLOL_V1_GATEWAY.beginRequest = () => {};
  bot.KLOL_V1_GATEWAY.send = () => {
    calls.push("unexpected");
    return { ok: true, status: 200, body: { reply: "unexpected" } };
  };
  bot.response(
    "K롤방 고객센터",
    "공지에 &lt;외출&gt;이라고 적어 주세요.",
    "홍길동",
    true,
    { reply() {} },
    null,
    "com.xfl.msgbot",
    false,
    "log-operation-wrapper-prose",
    "channel-operation-wrapper-prose",
    "user-operation-wrapper-prose",
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(bot.__databaseWrites, []);
});

test("V1-strict response forwards one incomplete form request to the FEATURES gateway", async () => {
  const bot = await runtime();
  const calls = [];
  const replies = [];
  bot.KLOL_V1_GATEWAY.beginRequest = () => {};
  bot.KLOL_V1_GATEWAY.send = (profileId, text, sender) => {
    calls.push({ profileId, text, sender });
    return { ok: false, status: 400, body: { reply: "[K-LOL.GG 양식 필드 누락]\n필수 항목을 확인해 주세요: 건의 내용" } };
  };
  bot.response(
    "K롤방 고객센터",
    "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용:",
    "홍길동",
    true,
    { reply: (value) => replies.push(String(value)) },
    null,
    "com.xfl.msgbot",
    false,
    "log-operation-incomplete",
    "channel-operation-incomplete",
    "user-operation-incomplete",
  );
  assert.deepEqual(calls, [{
    profileId: "FEATURES",
    text: "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용:",
    sender: "홍길동",
  }]);
  assert.deepEqual(replies, ["[K-LOL.GG 양식 필드 누락]\n필수 항목을 확인해 주세요: 건의 내용"]);
});

test("V1-strict canonicalizes tolerant label spelling before gateway classification", async () => {
  const bot = await runtime();
  const calls = [];
  bot.KLOL_V1_GATEWAY.beginRequest = () => {};
  bot.KLOL_V1_GATEWAY.send = (profileId, text) => {
    calls.push({ profileId, text });
    return { ok: true, status: 200, body: { reply: "접수" } };
  };
  bot.response(
    "K롤방 고객센터",
    "１） 본 인 이 름 및 닉 네 임： 홍길동/테스터\r\n２＼． 건 의 사 유： 편의성\r\n３） 건 의 내 용： 개선",
    "홍길동",
    true,
    { reply() {} },
    null,
    "com.xfl.msgbot",
    false,
    "log-operation-tolerant",
    "channel-operation-tolerant",
    "user-operation-tolerant",
  );
  assert.deepEqual(calls, [{
    profileId: "FEATURES",
    text: "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 개선",
  }]);
});
