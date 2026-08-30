import fs from "node:fs";

const source = fs.readFileSync("KLOL_KAKAO_BOT_V40_GUIDED_HUB.js", "utf8");
const responseStart = source.indexOf("function response(");
const responseEnd = source.indexOf("\nfunction handleLolKCommand", responseStart);
const responseSource = source.slice(responseStart, responseEnd > responseStart ? responseEnd : source.length);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(responseStart >= 0, "response 함수를 찾을 수 없습니다.");
assert(responseSource.includes("handleSiteFirstManagedWorkflow(text, replier)"), "기존 관리 명령을 사이트로 보내는 분기가 최상위 response 함수에 없습니다.");
assert(responseSource.indexOf("handleSiteFirstManagedWorkflow(") < responseSource.indexOf("isSeasonApplyFormMessage(text)"), "기존 관리 명령은 기존 참가 신청보다 먼저 사이트로 분기해야 합니다.");
assert(!responseSource.includes("handleManagedWorkflowMessage(roomText"), "V40 텍스트 명령이 카카오 관리 API 쓰기를 직접 실행하면 안 됩니다.");
assert(responseSource.indexOf("imageDB.getImage()") < responseSource.indexOf('if (text == "")'), "텍스트가 없는 사진도 받도록 imageDB 처리가 빈 메시지 종료보다 앞서야 합니다.");
assert(responseSource.includes("imageDB.getImageBase64") && responseSource.includes("imageDB.getImageBitmap"), "단말별 사진 추출 대체 경로가 없습니다.");
assert(responseSource.includes("replyManagedImageFallback"), "사진 메시지의 원본을 읽지 못했을 때 사이트 대체 경로를 안내해야 합니다.");
assert(source.includes('/api/kakao/managed-forms') && source.includes('/api/kakao/image-receive'), "경고·내전 또는 이미지 API 주소가 없습니다.");
assert(source.includes('/matches/submit') && source.includes('publicCode'), "사이트 등록 연결과 레거시 내부 식별자 호환이 없습니다.");
assert(!source.includes('?code='), "카카오 신규 안내에 접수번호 URL이 남아 있습니다.");
assert(source.includes('/^\\/내전현황\\s+MR'), "기존 MR 명령을 사이트 현황으로 전환하는 호환 인식이 필요합니다.");
assert(source.includes('readPrivateBotSetting("KLOL_KAKAO_RECRUIT_SECRET")'), "인증값은 봇 DataBase에서 읽어야 합니다.");
assert(source.includes('(?:경고|경고등록)\\s+') && source.includes('(?:내전등록|결과등록|내전결과)\\s+'), "기존 경고·내전 결과 명령을 사이트로 전환하기 위한 인식이 필요합니다.");
assert(responseSource.indexOf("isGuidedRegistrationShortcut(text)") < responseSource.indexOf("isManagedWorkflowMessage(text)"), "번호 없는 등록·인증·현황 명령은 관리 API보다 먼저 사이트로 라우팅되어야 합니다.");
assert(source.includes('"requestId":') || source.includes('\\"requestId\\":'), "빠른 접수 재시도용 requestId가 관리 API 요청에 포함되어야 합니다.");
assert(source.includes('data.publicCode && data.sessionActive === true'), "서버가 활성화한 사진 세션만 봇에 저장해야 합니다.");
assert(source.includes('KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31'), "V40 사이트 우선 코드 버전이 아닙니다.");
assert(source.includes('isRegistrationHubCommand(text)') && source.includes('getRegistrationHubNotice()'), "초보자용 등록 센터 분기가 없습니다.");
assert(source.includes('WEB_ADMIN_DISCIPLINE_CREATE_URL') && source.includes('/admin/discipline/new'), "관리자 경고 등록 링크가 없습니다.");
assert(source.includes('WEB_DISCIPLINE_EVIDENCE_URL') && source.includes('/discipline/evidence'), "경고 사진 제출 링크가 없습니다.");
assert(source.includes('function handleSiteFirstManagedWorkflow'), "구형 코드·양식의 사이트 전환 안내가 없습니다.");

console.log("Kakao bot managed workflow routing checks passed.");
