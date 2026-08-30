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
assert.match(accountPage, /\/discipline\/evidence\?code=/, "제출 가능한 WR 과제는 사진 등록 화면으로 연결해야 합니다.");
assert.match(mobileMePage, /내 경고 현황/, "모바일 내정보에도 본인 경고 현황을 표시해야 합니다.");
assert.match(mobileMePage, /disciplineRecordOwnerWhere/, "모바일 내정보도 본인 징계만 조회해야 합니다.");
assert.match(mobileMePage, /TASK_STATUS_LABELS/, "모바일 내정보도 경고 차감 상태를 한글로 표시해야 합니다.");
assert.match(mobileMePage, /반려 사유:\s*\{task\.reviewNote\}/, "모바일 내정보도 경고 차감 반려 사유를 표시해야 합니다.");
assert.match(mobileMePage, /\/discipline\/evidence\?code=/, "모바일 내정보에서도 WR 사진 등록 화면으로 이동할 수 있어야 합니다.");
assert.match(evidenceUpload, /isDisciplineRecordOwner/, "사진 업로드 API도 화면과 같은 소유권 규칙을 적용해야 합니다.");
assert.doesNotMatch(evidenceClient, /files\.length\s*!==\s*remaining/, "사이트는 남은 사진 전부를 한 번에 강제하면 안 됩니다.");
assert.match(evidenceClient, /files\.length\s*===\s*0/, "사이트는 빈 제출을 막아야 합니다.");
assert.match(evidenceClient, /files\.length\s*>\s*remaining/, "사이트는 남은 수량을 초과한 제출을 막아야 합니다.");
assert.match(evidenceClient, /나중에 이어서 제출할 수 있습니다/, "사이트는 부분 제출 후 이어서 제출할 수 있음을 안내해야 합니다.");
assert.match(recordCreateClient, /일반 경고 · 10판/, "관리자 직접 등록에 일반 경고 빠른 프리셋이 있어야 합니다.");
assert.match(recordCreateClient, /내전 경고 · 15판/, "관리자 직접 등록에 내전 경고 빠른 프리셋이 있어야 합니다.");
assert.match(recordCreateClient, /DisciplineTaskHandoff/, "관리자 직접 등록 직후 WR 안내를 계속 표시해야 합니다.");
assert.match(workflowClient, /DisciplineTaskHandoff/, "카카오 접수 승인 직후 WR 안내를 계속 표시해야 합니다.");
assert.match(taskHandoff, /`\/인증 \$\{publicCode\}`/, "WR 인계 카드에 카카오 인증 명령이 있어야 합니다.");
assert.match(taskHandoff, /\/discipline\/evidence\?code=/, "WR 인계 카드에 사이트 제출 링크가 있어야 합니다.");
assert.match(taskHandoff, /navigator\.clipboard|execCommand\("copy"\)/, "WR 인계 카드는 안내 내용을 복사할 수 있어야 합니다.");

console.log("Discipline evidence batch checks passed.");
