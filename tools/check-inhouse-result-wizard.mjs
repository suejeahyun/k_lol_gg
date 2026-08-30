import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/app/(user)/matches/submit/InhouseResultSubmitClient.tsx",
  "utf8",
);
const page = fs.readFileSync("src/app/(user)/matches/submit/page.tsx", "utf8");

assert.match(source, /type WizardStep = 1 \| 2 \| 3/, "등록 화면은 세 단계 흐름을 사용해야 합니다.");
assert.match(source, /\["기본 정보", "결과 사진", "확인 · 완료"\]/, "새 접수 단계 안내가 필요합니다.");
assert.match(source, /\["자동 저장 찾음", "남은 사진", "확인 · 완료"\]/, "계정 자동 저장 재개 단계 안내가 필요합니다.");
assert.match(source, /continueFromInfo/, "정보 확인 뒤 사진 단계로 이동할 수 있어야 합니다.");
assert.match(source, /continueFromPhotos/, "사진 선택 뒤 최종 확인 단계로 이동할 수 있어야 합니다.");
assert.match(source, /selectedFiles\.slice\(index\)/, "업로드 실패 시 실패한 사진부터 재시도해야 합니다.");
assert.match(source, /loadActiveSubmissions/, "로그인 계정의 미완료 제출을 자동으로 불러와야 합니다.");
assert.match(source, /resumeSubmission/, "미완료 제출을 날짜와 회차로 골라 이어갈 수 있어야 합니다.");
assert.doesNotMatch(source, /navigator\.clipboard|MR 접수번호|접수번호 복사/, "접수번호 입력·복사 UI를 제거해야 합니다.");
assert.match(source, /오늘 날짜와 로그인 계정의 플레이어 이름/, "자동 입력값의 출처를 설명해야 합니다.");
assert.match(source, /aria-current=\{state === "current" \? "step"/, "현재 진행 단계를 보조기기에 알려야 합니다.");
assert.match(page, /처음 이용해도 약 1분이면 제출/, "첫 이용자를 위한 페이지 설명이 필요합니다.");

console.log("Inhouse result wizard checks passed.");
