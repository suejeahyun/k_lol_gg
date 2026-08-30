import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const inhouseCreate = read("src/app/api/inhouse-results/submissions/route.ts");
const inhouseImage = read("src/app/api/inhouse-results/submissions/[publicCode]/images/route.ts");
const inhouseStatus = read("src/app/api/inhouse-results/submissions/[publicCode]/route.ts");
const inhousePage = read("src/app/(user)/matches/submit/InhouseResultSubmitClient.tsx");
const disciplineImage = read("src/app/api/discipline/tasks/[publicCode]/evidence/route.ts");
const disciplineOwnership = read("src/lib/discipline/ownership.ts");
const disciplinePage = read("src/app/(user)/discipline/evidence/DisciplineEvidenceSubmitClient.tsx");
const managedForms = read("src/app/api/kakao/managed-forms/route.ts");
const requestGuard = read("src/lib/security/request-guard.ts");
const adminSubmissions = read("src/app/(admin)/admin/matches/submissions/page.tsx");

assert.match(inhouseCreate, /requireApprovedUserOrAdmin\(\)/, "내전 웹 접수는 승인된 로그인 계정만 생성해야 합니다.");
assert.match(inhouseCreate, /makeSourceMessageHash/, "내전 웹 접수의 중복 요청을 차단해야 합니다.");
assert.match(inhouseImage, /storePrivateImage/, "내전 웹 사진은 비공개 저장소를 사용해야 합니다.");
assert.match(inhouseImage, /submission\.roomName !== "WEB"/, "카카오에서 만든 내전 접수의 사이트 복구는 관리자만 허용해야 합니다.");
assert.match(inhouseImage, /submittedByUserAccountId !== access\.user\.userAccountId/, "웹에서 만든 내전 접수는 불변 계정 ID 기준으로 작성자 또는 관리자만 수정해야 합니다.");
assert.match(inhouseStatus, /submission\.roomName !== "WEB"/, "카카오 접수 조회도 관리자에게만 허용해야 합니다.");
assert.match(inhouseStatus, /submittedByUserAccountId !== access\.user\.userAccountId/, "웹 접수 조회도 불변 계정 ID로 소유권을 확인해야 합니다.");
assert.match(inhouseImage, /InhouseResultSubmission[\s\S]*FOR UPDATE/, "동시 사진 업로드는 접수 행을 잠근 뒤 순번을 계산해야 합니다.");
assert.match(inhouseImage, /PENDING_REVIEW/, "필요 사진이 모두 등록되면 검토 대기로 전환해야 합니다.");
assert.match(inhousePage, /for \(const \[index, file\] of selectedFiles\.entries\(\)\)/, "여러 사진은 요청 한도를 위해 한 장씩 순차 전송해야 합니다.");
assert.match(inhousePage, /files\.length !== gameCount/, "새 접수는 세트 수와 사진 수가 같아야 합니다.");

assert.match(disciplineImage, /isDisciplineRecordOwner\(task\.disciplineRecord, access\.user\)/, "일반 사용자는 공통 소유권 정책으로 본인 경고 차감 사진만 제출해야 합니다.");
assert.match(disciplineOwnership, /record\.userAccountId === owner\.userAccountId/, "경고 소유권은 불변 계정 ID 일치를 우선해야 합니다.");
assert.match(disciplineOwnership, /record\.userAccountId === null[\s\S]*record\.playerId === owner\.playerId/, "계정이 없는 과거 경고만 연결 플레이어 ID로 보완해야 합니다.");
assert.match(disciplineImage, /disciplineEvidence\.create/, "경고 차감 사진은 기존 증빙 모델에 연결해야 합니다.");
assert.match(disciplineImage, /DisciplineResolutionTask[\s\S]*FOR UPDATE/, "동시 경고 사진 업로드는 과제 행을 잠근 뒤 수량을 계산해야 합니다.");
assert.match(disciplineImage, /currentDisciplineEvidenceCount/, "반려 후에는 현재 재제출 묶음의 사진만 계산해야 합니다.");
assert.match(disciplineImage, /status:\s*"CANCELLED"/, "웹 업로드가 시작되면 카카오 사진 세션을 취소해 수량 의미를 분리해야 합니다.");
assert.match(disciplinePage, /files\.length === 0/, "경고 차감은 빈 사진 제출을 차단해야 합니다.");
assert.match(disciplinePage, /files\.length > remaining/, "경고 차감은 남은 사진 수를 초과한 제출을 차단해야 합니다.");

assert.match(requestGuard, /inhouse-results\/submissions/, "내전 웹 사진 업로드의 별도 요청 크기 제한이 필요합니다.");
assert.match(requestGuard, /discipline\/tasks/, "경고 웹 사진 업로드의 별도 요청 크기 제한이 필요합니다.");
assert.match(managedForms, /\/matches\/submit\?code=/, "카카오 내전 접수 응답에 사이트 대체 업로드 링크가 필요합니다.");
assert.match(managedForms, /kakaoImageReceiveSession\.upsert/, "중복 양식 전송 시 만료된 사진 세션을 재개해야 합니다.");
assert.match(adminSubmissions, /canStartRegistration/, "사진 미완료 접수에 수기 등록 버튼을 표시하면 안 됩니다.");

console.log("Web inhouse and discipline submission routing checks passed.");
