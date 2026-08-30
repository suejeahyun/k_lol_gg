import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/kakao/kakao-stats-dashboard-data.ts", "utf8");

assert.doesNotMatch(
  source,
  /safeFindMany\(["']operationForm["']/,
  "존재하지 않는 operationForm Prisma delegate를 조회하면 안 됩니다.",
);

for (const delegate of [
  "kakaoFriendApplication",
  "kakaoSuggestionRequest",
  "kakaoMeetupRecord",
  "kakaoLeaveRequest",
  "destructionScrimRecruitLog",
  "disciplineSubmission",
  "inhouseResultSubmission",
  "kakaoInboundImage",
]) {
  assert.match(source, new RegExp(`safeFindMany\\(["']${delegate}["']`), `${delegate} 통계 소스가 필요합니다.`);
}

console.log("Kakao stats source checks passed.");
