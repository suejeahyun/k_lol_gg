import fs from "node:fs";

const source = fs.readFileSync("KLOL_KAKAO_BOT_V39_FAST_REGISTRATION.js", "utf8");
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
assert(responseSource.includes("imageDB.getImageBase64") && responseSource.includes("imageDB.getImageBitmap"), "단말별 사진 추출 대체 경로가 없습니다.");
assert(responseSource.includes("replyManagedImageFallback"), "사진 메시지의 원본을 읽지 못했을 때 사이트 대체 경로를 안내해야 합니다.");
assert(source.includes('/api/kakao/managed-forms') && source.includes('/api/kakao/image-receive'), "경고·내전 또는 이미지 API 주소가 없습니다.");
assert(source.includes('/matches/submit') && source.includes('publicCode'), "접수번호 기반 사이트 사진 등록 연결이 없습니다.");
assert(source.includes('/^\\/내전현황\\s+MR'), "MR 접수번호는 /내전현황 별칭으로도 조회할 수 있어야 합니다.");
assert(source.includes('readPrivateBotSetting("KLOL_KAKAO_RECRUIT_SECRET")'), "인증값은 봇 DataBase에서 읽어야 합니다.");
assert(source.includes('(?:경고|경고등록)\\s+') && source.includes('(?:내전등록|결과등록|내전결과)\\s+'), "경고·내전 결과 빠른 명령이 관리 API로 라우팅되어야 합니다.");
assert(source.includes('text == "/인증"') && source.includes('text == "/경고현황"') && source.includes('text == "/결과현황"'), "접수번호 생략 명령이 관리 API로 라우팅되어야 합니다.");
assert(source.includes('"requestId":') || source.includes('\\"requestId\\":'), "빠른 접수 재시도용 requestId가 관리 API 요청에 포함되어야 합니다.");
assert(source.includes('data.publicCode && data.sessionActive === true'), "서버가 활성화한 사진 세션만 봇에 저장해야 합니다.");

console.log("Kakao bot managed workflow routing checks passed.");
