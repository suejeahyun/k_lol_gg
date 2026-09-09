import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");

function createRuntime(source) {
  const values = new Map();
  const context = vm.createContext({
    DataBase: {
      getDataBase(key) { return values.get(String(key)) ?? ""; },
      setDataBase(key, value) { values.set(String(key), String(value)); },
    },
    java: {
      text: {
        SimpleDateFormat: function SimpleDateFormat() {
          this.setTimeZone = () => {};
          this.format = () => "2026-09-09";
        },
      },
      util: {
        Date: function JavaDate() {},
        TimeZone: { getTimeZone() { return {}; } },
      },
    },
  });
  vm.runInContext(source, context);
  assert.equal(typeof context.response, "function");
  return (message) => {
    const replies = [];
    context.response("V1 호환 검증방", message, "검증 관리자", true, {
      reply(value) { replies.push(String(value)); },
    }, null, "verification.package");
    return replies;
  };
}

test("휴대폰 압축본의 V1 무통신 명령은 읽기 쉬운 전체본과 동일하게 응답한다", async () => {
  const [complete, mobile] = await Promise.all([
    readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_COMPLETE.js"), "utf8"),
    readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js"), "utf8"),
  ]);
  const readableRuntime = createRuntime(complete);
  const mobileRuntime = createRuntime(mobile);
  for (const command of [
    "봇버전",
    "/도움말",
    "/구인도움말",
    "내전구인",
    "스크림구인",
    "스크림참가#1",
  ]) {
    assert.deepEqual(mobileRuntime(command), readableRuntime(command), command);
  }
});
