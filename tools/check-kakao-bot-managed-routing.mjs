import fs from "node:fs";

const source = fs.readFileSync("KLOL_KAKAO_BOT_RECRUIT_SPLIT_V32_FIXED.js", "utf8");
const responseStart = source.indexOf("function response(");
const responseEnd = source.indexOf("\nfunction handleLolKCommand", responseStart);
const responseSource = source.slice(responseStart, responseEnd > responseStart ? responseEnd : source.length);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(responseStart >= 0, "response 함수를 찾을 수 없습니다.");
assert(responseSource.includes("handleManagedWorkflowMessage(roomText || RECRUIT_ROOM_LABEL, text, senderText, replier)"), "관리 양식 분기가 최상위 response 함수에 없습니다.");
assert(responseSource.indexOf("handleManagedWorkflowMessage(") < responseSource.indexOf("isSeasonApplyFormMessage(text)"), "관리 양식은 기존 참가 신청보다 먼저 분기해야 합니다.");
assert(responseSource.indexOf("imageDB.getImage()") < responseSource.indexOf('if (text == "")'), "텍스트가 없는 사진도 받도록 imageDB 처리가 빈 메시지 종료보다 앞서야 합니다.");
assert(source.includes('/api/kakao/managed-forms') && source.includes('/api/kakao/image-receive'), "경고·내전 또는 이미지 API 주소가 없습니다.");
assert(source.includes('readPrivateBotSetting("KLOL_KAKAO_RECRUIT_SECRET")'), "인증값은 봇 DataBase에서 읽어야 합니다.");

console.log("Kakao bot managed workflow routing checks passed.");
