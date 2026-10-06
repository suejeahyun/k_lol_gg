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

function declaration(css, selector, property) {
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1].split(",").some((item) => item.trim() === selector)) continue;
    const value = rule[2].match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))?.[1];
    if (value) return value.trim();
  }
  assert.fail(`${selector}의 ${property} 선언이 없습니다.`);
}

function resolveLightColor(value, tokens) {
  const variable = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (variable) return resolveLightColor(tokens.match(new RegExp(`${variable}:\\s*([^;]+)`))?.[1] ?? "", tokens);
  if (/^#[\da-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map((channel) => channel + channel).join("")}`;
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const rgba = value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\s*\)$/);
  assert.ok(rgba, `지원하지 않는 색: ${value}`);
  const alpha = Number(rgba[4] ?? 1);
  return `#${rgba.slice(1, 4).map((channel) => Math.round(Number(channel) * alpha + 255 * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}

test("작은 순위 숫자와 내 순위 배지는 4.5:1 이상의 실제 색 대비를 가진다", async () => {
  const [css, tokens] = await Promise.all([
    readFile(new URL("../src/app/(public)/(statistics)/rankings/rankings.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const rank of [1, 2, 3]) {
    const selector = `.board li[data-rank="${rank}"] > b`;
    const foreground = resolveLightColor(declaration(css, selector, "color"), tokens);
    const background = resolveLightColor(declaration(css, selector, "background"), tokens);
    const ratio = contrastRatio(foreground, background);
    assert.ok(ratio >= 4.5, `${rank}위 배지 대비 ${ratio.toFixed(2)}:1`);
  }
  const own = '.board li[data-own="true"] > b::after';
  const ratio = contrastRatio(resolveLightColor(declaration(css, own, "color"), tokens), resolveLightColor(declaration(css, own, "background"), tokens));
  assert.ok(ratio >= 4.5, `내 순위 배지 대비 ${ratio.toFixed(2)}:1`);
});

test("순위 분류와 기능 검색 결과의 키보드 외곽선은 밝은 배경에서 3:1 이상이다", async () => {
  const tokens = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  for (const [path, selector] of [
    ["src/app/(public)/(statistics)/rankings/rankings.module.css", ".tabs a:focus-visible"],
    ["src/app/(public)/(statistics)/rankings/mmr/mmr.module.css", ".tabs a:focus-visible"],
    ["src/app/globals.css", ".command-palette-results li > a:focus-visible"],
  ]) {
    const css = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    const outline = declaration(css, selector, "outline");
    const color = outline.match(/^\d+px solid (.+)$/)?.[1];
    assert.ok(color, `${path}의 시각적 포커스 외곽선이 필요합니다.`);
    const ratio = contrastRatio(resolveLightColor(color, tokens), "#ffffff");
    assert.ok(ratio >= 3, `${path} 키보드 포커스 대비 ${ratio.toFixed(2)}:1`);
  }
});
