import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("전체 화면 효과는 공개·관리자 범위를 구분하고 동적 화면에도 재사용된다", () => {
  const controller = source("../src/components/visual-effects-controller.tsx");
  const publicShell = source("../src/components/site-shell.tsx");
  const adminShell = source("../src/components/admin/admin-shell.tsx");

  assert.match(controller, /MutationObserver/);
  assert.match(controller, /IntersectionObserver/);
  assert.match(controller, /--page-scroll-progress/);
  assert.match(controller, /dataset\.uiScrolled/);
  assert.match(controller, /--hero-light-x/);
  assert.match(controller, /data-ui-scope='admin'/);
  assert.match(publicShell, /data-ui-scope="public"/);
  assert.match(adminShell, /data-ui-scope="admin"/);
});

test("전역 효과 CSS는 감속 모드·정밀 포인터·강제 색상 경계를 유지한다", () => {
  const css = source("../src/app/globals.css");

  assert.match(css, /\.site-scroll-progress/);
  assert.match(css, /\[data-ui-reveal="true"\]/);
  assert.match(css, /\[aria-busy="true"\]/);
  assert.match(css, /\[data-status="success"\]/);
  assert.match(css, /html\[data-ui-scrolled="true"\]/);
  assert.match(css, /--hero-light-x/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
