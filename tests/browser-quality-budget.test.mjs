import assert from "node:assert/strict";
import test from "node:test";

import { assessBrowserSnapshot, QUALITY_BUDGET } from "../scripts/verify-browser-quality.mjs";

function validSnapshot(overrides = {}) {
  return {
    status: 200,
    lang: "ko",
    mainCount: 1,
    h1Count: 1,
    hasHorizontalOverflow: false,
    scrollWidth: 390,
    clientWidth: 390,
    reducedMotionMatches: true,
    maxAnimationDurationMs: 0.01,
    hasSkipLink: true,
    firstTab: { href: "#main-content", label: "본문 바로가기", visible: true },
    tabSequence: [{ href: "#main-content", label: "본문 바로가기", visible: true }],
    axeViolations: [],
    axUnnamedFocusable: [],
    performance: Object.fromEntries(Object.entries(QUALITY_BUDGET).map(([key, value]) => [key, value])),
    ...overrides,
  };
}

test("browser quality boundary accepts WCAG and performance values at their budgets", () => {
  assert.deepEqual(assessBrowserSnapshot(validSnapshot()), []);
});

test("browser quality boundary reports semantic, keyboard, motion, axe and performance failures", () => {
  const snapshot = validSnapshot({
    mainCount: 2,
    hasHorizontalOverflow: true,
    maxAnimationDurationMs: 300,
    firstTab: { href: "/", label: "홈", visible: true },
    axeViolations: [{ id: "color-contrast", nodes: [{ target: ["button"] }] }],
    axUnnamedFocusable: ["button"],
    performance: { ...validSnapshot().performance, lcpMs: QUALITY_BUDGET.lcpMs + 1 },
  });
  const issues = assessBrowserSnapshot(snapshot);

  assert.ok(issues.some((issue) => issue.startsWith("MAIN_COUNT:")));
  assert.ok(issues.some((issue) => issue.startsWith("HORIZONTAL_OVERFLOW:")));
  assert.ok(issues.some((issue) => issue.startsWith("FIRST_TAB_NOT_SKIP_LINK:")));
  assert.ok(issues.some((issue) => issue.startsWith("REDUCED_MOTION_ACTIVE:")));
  assert.ok(issues.includes("AXE_color-contrast:1"));
  assert.ok(issues.includes("AX_UNNAMED_FOCUSABLE:button"));
  assert.ok(issues.some((issue) => issue.startsWith("PERFORMANCE_LCPMS:")));
});

test("compact standalone auth pages do not require a skip link or a single h1", () => {
  const snapshot = validSnapshot({ h1Count: 2, hasSkipLink: false, firstTab: null });
  assert.deepEqual(assessBrowserSnapshot(snapshot), []);
});
