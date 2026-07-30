import assert from "node:assert/strict";
import { parseKakaoOperationForm } from "../src/lib/kakao/operation-forms";

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

console.log("Kakao operation form parser checks passed.");
