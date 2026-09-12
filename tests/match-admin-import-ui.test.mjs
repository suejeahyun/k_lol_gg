import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelPath = new URL("../src/app/(admin)/admin/matches/new/admin-import-panel.tsx", import.meta.url);
const reviewPath = new URL("../src/app/(admin)/admin/matches/submissions/[submissionId]/submission-review.tsx", import.meta.url);
const routePath = new URL("../src/app/api/admin/matches/import/route.ts", import.meta.url);
const logoutPath = new URL("../src/components/admin/admin-logout-button.tsx", import.meta.url);
const repositoryPath = new URL("../src/modules/matches/infrastructure/postgres-match-repository.ts", import.meta.url);

test("관리자 직접 가져오기는 파일·붙여넣기·비공개 미리보기·재시도 복구를 제공한다", async () => {
  const source = await readFile(panelPath, "utf8");
  assert.match(source, /<details className=\{`\$\{styles\.panel\} \$\{styles\.importPanel\}`\}>/);
  assert.match(source, /<summary className=\{styles\.importSummary\}>/);
  assert.match(source, /<span aria-hidden="true">펼치기<\/span>/);
  assert.doesNotMatch(source, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(source, /type="file"/);
  assert.match(source, /onPaste=\{onPaste\}/);
  assert.match(source, /Ctrl\/Cmd\+V/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /saveAdminImportRecovery/);
  assert.match(source, /비공개 업로드 다시 시도/);
  assert.match(source, /uploadResponse\.status === 409 \|\| uploadResponse\.status === 412/);
  assert.match(source, /planAdminImportUploadFailure/);
  assert.match(source, /setSameKeyReplayRequired\(true\)/);
  assert.match(source, /latestResponse\.ok/);
  assert.match(source, /api\/admin\/matches\/submissions\/\$\{created\.submissionId\}/);
  assert.match(source, /clearAdminImportRecovery\(\)/);
  assert.match(source, /\/admin\/matches\/submissions\/\$\{createdSubmissionId\}/);
  assert.doesNotMatch(source, /\/api\/matches\/import-lol-result/);
});

test("관리자 로그아웃은 가져오기 복구 namespace만 best-effort로 지운다", async () => {
  const source = await readFile(logoutPath, "utf8");
  assert.match(source, /clearAdminImportRecovery\(\);/);
  assert.ok(source.indexOf("clearAdminImportRecovery();") < source.indexOf('fetch("/api/admin/logout"'));
  assert.match(source, /if \(!response\.ok\)/);
});

test("직접 가져오기 API는 예약→bounded body→work gate→private finalize 순서를 지킨다", async () => {
  const source = await readFile(routePath, "utf8");
  const reserve = source.indexOf("prepareAdminImportImageUpload");
  const body = source.indexOf("readExactUploadBody(request");
  const gate = source.indexOf("getMatchImageWorkGate().acquire()");
  const finalize = source.indexOf("finalizeAdminImportImageUpload");
  assert.ok(reserve >= 0 && reserve < body && body < gate && gate < finalize);
  assert.match(source, /submission\.source !== "ADMIN"/);
  assert.doesNotMatch(source, /createMatch|publishMatch|approveSubmission/);
});

test("검토 UI는 fuzzy 자동 연결 없이 구조화 행별 사람 확인을 요구한다", async () => {
  const source = await readFile(reviewPath, "utf8");
  assert.match(source, /BoundedPicker/);
  assert.match(source, /원본 대조 확인/);
  assert.match(source, /OCR 닉네임은 플레이어 계정에 자동 연결하지 않습니다/);
  assert.match(source, /confirmedRows/);
  assert.match(source, /reviewedResult: \{ formulaVersion: "V1_COMPAT_1", games \}/);
  assert.doesNotMatch(source, /JSON\.parse\(reviewText\)/);
  assert.doesNotMatch(source, /검토 결과 JSON 미리보기/);
  assert.doesNotMatch(source, /OCR 후보 원문/);
  assert.doesNotMatch(source, />진행 초</);
  assert.match(source, /durationSeconds: game\.durationSeconds/u);
  assert.match(source, /durationSeconds: 1_800/u);
});

test("admin import cancellation is authorized only for ADMIN-source rows", async () => {
  const source = await readFile(repositoryPath, "utf8");
  const cancelStart = source.indexOf("async cancelSubmission(");
  const cancelEnd = source.indexOf("private async consumeUploadRateLimits", cancelStart);
  const cancel = source.slice(cancelStart, cancelEnd);
  assert.match(cancel, /envelope\.actor\.purpose === "ADMIN" && current\.source === "ADMIN"/);
  assert.match(cancel, /envelope\.actor\.purpose === "ACCOUNT"/);
  assert.match(cancel, /current\.ownerUserAccountId === envelope\.actor\.userAccountId/);
});
