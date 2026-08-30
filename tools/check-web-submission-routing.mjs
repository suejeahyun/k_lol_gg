import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const inhouseCreate = read("src/app/api/inhouse-results/submissions/route.ts");
const inhouseImage = read("src/app/api/inhouse-results/submissions/[publicCode]/images/route.ts");
const inhouseStatus = read("src/app/api/inhouse-results/submissions/[publicCode]/route.ts");
const inhousePage = read("src/app/(user)/matches/submit/InhouseResultSubmitClient.tsx");
const inhouseOwnership = read("src/lib/inhouse-result/ownership.ts");
const inhouseOwnerMigration = read("prisma/migrations/20260831183000_inhouse_submission_owner_account/migration.sql");
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
assert.match(inhouseImage, /isInhouseSubmissionOwner\(submission, access\.user\.userAccountId\)/, "웹 접수 사진은 정규 소유권 정책으로 작성자 또는 관리자만 수정해야 합니다.");
assert.match(inhouseStatus, /submission\.roomName !== "WEB"/, "카카오 접수 조회도 관리자에게만 허용해야 합니다.");
assert.match(inhouseStatus, /isInhouseSubmissionOwner\(submission, access\.user\.userAccountId\)/, "웹 접수 조회도 정규 소유권 정책을 사용해야 합니다.");
assert.match(inhouseCreate, /export async function GET\(\)/, "로그인 계정의 미완료 웹 접수를 자동 조회해야 합니다.");
assert.match(inhouseCreate, /submittedByUserAccountId: actor\.userAccountId/, "새 웹 접수는 정규 소유자 컬럼과 JSON에 함께 기록해야 합니다.");
assert.match(inhouseOwnership, /submittedByUserAccountId !== null[\s\S]*submittedByUserAccountId === userAccountId/, "정규 소유자 컬럼이 있으면 레거시 JSON보다 우선해야 합니다.");
assert.match(inhouseOwnership, /legacyInhouseSubmissionOwnerId/, "기존 접수를 위한 제한된 JSON 소유권 fallback이 필요합니다.");
assert.match(inhouseOwnerMigration, /parsedData[\s\S]*submittedByUserAccountId/, "기존 JSON 소유자 값을 정규 컬럼으로 보정해야 합니다.");
assert.match(inhouseOwnerMigration, /FOREIGN KEY[\s\S]*UserAccount/, "웹 접수 소유자 FK가 필요합니다.");
assert.match(inhouseImage, /InhouseResultSubmission[\s\S]*FOR UPDATE/, "동시 사진 업로드는 접수 행을 잠근 뒤 순번을 계산해야 합니다.");
assert.match(inhouseImage, /PENDING_REVIEW/, "필요 사진이 모두 등록되면 검토 대기로 전환해야 합니다.");
assert.match(inhousePage, /for \(const \[index, file\] of selectedFiles\.entries\(\)\)/, "여러 사진은 요청 한도를 위해 한 장씩 순차 전송해야 합니다.");
assert.match(inhousePage, /files\.length !== gameCount/, "새 접수는 세트 수와 사진 수가 같아야 합니다.");
assert.match(inhousePage, /fetch\("\/api\/inhouse-results\/submissions", \{ cache: "no-store" \}\)/, "사용자 번호 입력 없이 미완료 접수를 자동 조회해야 합니다.");
assert.doesNotMatch(inhousePage, /접수번호 복사|MR 접수번호|접수번호를 알려주세요/, "사용자 화면에 접수번호 입력·복사 UI를 노출하면 안 됩니다.");

assert.match(disciplineImage, /requireApprovedUser\(\)/, "경고 사진 업로드는 관리자도 현재 로그인한 사용자 본인으로 처리해야 합니다.");
assert.match(disciplineImage, /disciplineRecord:\s*disciplineRecordOwnerWhere\(user\)/, "경고 과제 조회부터 현재 로그인한 본인 소유권으로 제한해야 합니다.");
assert.match(disciplineImage, /isDisciplineRecordOwner\(current\.disciplineRecord, user\)/, "경고 사진 저장 트랜잭션에서도 본인 소유권을 다시 확인해야 합니다.");
assert.doesNotMatch(disciplineImage, /access\.type\s*===\s*"user"/, "사용자용 경고 사진 API에 관리자 소유권 우회를 두면 안 됩니다.");
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
