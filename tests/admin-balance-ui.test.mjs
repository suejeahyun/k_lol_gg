import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function relativeLuminance(hexColor) {
  const channels = hexColor
    .replace("#", "")
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test("administrator balance status uses readable Korean operational labels", async () => {
  const [page, action] = await Promise.all([
    source("src/app/(admin)/admin/balance/page.tsx"),
    source("src/app/(admin)/admin/balance/statistics-recalculate-button.tsx"),
  ]);

  assert.match(page, /참가인원 집계/);
  assert.match(page, /seasonStatusLabel\[item\.season\.status\]/);
  assert.match(page, /projectionStatusLabel\[item\.projection\.status\]/);
  assert.match(action, /최고 관리자 전용/);
  assert.doesNotMatch(page, /참가행|시즌 projection|>PROJECTIONS<|ADMIN은|SUPER_ADMIN만| · generation /);
  assert.doesNotMatch(action, /"SUPER_ADMIN 전용"|`generation /);
});

test("administrator balance navigation is a visible keyboard-focusable control", async () => {
  const css = await source("src/app/(admin)/admin/balance/statistics.module.css");
  const linkRule = css.match(/\.header nav a \{([^}]*)\}/s)?.[1];
  assert.ok(linkRule, "밸런스 헤더 링크 스타일이 필요합니다.");
  const foreground = linkRule.match(/color:\s*(#[0-9a-f]{6})/i)?.[1];
  const background = linkRule.match(/background:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(foreground && background, "링크 전경색과 배경색을 명시해야 합니다.");
  assert.ok(contrastRatio(foreground, background) >= 4.5);
  assert.match(linkRule, /min-height:\s*2\.75rem/);
  assert.match(css, /\.header nav a:hover, \.header nav a:focus-visible/);
});
