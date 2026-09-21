# R24 파티 양식 표시 변경 — 휴대폰 호환성

2026-09-21, Node.js v24.14.1의 기존 합성 MessengerBot VM으로 확인했다. 실제 휴대폰에 설치된 버전과 카카오톡 송수신은 **미확인**이다. 비밀 설치본을 읽거나 휴대폰 산출물을 수정하지 않았다.

## 확인된 범위

- 공개 R24: `KLOL_KAKAO_BOT_V40_R24_2026_09_20`
- 파일: `integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js`
- SHA-256: `b1ee39b0c48f925d2d3b39831bd720c4e82356fef999eb168b785d29fb7e85fe` — 이전 R24 QA와 동일.
- 안내줄과 코드 뒤 괄호가 없는 합성 양식에 대해 7변형 PASS: 빈 명단, 이름 1개 추가, CRLF, 앞에 단일 `/`, 저장 결과 문장 포함, 파티 제목 변경, 내전 헤더.
- 매 입력마다 HTTP 요청 1회·timeout 5,000ms, 입력 원문 그대로 전송, 서버 `reply` 문자열 그대로 출력. 파티는 `RECRUIT`, 내전은 `FEATURES`로 전송했다.
- `5인파티` 생성 명령의 서버 응답도 새 양식 그대로 출력했다.

코드 근거: 공개 산출물 `handleCopyRosterForm`(235행)은 헤더와 번호/포지션 슬롯을 감지하며 안내 문장이나 코드 뒤 괄호에 의존하지 않는다. `response`(1831행)는 이 처리를 기존 라우터보다 먼저 수행한다. `replyText`(183행)와 `handlePartyRecruitApi`(510행)는 서버 문자열을 출력한다. 따라서 **이미 R24를 사용하는 휴대폰은 이번 표시 변경 때문에 코드를 다시 교체할 필요가 없다.**

## R22 경계

Git `4482bc07`의 공개 R22(`KLOL_KAKAO_BOT_V40_R22_2026_09_18`, SHA-256 `283c758142df12ba015cd6eed2ba33f08310997834a2364888ed76f3919d3465`)도 생성 명령에 대한 새 서버 응답을 표시할 수 있다. 그러나 합성 빈 명단은 HTTP 요청이 없었고, 이름을 넣은 파티 명단은 **FEATURES로 잘못 분류**됐으며 연속 빈줄도 정규화됐다. 그러므로 R22의 복사 참가·사이트 저장까지 보장할 수 없다. 합성 HTTP 응답은 항상 200으로 설정되어 있으므로 R22가 응답을 출력했다는 사실은 서버 저장 성공을 뜻하지 않는다.

## 재현

저장소 루트 PowerShell에서 실행한다. 기존 테스트의 합성 런타임 함수만 읽어 사용하며 파일 생성, 산출물 재생성, 운영 API 호출은 하지 않는다. 아래 양식코드는 운영 코드가 아닌 합성 값이다.

```powershell
@'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import vm from 'node:vm';
const source = readFileSync('tests/kakao-v1-strict-messengerbot.test.mjs', 'utf8');
const harness = source.slice(source.indexOf('function makeRuntime('), source.indexOf('test("builder pins'));
const { evaluate, replyFor } = new Function('Buffer', 'createHash', 'createHmac', 'vm',
  harness + '; return { evaluate, replyFor };')(Buffer, createHash, createHmac, vm);
const path = 'integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js';
const current = readFileSync(path, 'utf8');
assert.equal(createHash('sha256').update(current).digest('hex'),
  'b1ee39b0c48f925d2d3b39831bd720c4e82356fef999eb168b785d29fb7e85fe');
const old = execFileSync('git', ['show', '4482bc07:' + path], { encoding: 'utf8' });
const form = '[파티 #1] 5인 파티 · 0/5명\n시작: 미정\n게임: 미정\n\n\n\n1.\n2.\n3.\n4.\n5.\n\n예비 1.\n\n양식코드: ABCDE-23456';
const named = form.replace('1.\n', '1. 참가자\n');
const variants = [form, named, named.replaceAll('\n', '\r\n'), '/' + named,
  '신청 저장: 참가자\n\n' + named, named.replace('5인 파티', '기타게임'),
  named.replace('[파티 #1] 5인 파티 · 0/5명', '[내전 #1] 0/10명')];
for (const [index, text] of variants.entries()) {
  const runtime = evaluate(current, { responseBody: { reply: form } });
  assert.deepEqual(replyFor(runtime, text), [form]);
  assert.equal(runtime.http.calls, 1);
  assert.equal(runtime.http.timeout, 5000);
  assert.equal(JSON.parse(runtime.http.body).text, text);
  assert.equal(JSON.parse(runtime.http.body).profileId, index === 6 ? 'FEATURES' : 'RECRUIT');
}
for (const artifact of [current, old]) {
  const runtime = evaluate(artifact, { responseBody: { reply: form } });
  assert.deepEqual(replyFor(runtime, '5인파티'), [form]);
  assert.equal(runtime.http.calls, 1);
}
const emptyOld = evaluate(old);
replyFor(emptyOld, form);
assert.equal(emptyOld.http.calls, 0);
const namedOld = evaluate(old, { responseBody: { reply: form } });
replyFor(namedOld, named);
assert.equal(namedOld.http.calls, 1);
assert.equal(JSON.parse(namedOld.http.body).profileId, 'FEATURES');
assert.notEqual(JSON.parse(namedOld.http.body).text, named);
console.log('PASS: R24 7 variants, unchanged server replies, R22 routing boundary');
'@ | node --input-type=module
```
