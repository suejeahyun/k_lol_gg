import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function read(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    failures.push(`필수 파일 누락: ${path}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function contract(condition, message) {
  if (!condition) failures.push(message);
}

function mustContain(source, pattern, message) {
  contract(pattern.test(source), message);
}

function mustNotContain(source, pattern, message) {
  contract(!pattern.test(source), message);
}

function fileBudget(path, maxBytes) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    failures.push(`자산 누락: ${path}`);
    return;
  }
  const size = statSync(absolute).size;
  contract(size <= maxBytes, `${path} 크기 ${size}B가 예산 ${maxBytes}B를 초과했습니다.`);
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const layout = read("src/app/layout.tsx");
mustContain(
  layout,
  /\["bright-bloom",\s*"lavender-dream",\s*"mint-breeze"\]/,
  "초기 부팅 허용 테마는 세 가지 밝은 테마여야 합니다.",
);
mustContain(layout, /theme\s*=.*"bright-bloom"/, "기본 테마는 bright-bloom이어야 합니다.");
mustContain(layout, /colorScheme\s*=\s*"light"/, "첫 페인트부터 light color-scheme을 사용해야 합니다.");
mustContain(layout, /klol-bloom-hero-v1\.webp/, "메타데이터가 새 Bright Bloom 대표 이미지를 사용해야 합니다.");
mustContain(layout, /themeColor:\s*"#F7FBFF"/i, "브라우저 테마 색상은 밝은 캔버스여야 합니다.");

const switcher = read("src/components/ThemeSwitcher.tsx");
for (const theme of ["bright-bloom", "lavender-dream", "mint-breeze"]) {
  mustContain(switcher, new RegExp(theme), `테마 선택기에 ${theme}가 필요합니다.`);
}
mustNotContain(switcher, /"dark-modern"|"neon-cyber"|"black-gold"/, "테마 선택기에 어두운 구 테마가 남으면 안 됩니다.");
mustContain(switcher, /colorScheme\s*=\s*"light"/, "테마 전환 후에도 light color-scheme을 유지해야 합니다.");

const background = read("src/components/RandomBackgroundLayout.tsx");
mustNotContain(background, /useEffect|useState|getRandomPair|\/images\/backgrounds\/bg-/, "랜덤 어두운 배경 로딩과 클라이언트 상태를 제거해야 합니다.");
mustContain(background, /app-background-root/, "공통 배경 셸은 유지해야 합니다.");

const variables = read("src/styles/base/variables.css");
mustContain(variables, /--k-bg:\s*#f7fbff/i, "기본 캔버스 토큰은 밝은 색이어야 합니다.");
mustContain(variables, /--k-panel-solid:\s*#ffffff/i, "기본 패널 토큰은 흰색이어야 합니다.");
mustContain(variables, /--k-text:\s*#24304a/i, "기본 텍스트 토큰은 진한 잉크색이어야 합니다.");
mustContain(variables, /--k-muted:\s*#5a6982/i, "보조 텍스트 토큰은 대비 검증된 값이어야 합니다.");

const globals = read("src/app/globals.css");
const darkImportIndex = globals.indexOf("dark-modern-final.css");
const bloomImportIndex = globals.indexOf("bright-bloom.css");
const accessibilityImportIndex = globals.indexOf("accessibility.css");
contract(bloomImportIndex > darkImportIndex, "Bright Bloom 스타일은 기존 다크 스타일 뒤에 적용되어야 합니다.");
contract(accessibilityImportIndex > bloomImportIndex, "접근성 안전망은 Bright Bloom 뒤에 마지막으로 적용되어야 합니다.");

const bloom = read("src/styles/overrides/bright-bloom.css");
mustContain(bloom, /html\[data-theme="bright-bloom"\]/, "Bright Bloom 루트 테마 선택자가 필요합니다.");
mustContain(bloom, /klol-bloom-hero-v1\.webp/, "홈 대표 자산을 실제 스타일에서 사용해야 합니다.");
mustContain(bloom, /klol-sallangi-mascot-v1\.webp/, "오리지널 마스코트를 상태 UI에서 사용해야 합니다.");
mustContain(bloom, /prefers-reduced-motion:\s*reduce/, "모션 감소 환경에서 장식을 중단해야 합니다.");
mustContain(bloom, /color-scheme:\s*light/, "밝은 브라우저 컨트롤 렌더링을 선언해야 합니다.");
mustNotContain(bloom, /#050b16|#020617|rgba\(2,\s*6,\s*23/, "Bright Bloom 스타일에 기존 핵심 다크 배경색을 재사용하면 안 됩니다.");
fileBudget("src/styles/overrides/bright-bloom.css", 50 * 1024);

const home = read("src/app/(user)/page.impl.tsx");
mustContain(home, /home-bloom-page/, "홈이 Bright Bloom 전용 루트 클래스를 가져야 합니다.");
mustContain(home, /klol-bloom-hero-v1\.webp/, "홈이 대표 이미지를 명시적으로 렌더링해야 합니다.");
mustContain(home, /지금 같이 플레이할 사람 찾기/, "홈 Primary CTA가 사용자의 첫 과업을 설명해야 합니다.");
mustContain(home, /플레이어 찾기/, "홈에 플레이어 찾기 Secondary CTA가 필요합니다.");
mustContain(home, /내 경기 확인/, "홈에 내 경기 확인 Secondary CTA가 필요합니다.");

const settings = read("src/lib/site/settings.ts");
mustContain(settings, /"bright-bloom"\s*\|\s*"lavender-dream"\s*\|\s*"mint-breeze"/, "사이트 설정 테마 타입이 밝은 프리셋을 사용해야 합니다.");
mustContain(settings, /themePreset:\s*"bright-bloom"/, "사이트 설정 기본 테마는 bright-bloom이어야 합니다.");
mustContain(settings, /klol-bloom-hero-v1\.webp/, "사이트 설정 기본 배경은 새 대표 자산이어야 합니다.");

fileBudget("public/images/theme/bloom/klol-bloom-hero-v1.webp", 200 * 1024);
fileBudget("public/images/theme/bloom/klol-sallangi-mascot-v1.webp", 80 * 1024);

const palette = {
  primary: "#4169D8",
  ink: "#24304A",
  muted: "#5A6982",
  success: "#16805F",
  warning: "#9A6512",
  danger: "#B83A58",
};
const backgrounds = ["#FFFFFF", "#F7FBFF", "#DDF3FF", "#EEE8FF", "#DDF8EE", "#FFE8DE"];
for (const [name, color] of Object.entries(palette)) {
  const requiredBackgrounds = name === "primary" || name === "success" || name === "warning" || name === "danger"
    ? backgrounds.slice(0, 2)
    : backgrounds;
  for (const value of requiredBackgrounds) {
    contract(
      contrast(color, value) >= 4.5,
      `${name} ${color}와 배경 ${value}의 텍스트 대비가 4.5:1 미만입니다.`,
    );
  }
}

if (failures.length > 0) {
  console.error("Bright Bloom 디자인 계약 실패:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Bright Bloom 디자인 계약 통과");
