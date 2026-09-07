import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("시작 페이지는 익명·계정 상태·승인 계정·관리자 진입을 구분한다", () => {
  const page = source("../src/app/(public)/(guides)/start/page.tsx");
  for (const contract of [
    'getCurrentSession("ACCOUNT")',
    'accountStatus === "APPROVED"',
    "mustChangePassword",
    'href="/matches/submit"',
    'href="/signup"',
    'href="/admin"',
  ]) assert.equal(page.includes(contract), true, contract);
});

test("Riot 도움말은 운영 연동 잠금과 공개·비공개 범위를 사실대로 안내한다", () => {
  const page = source("../src/app/(public)/(guides)/help/riot/page.tsx");
  for (const contract of [
    "현재 이용 제한",
    "공식 API 승인",
    "RSO",
    "PUUID",
    "429",
    "내부 식별자 암호문",
  ]) assert.equal(page.includes(contract), true, contract);
});

test("설치 화면은 install prompt와 iOS·Android PWA·개인 캐시 금지를 구분한다", () => {
  const page = source("../src/app/(public)/(guides)/install/page.tsx");
  const actions = source("../src/app/(public)/(guides)/install/install-actions.tsx");
  for (const contract of ["beforeinstallprompt", "appinstalled", "display-mode: standalone", "userChoice", 'aria-live="polite"']) {
    assert.equal(actions.includes(contract), true, contract);
  }
  for (const contract of ["iPhone·iPad", "Android", "별도 APK 없이", "공식 설치 방식 · PWA", "비공개 이미지", "빌드 정적 파일"]) {
    assert.equal(page.includes(contract), true, contract);
  }
  assert.equal(page.includes('href="/apk"'), false);
});
