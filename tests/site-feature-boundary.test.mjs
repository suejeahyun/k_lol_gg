import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("site feature access fails closed for missing or unreadable settings", () => {
  const access = source("../src/modules/operations/infrastructure/site-feature-access.ts");
  assert.match(access, /if \(!repository\) return "unavailable"/);
  assert.match(access, /catch \{\s*return "unavailable";/);
  assert.match(access, /state === "disabled" \? featureDisabled : settingsUnavailable/);
});

test("registration feature protects both its page and mutation before credential work", () => {
  const page = source("../src/app/(public)/signup/page.tsx");
  const route = source("../src/app/api/auth/signup/route.ts");
  assert.match(page, /readSiteFeatureState\("registrations"\)/);
  const featureIndex = route.indexOf('requireSiteFeature(request, "registrations")');
  assert.ok(featureIndex > 0);
  assert.ok(featureIndex < route.indexOf("readJsonBody(request"));
  assert.ok(featureIndex < route.indexOf("guardAccountOperationAttempt(request"));
});

test("match submission feature keeps reads available but guards every owner mutation", () => {
  const page = source("../src/app/(public)/(matches)/matches/submit/page.tsx");
  const create = source("../src/app/api/me/match-submissions/route.ts");
  const update = source("../src/app/api/me/match-submissions/[code]/route.ts");
  const upload = source("../src/app/api/me/match-submissions/[code]/images/route.ts");
  const cancel = source("../src/app/api/me/match-submissions/[code]/cancel/route.ts");
  assert.match(page, /readSiteFeatureState\("matchSubmissions"\)/);
  for (const route of [create, update, upload, cancel]) {
    assert.match(route, /requireSiteFeature\(request, "matchSubmissions"\)/);
  }
  const getBody = update.slice(update.indexOf("export async function GET"), update.indexOf("export async function PATCH"));
  assert.doesNotMatch(getBody, /requireSiteFeature/);
});

test("Kakao help feature controls its public guide without exposing configuration", () => {
  const page = source("../src/app/(public)/(recruiting)/help/kakao/page.tsx");
  assert.match(page, /readSiteFeatureState\("kakaoHelp"\)/);
  assert.match(page, /SiteFeatureStatePanel/);
  assert.match(page, /운영일은 한국 시간 오전 6시에 바뀝니다/);
  assert.match(page, /최근 봇 명단 전체를 복사/);
  assert.match(page, /메시지 전체를 전송/);
  assert.match(page, /사이트에 등록한 이름/);
  assert.match(page, /사이트 회원 연결 전에도 명단과 인원수에 포함/);
  assert.ok(page.indexOf("복사·붙여넣기로 참가하기") < page.indexOf("새로 모집하는 사람만"));
  assert.match(page, /입력 후 종목을 선택하거나/);
  assert.match(page, /내전구인 협곡/);
  assert.match(page, /저장 후 현재 구인 목록/);
  assert.match(page, /구인상세 번호/);
  assert.match(page, /처음 등록할 때는 이름이 한 명 이상/);
  assert.match(page, /초안을 취소하세요/);
  assert.match(page, /양식코드가 있는 번호형 N인파티는 최신 양식에서 이름 추가·삭제·교체와 시작·게임 수정을 할 수 있어요/);
  assert.match(page, /라인형 파티와 구형 양식에는 기존 편집 제한/);
  assert.match(page, /신규·교체 참가자는 라인이 필요/);
  assert.match(page, /이름\/all/);
  assert.match(page, /같아도 자동으로 계정을 연결하지 않아요/);
  assert.match(page, /사이트 신청은 본인이 사이트에서, 운영진 확정 항목은 운영진이 수정/);
  assert.match(page, /번호 행을 남기고 이름만 비운/);
  assert.doesNotMatch(page, /시간·게임은 복사한 명단에서 수정할 수 없어요|전체 전송은 이름 추가용/);
  assert.doesNotMatch(page, /티어·포지션 등 참가 정보도 함께 작성/);
  assert.match(page, /스크림은 카카오 모집 기능에서 제외/);
  assert.match(page, /기존 저장 기록은 유지/);
});

test("recruit guide teaches participation and guarded edits before optional creation", () => {
  const page = source("../src/app/(public)/(recruiting)/help/recruits/page.tsx");
  assert.match(page, /최근 봇 명단 전체를 복사/);
  assert.match(page, /사이트에 등록한 이름/);
  assert.match(page, /사이트 회원 연결 전에도 명단과 인원수에 포함/);
  assert.ok(page.indexOf("복사·붙여넣기로 참가하기") < page.indexOf("새 모집 만들기"));
  assert.match(page, /내전상세 12 삭제 내이름/);
  assert.match(page, /번호 행을 남기고 이름만 비운/);
  assert.match(page, /입력 후 종목을 선택하세요/);
  assert.match(page, /내전구인 협곡/);
  assert.match(page, /저장 후 현재 구인 목록/);
  assert.match(page, /구인상세 번호/);
  assert.match(page, /처음 등록할 때는 이름이 한 명 이상/);
  assert.match(page, /초안을 취소하세요/);
  assert.match(page, /양식코드가 있는 번호형 N인파티는 최신 양식에서 이름 추가·삭제·교체와 시작·게임 수정을 할 수 있어요/);
  assert.match(page, /라인형 파티와 구형 양식에는 기존 편집 제한/);
  assert.match(page, /신규·교체 참가자는 라인이 필요/);
  assert.match(page, /이름\/all/);
  assert.match(page, /같아도 자동으로 계정을 연결하지 않아요/);
  assert.match(page, /사이트 신청은 본인이 사이트에서, 운영진 확정 항목은 운영진이 수정/);
  assert.doesNotMatch(page, /시간·게임은 복사한 명단에서 수정할 수 없어요|이름을 지워 전송하지 마세요/);
});
