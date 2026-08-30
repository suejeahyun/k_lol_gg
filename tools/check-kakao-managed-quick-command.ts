import assert from "node:assert/strict";
import fs from "node:fs";
import { parseManagedQuickCommand } from "../src/lib/kakao/managed-quick-command";

function isInvalid(message: string) {
  const result = parseManagedQuickCommand(message);
  return result.matched && !result.ok;
}

assert.deepEqual(parseManagedQuickCommand("/경고 닉네임#KR1 일반"), {
  matched: true,
  ok: true,
  command: {
    kind: "DISCIPLINE",
    nickname: "닉네임",
    tag: "KR1",
    category: "GENERAL",
    evidenceCount: 0,
  },
});
assert.deepEqual(parseManagedQuickCommand("경고등록 닉네임＃KR1 내전 사진:2장"), {
  matched: true,
  ok: true,
  command: {
    kind: "DISCIPLINE",
    nickname: "닉네임",
    tag: "KR1",
    category: "INHOUSE",
    evidenceCount: 2,
  },
});
assert.deepEqual(parseManagedQuickCommand("/경고 띄어쓰기 닉네임#KR1 일반 사진3장"), {
  matched: true,
  ok: true,
  command: {
    kind: "DISCIPLINE",
    nickname: "띄어쓰기 닉네임",
    tag: "KR1",
    category: "GENERAL",
    evidenceCount: 3,
  },
});
assert.equal(isInvalid("/경고 닉네임 일반"), true);

assert.deepEqual(parseManagedQuickCommand("/결과등록 3세트 1회차 밸런스#2 메모:정상 종료"), {
  matched: true,
  ok: true,
  command: {
    kind: "INHOUSE_RESULT",
    gameCount: 3,
    seriesNumber: 1,
    teamBalanceDraftId: 2,
    note: "정상 종료",
  },
});
assert.deepEqual(parseManagedQuickCommand("내전등록 2 4회"), {
  matched: true,
  ok: true,
  command: {
    kind: "INHOUSE_RESULT",
    gameCount: 2,
    seriesNumber: 4,
    teamBalanceDraftId: null,
    note: "없음",
  },
});
assert.equal(isInvalid("/결과등록 3세트"), true);
assert.equal(isInvalid("/결과등록 2세트 3세트 1회차"), true);
assert.equal(isInvalid("/결과등록 3세트 1회차 2회차"), true);
assert.equal(isInvalid("/결과등록 3세트 1회차 #2 #3"), true);
assert.deepEqual(parseManagedQuickCommand("자유 대화"), { matched: false });

const managedFormSource = fs.readFileSync("src/lib/kakao/managed-forms.ts", "utf8");
assert.match(managedFormSource, /defaults\[field\.key\]/);
assert.match(managedFormSource, /unsupportedManagedRequiredFields/);
const routeSource = fs.readFileSync("src/app/api/kakao/managed-forms/route.ts", "utf8");
assert.match(routeSource, /parseManagedQuickCommand\(message\)/);
assert.match(routeSource, /message === "\/경고인증"/);
assert.match(routeSource, /message === "\/경고현황"/);
assert.match(routeSource, /message === "\/내전등록현황"/);
assert.match(routeSource, /ownedTasks\.length !== 1/);
assert.match(routeSource, /ownedCodes\.length !== 1/);
assert.match(routeSource, /ownedResults\.length !== 1/);
assert.match(routeSource, /sourceHashInput = requestId/);

console.log("Kakao managed quick command checks passed.");
