import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("공개 구인 카드와 API DTO는 참여자 표시 정보만 노출한다", () => {
  const page = source("../src/app/(public)/(recruiting)/recruits/page.tsx");
  const dto = source("../src/modules/recruiting/domain/recruiting.ts");
  const help = source("../src/app/(public)/(recruiting)/help/recruits/page.tsx");
  const route = source("../src/app/api/recruits/route.ts");
  for (const token of ["party.members", "member.name", "member.position", "member.substitute", "참여자"]) assert.match(page, new RegExp(token.replace(".", "\\.")));
  assert.match(dto, /members: Object\.freeze\(party\.members\.map/);
  for (const forbidden of ["sourceRoomId:", "sourceSenderId:", "ownerUserAccountId:"]) {
    const projection = dto.slice(dto.indexOf("export function toPublicRecruitPartyDto"), dto.indexOf("export function transitionScrimRecruit"));
    assert.doesNotMatch(projection, new RegExp(forbidden));
  }
  assert.match(help, /참여자 표시 이름, 포지션과 예비 여부는 현재 모집 카드에 공개/);
  assert.match(help, /로그인 ID, 연락처, 방·발신자 식별값과 운영 메모는 공개하지 않습니다/);
  assert.match(route, /service\.listPublicFeed\(\)/);
  assert.match(route, /recruitingReadResponse/);
});

test("내전 등록·상세 UI는 경기 시간을 입력하거나 표시하지 않는다", () => {
  const editor = source("../src/app/(admin)/admin/matches/match-editor.tsx");
  const publicDetail = source("../src/app/(public)/(matches)/matches/[matchId]/page.tsx");
  const review = source("../src/modules/matches/domain/match-integrity-review.ts");
  assert.doesNotMatch(editor, /type="number"[^>]*(duration|시간)|진행 초|경기 시간/u);
  assert.doesNotMatch(publicDetail, /durationSeconds|분 \{game\.durationSeconds|경기 시간/u);
  assert.doesNotMatch(review, /경기 시간|game-\$\{game\.gameNumber\}-duration/u);
  assert.match(editor, /durationSeconds: game\.durationSeconds/u, "기존 저장값은 편집 저장 때 보존한다");
  assert.match(editor, /durationSeconds: 1_800/u, "신규 경기에는 내부 기본값을 사용한다");
});

test("이벤트 대회와 멸망전은 목록·필터·신청 CTA·관리 흐름을 독립 경로로 유지한다", () => {
  const lists = source("../src/app/(public)/(competitions)/competitions/competition-list-views.tsx");
  const entry = source("../src/app/(public)/(competitions)/competitions/page.tsx");
  const applications = source("../src/app/(public)/(applications)/applications/page.tsx");
  const eventAdmin = source("../src/app/(admin)/admin/progress/event/page.tsx");
  const destructionAdmin = source("../src/app/(admin)/admin/progress/destruction/page.tsx");
  assert.match(lists, /action="\/competitions\/events"/);
  assert.match(lists, /action="\/competitions\/destruction"/);
  assert.match(lists, /loadRuntimeEvent/);
  assert.match(lists, /loadRuntimeDestruction/);
  assert.match(entry, /permanentRedirect/);
  assert.match(applications, /type === "event" \? "\/competitions\/events" : "\/competitions\/destruction"/);
  assert.match(eventAdmin, /aria-current="page" href="\/admin\/progress\/event"/);
  assert.match(destructionAdmin, /aria-current="page" href="\/admin\/progress\/destruction"/);
});
