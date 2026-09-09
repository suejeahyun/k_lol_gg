import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const contractPath = resolve(root, "integrations/messengerbot-r/command-parity-contract.json");
const compatibilityPath = resolve(root, "integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V1_COMPAT.js");

async function loadContract() {
  return JSON.parse(await readFile(contractPath, "utf8"));
}

async function loadCompatibility() {
  const context = vm.createContext({ module: { exports: {} } });
  new vm.Script(await readFile(compatibilityPath, "utf8"), { filename: compatibilityPath }).runInContext(context);
  return context.module.exports;
}

test("자동 수집한 전체 명령 계약은 slash/무슬래시를 하나의 canonical command로 만든다", async () => {
  const [contract, compatibility] = await Promise.all([loadContract(), loadCompatibility()]);
  const uniqueNames = new Set(contract.commands.map(({ domain, name }) => `${domain}:${name}`));
  const uniqueSamples = new Set(contract.commands.map(({ sample }) => sample));
  assert.equal(uniqueNames.size, contract.commands.length, "명령 계약의 domain:name은 중복될 수 없다");
  assert.equal(uniqueSamples.size, contract.commands.length, "명령 계약의 실행 예시는 중복될 수 없다");
  assert.ok(contract.commands.length >= 90, "V1/V2 공개 명령과 별칭 전체를 계약에 포함해야 한다");

  for (const { domain, name, sample } of contract.commands) {
    assert.equal(compatibility.canonicalCommandText(sample), sample, `${domain}:${name}: 무슬래시`);
    assert.equal(compatibility.canonicalCommandText(`  /${sample}`), sample, `${domain}:${name}: slash`);
    assert.equal(compatibility.canonicalCommandText(`／${sample}`), sample, `${domain}:${name}: 전각 slash`);
  }
});

test("V1 호환 파서는 모든 공개 V1 명령에서 slash/무슬래시 분류를 동일하게 유지한다", async () => {
  const [contract, compatibility] = await Promise.all([loadContract(), loadCompatibility()]);
  for (const { domain, name, sample } of contract.commands.filter(({ domain }) => domain !== "CORE")) {
    const plain = compatibility.classifyMessage(sample, "검증자", "2026-09-09");
    const slash = compatibility.classifyMessage(`/${sample}`, "검증자", "2026-09-09");
    assert.ok(plain, `${domain}:${name}: 명령 분류 누락`);
    assert.deepEqual(slash, plain, `${domain}:${name}: slash 분류 불일치`);
  }
});

test("canonical command 경계는 본문과 Riot ID를 보존하고 slash 오인식을 막는다", async () => {
  const compatibility = await loadCompatibility();
  const canonical = compatibility.canonicalCommandText;
  assert.equal(canonical("  /내전구인 협곡 2026-09-10 21:30 #2 10명  "), "내전구인 협곡 2026-09-10 21:30 #2 10명");
  assert.equal(canonical("/전적 별빛#KR1"), "전적 별빛#KR1");
  assert.equal(canonical("/"), "/");
  assert.equal(canonical("//명령어"), "//명령어");
  assert.equal(canonical("/ 명령어"), "/ 명령어");
  assert.equal(canonical("https://k-lol.gg/help"), "https://k-lol.gg/help");
  assert.equal(canonical("대화 중 /명령어를 적었습니다"), "대화 중 /명령어를 적었습니다");
  assert.equal(canonical("/명령어\u200b본문"), "명령어\u200b본문", "slash 외 본문 code point는 보존한다");
});
