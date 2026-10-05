import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("화면 효과는 스트리밍 중인 React 하위 DOM을 변경하지 않는다", () => {
  const controller = source("../src/components/visual-effects-controller.tsx");
  const publicShell = source("../src/components/site-shell.tsx");
  const adminShell = source("../src/components/admin/admin-shell.tsx");

  assert.doesNotMatch(controller, /MutationObserver|IntersectionObserver|querySelectorAll/);
  assert.doesNotMatch(controller, /dataset\.(?:uiReveal|uiVisible|uiPage|uiSurface|uiEffectDelay)/);
  assert.match(controller, /--page-scroll-progress/);
  assert.match(controller, /dataset\.uiScrolled/);
  assert.match(controller, /--hero-light-x/);
  assert.match(publicShell, /data-ui-scope="public"/);
  assert.match(adminShell, /data-ui-scope="admin"/);
});

test("전역 효과 CSS는 감속 모드·정밀 포인터·강제 색상 경계를 유지한다", () => {
  const css = source("../src/app/globals.css");

  assert.match(css, /\.site-scroll-progress/);
  assert.match(css, /\.page-wrap\s*\{\s*animation: ui-page-enter/);
  assert.doesNotMatch(css, /\[data-ui-reveal="true"\]/);
  assert.match(css, /\[aria-busy="true"\]/);
  assert.match(css, /\[data-status="success"\]/);
  assert.match(css, /html\[data-ui-scrolled="true"\]/);
  assert.match(css, /--hero-light-x/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
