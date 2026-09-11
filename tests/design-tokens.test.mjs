import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function relativeLuminance(hexColor) {
  const channels = hexColor
    .replace("#", "")
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

test("핵심 일반 텍스트 토큰은 밝은 배경에서 WCAG AA 4.5:1 이상이다", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const lightTokens = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
  const token = (name) => {
    const value = lightTokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    assert.ok(value, `${name} 토큰을 찾을 수 없습니다.`);
    return value;
  };

  assert.ok(contrastRatio(token("primary"), token("primary-foreground")) >= 4.5);
  assert.ok(contrastRatio(token("text-muted"), "#ffffff") >= 4.5);
  assert.ok(contrastRatio(token("text-accent"), "#ffffff") >= 4.5);
  assert.ok(contrastRatio(token("text-accent-purple"), "#eee9ff") >= 4.5);
});

test("기능 상태 패널의 홈 링크는 AA 대비 primary 토큰 쌍을 사용한다", async () => {
  const css = await readFile(new URL("../src/components/site-feature-state.module.css", import.meta.url), "utf8");
  assert.match(css, /\.panel a[^}]*color:\s*var\(--primary-foreground\)[^}]*background:\s*var\(--primary\)/s);
});
