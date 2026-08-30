import assert from "node:assert/strict";
import { parseKakaoOperationForm } from "../src/lib/kakao/operation-forms";
import {
  createOperationFormSourceHash,
  getKstDateKey,
} from "../src/lib/kakao/operation-form-idempotency";

const discordInvite = `<디스코드초대>

1. 지인 이름 :지애
2. 지인 닉네임 :wjdwo1123
3. 이용기간: 특정(멸망전)
   - 선택 : 장기, 단기, 특정 게임(게임명적기)
4. 디스코드 닉네임 변경 : 지애
 * EX) 응지(머중지인)`;

assert.deepEqual(parseKakaoOperationForm(discordInvite), {
  type: "friends",
  friendName: "지애",
  friendNickname: "wjdwo1123",
  usageType: "특정 게임",
  gameName: "멸망전",
  discordNicknameChange: "지애",
  rawText: discordInvite,
});

const receivedAt = new Date("2026-08-30T12:00:00.000Z");
const sourceHash = createOperationFormSourceHash({
  type: "friends",
  rawText: discordInvite,
  roomName: "K롤방",
  sender: "테스터",
  receivedAt,
});

assert.equal(getKstDateKey(receivedAt), "2026-08-30");
assert.equal(sourceHash.length, 64);
assert.equal(
  sourceHash,
  createOperationFormSourceHash({
    type: "friends",
    rawText: discordInvite.replace(/\n/g, "\r\n"),
    roomName: " K롤방 ",
    sender: "테스터",
    receivedAt,
  }),
  "같은 날짜·방·발신자·양식은 줄바꿈과 여백 차이에도 같은 멱등 키여야 합니다.",
);
assert.notEqual(
  sourceHash,
  createOperationFormSourceHash({
    type: "friends",
    rawText: discordInvite,
    roomName: "K롤방",
    sender: "테스터",
    receivedAt: new Date("2026-08-31T12:00:00.000Z"),
  }),
  "다른 한국 날짜의 동일 양식은 새 요청으로 허용해야 합니다.",
);

console.log("Kakao operation form parser and idempotency checks passed.");
