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
  assert.match(page, /운영일은 한국 시간 오전 6시에 바뀌며/);
  assert.match(page, /이전 운영일 스크림은 현황에서 제외/);
  assert.match(page, /운영일 종료 시 자동 마감/);
});
