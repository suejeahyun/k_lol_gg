import assert from "node:assert/strict";
import fs from "node:fs";
import {
  currentDisciplineEvidence,
  currentDisciplineEvidenceCount,
} from "../src/lib/discipline/evidence-batch";
import {
  disciplineRecordOwnerWhere,
  isDisciplineRecordOwner,
} from "../src/lib/discipline/ownership";

const reviewedAt = new Date("2026-08-30T12:00:00.000Z");
const evidence = [
  { id: 1, submittedAt: new Date("2026-08-30T11:59:59.999Z") },
  { id: 2, submittedAt: reviewedAt },
  { id: 3, submittedAt: new Date("2026-08-30T12:00:00.001Z") },
  { id: 4, submittedAt: new Date("2026-08-30T12:05:00.000Z") },
];

assert.equal(currentDisciplineEvidenceCount(evidence, null), 4, "첫 제출은 모든 증빙을 계산해야 합니다.");
assert.deepEqual(
  currentDisciplineEvidence(evidence, reviewedAt).map((item) => item.id),
  [3, 4],
  "반려 시각보다 나중에 제출된 증빙만 재제출 묶음이어야 합니다.",
);

const owner = { userAccountId: 17, playerId: 41 };
assert.equal(isDisciplineRecordOwner({ userAccountId: 17, playerId: null }, owner), true, "계정 ID가 같은 징계는 본인 기록이어야 합니다.");
assert.equal(isDisciplineRecordOwner({ userAccountId: null, playerId: 41 }, owner), true, "계정 ID가 없는 레거시 기록만 연결 플레이어로 보완해야 합니다.");
assert.equal(isDisciplineRecordOwner({ userAccountId: 99, playerId: 41 }, owner), false, "다른 계정 ID가 명시된 기록은 플레이어가 같아도 노출하면 안 됩니다.");
assert.equal(isDisciplineRecordOwner({ userAccountId: null, playerId: 99 }, owner), false, "다른 플레이어의 레거시 기록은 노출하면 안 됩니다.");
assert.deepEqual(
  disciplineRecordOwnerWhere(owner),
  { OR: [{ userAccountId: 17 }, { userAccountId: null, playerId: 41 }] },
  "화면 조회와 API 소유권 보완 규칙이 같아야 합니다.",
);

const managedForms = fs.readFileSync("src/app/api/kakao/managed-forms/route.ts", "utf8");
const imageReceive = fs.readFileSync("src/app/api/kakao/image-receive/route.ts", "utf8");
const adminTask = fs.readFileSync("src/app/api/admin/discipline-tasks/[id]/route.ts", "utf8");
const accountPage = fs.readFileSync("src/app/(user)/account/page.tsx", "utf8");
const mobileMePage = fs.readFileSync("src/app/app/me/page.tsx", "utf8");
const evidencePage = fs.readFileSync("src/app/(user)/discipline/evidence/page.tsx", "utf8");
const evidenceUpload = fs.readFileSync("src/app/api/discipline/tasks/[publicCode]/evidence/route.ts", "utf8");
const evidenceClient = fs.readFileSync("src/app/(user)/discipline/evidence/DisciplineEvidenceSubmitClient.tsx", "utf8");
const recordCreateClient = fs.readFileSync("src/components/admin/DisciplineRecordCreateClient.tsx", "utf8");
const workflowClient = fs.readFileSync("src/components/admin/DisciplineWorkflowClient.tsx", "utf8");
const taskHandoff = fs.readFileSync("src/components/admin/DisciplineTaskHandoff.tsx", "utf8");

assert.match(managedForms, /currentDisciplineEvidenceCount/, "카카오 현황·인증도 현재 제출 묶음을 계산해야 합니다.");
assert.doesNotMatch(managedForms, /_count\.evidence/, "카카오 현황·인증에서 전체 증빙 수를 사용하면 안 됩니다.");
assert.match(managedForms, /REQUIRED:\s*"사진 제출 필요"/, "카카오 경고 현황은 신규 과제 상태를 한글로 안내해야 합니다.");
assert.match(imageReceive, /currentDisciplineEvidenceCount/, "카카오 사진 수신도 현재 제출 묶음을 계산해야 합니다.");
assert.match(adminTask, /claimedGameCount:\s*0/, "반려 시 새 제출 묶음 진행률을 초기화해야 합니다.");
assert.match(adminTask, /submittedAt:\s*null/, "반려 시 이전 제출 완료 시각을 초기화해야 합니다.");
assert.match(accountPage, /disciplineRecordOwnerWhere/, "내정보는 본인 징계만 조회해야 합니다.");
assert.match(accountPage, /isActive:\s*true/, "내정보 요약은 활성 징계만 표시해야 합니다.");
assert.match(accountPage, /const isExpired = Boolean\(task && hasPendingUpload/, "검토 대기 과제를 제출 기한 만료로 잘못 안내하면 안 됩니다.");
assert.match(accountPage, /href="\/discipline\/evidence">경고 차감 사진 제출/, "PC 내정보의 징계 통계 버튼은 본인 사진 제출 동선으로 교체해야 합니다.");
assert.doesNotMatch(accountPage, /discipline\/evidence\?code=|task\.publicCode/, "PC 내정보에 WR 코드나 코드 쿼리를 노출하면 안 됩니다.");
assert.match(mobileMePage, /내 경고 현황/, "모바일 내정보에도 본인 경고 현황을 표시해야 합니다.");
assert.match(mobileMePage, /disciplineRecordOwnerWhere/, "모바일 내정보도 본인 징계만 조회해야 합니다.");
assert.match(mobileMePage, /TASK_STATUS_LABELS/, "모바일 내정보도 경고 차감 상태를 한글로 표시해야 합니다.");
assert.match(mobileMePage, /반려 사유:\s*\{task\.reviewNote\}/, "모바일 내정보도 경고 차감 반려 사유를 표시해야 합니다.");
assert.match(mobileMePage, /caption="경고 차감 사진 제출" captionHref="\/discipline\/evidence"/, "모바일 내정보에서도 본인 사진 제출 화면으로 이동할 수 있어야 합니다.");
assert.doesNotMatch(mobileMePage, /discipline\/evidence\?code=|task\.publicCode/, "모바일 내정보에 WR 코드나 코드 쿼리를 노출하면 안 됩니다.");
assert.match(evidencePage, /disciplineRecord:\s*disciplineRecordOwnerWhere\(user\)/, "사진 제출 화면은 관리자 역할도 현재 로그인한 본인 과제만 조회해야 합니다.");
assert.doesNotMatch(evidencePage, /user\.role\s*===\s*"ADMIN"|user\.role\s*===\s*"SUPER_ADMIN"/, "사용자 사진 제출 화면에서 관리자 전체 조회를 허용하면 안 됩니다.");
assert.match(evidencePage, /dueAt:\s*\{ gt: now \}/, "만료된 과제를 사진 제출 선택 목록에서 제외해야 합니다.");
assert.match(evidencePage, /publicCode: safeCode[\s\S]*listedTasks\.slice\(0, 19\)/, "기존 코드 링크 대상이 기본 조회 상한 밖이어도 본인 과제를 정확히 불러와야 합니다.");
assert.match(evidenceUpload, /requireApprovedUser\(\)/, "사진 업로드 API는 관리자도 현재 로그인 사용자로 처리해야 합니다.");
assert.match(evidenceUpload, /disciplineRecord:\s*disciplineRecordOwnerWhere\(user\)/, "사진 업로드 API 조회부터 본인 소유권으로 제한해야 합니다.");
assert.match(evidenceUpload, /isDisciplineRecordOwner\(current\.disciplineRecord, user\)/, "사진 저장 트랜잭션에서도 본인 소유권을 다시 확인해야 합니다.");
assert.doesNotMatch(evidenceClient, /files\.length\s*!==\s*remaining/, "사이트는 남은 사진 전부를 한 번에 강제하면 안 됩니다.");
assert.match(evidenceClient, /files\.length\s*===\s*0/, "사이트는 빈 제출을 막아야 합니다.");
assert.match(evidenceClient, /files\.length\s*>\s*remaining/, "사이트는 남은 수량을 초과한 제출을 막아야 합니다.");
assert.match(evidenceClient, /나중에 이어서 제출할 수 있습니다/, "사이트는 부분 제출 후 이어서 제출할 수 있음을 안내해야 합니다.");
assert.match(evidenceClient, /taskReason/, "경고 과제는 접수번호 대신 사유가 보이는 카드로 선택해야 합니다.");
assert.match(evidenceClient, /url\.searchParams\.delete\("code"\)/, "기존 코드 링크를 선택에만 사용한 뒤 주소에서 제거해야 합니다.");
assert.doesNotMatch(evidenceClient, /\$\{selected\.publicCode\}\s*사진|>\s*\{task\.publicCode\}\s*</, "사용자 안내와 카드에 WR 코드를 출력하면 안 됩니다.");
assert.match(evidenceClient, /initialTasks\.length === 1 \? initialTasks\[0\]\?\.publicCode : ""/, "여러 과제가 있으면 사용자가 명시적으로 선택하기 전 업로드 대상을 정하면 안 됩니다.");
assert.match(recordCreateClient, /일반 경고 · 10판/, "관리자 직접 등록에 일반 경고 빠른 프리셋이 있어야 합니다.");
assert.match(recordCreateClient, /내전 경고 · 15판/, "관리자 직접 등록에 내전 경고 빠른 프리셋이 있어야 합니다.");
assert.match(recordCreateClient, /DisciplineTaskHandoff/, "관리자 직접 등록 직후 번호 없는 사이트 제출 안내를 표시해야 합니다.");
assert.match(workflowClient, /DisciplineTaskHandoff/, "카카오 접수 승인 직후 번호 없는 사이트 제출 안내를 표시해야 합니다.");
assert.match(taskHandoff, /const sitePath = "\/discipline\/evidence"/, "인계 카드는 로그인 계정 기반 고정 제출 경로를 사용해야 합니다.");
assert.doesNotMatch(taskHandoff, /인증번호:|WR 코드|\/인증 \$\{|evidence\?code=/, "인계 카드에서 WR 번호와 번호 기반 링크를 노출하면 안 됩니다.");
assert.match(taskHandoff, /navigator\.clipboard|execCommand\("copy"\)/, "번호 없는 대상자 안내를 복사할 수 있어야 합니다.");

console.log("Discipline evidence batch checks passed.");
