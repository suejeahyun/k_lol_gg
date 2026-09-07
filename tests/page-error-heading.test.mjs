import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("사용자·관리자 상세 화면은 저장소 오류 상태에서도 페이지 제목과 상태 의미를 유지한다", () => {
  const cases = [
    ["../src/app/(public)/account/page.tsx", "계정 정보를 불러오지 못했습니다."],
    ["../src/app/(admin)/admin/users/[userAccountId]/page.tsx", "계정 정보를 확인할 수 없습니다."],
    ["../src/app/(admin)/admin/discipline/[recordId]/page.tsx", "징계 상세를 불러오지 못했습니다."],
    ["../src/app/(admin)/admin/matches/[matchId]/page.tsx", "경기 데이터를 불러오지 못했습니다."],
    ["../src/app/(admin)/admin/matches/submissions/[submissionId]/page.tsx", "접수 데이터를 불러오지 못했습니다."],
  ];

  for (const [path, message] of cases) {
    const page = source(path);
    assert.match(page, new RegExp(`<h1>${message}</h1>`), path);
    assert.match(page, /role=(?:"(?:alert|status)"|\{[^}]+\})/, path);
  }
});

test("공용 미디어 편집 화면도 저장소 오류 상태에서 페이지 제목을 유지한다", () => {
  const page = source("../src/components/admin/media/admin-media-pages.tsx");
  assert.match(page, /<h1>콘텐츠를 불러오지 못했습니다\.<\/h1>/);
  assert.match(page, /role=\{result\.state === "error" \? "alert" : "status"\}/);
});
