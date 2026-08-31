import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getNavigationCatalog, getNavigationHref } from "../src/lib/navigation/catalog";
import { toMobileAppPath } from "../src/lib/navigation/mobile-app-route";

const root = process.cwd();
const failures: string[] = [];

function read(path: string) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    failures.push(`필수 파일 누락: ${path}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function contract(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function mustContain(source: string, pattern: RegExp, message: string) {
  contract(pattern.test(source), message);
}

function mustNotContain(source: string, pattern: RegExp, message: string) {
  contract(!pattern.test(source), message);
}

// P1 route and navigation contracts.
contract(
  toMobileAppPath("/players/balance") === "/players/balance",
  "모바일 팀 밸런스가 원래 도구 경로를 유지해야 합니다.",
);
contract(
  toMobileAppPath("/balance") === "/balance",
  "모바일 팀 밸런스 별칭이 원래 도구 경로를 유지해야 합니다.",
);
contract(
  toMobileAppPath("/participation") === "/participation",
  "모바일 참가 허브가 경기 탭으로 축약되면 안 됩니다.",
);

const userCatalog = getNavigationCatalog("user");
const expectedNavigation = [
  ["/recruit", "구인 현황", "/app/recruits"],
  ["/players", "플레이어 검색", "/app/players"],
  ["/participation", "참여할 이벤트 찾기", "/participation"],
] as const;
for (const [href, label, appHref] of expectedNavigation) {
  const item = userCatalog.find((entry) => entry.href === href);
  contract(Boolean(item), `내비게이션 필수 항목 누락: ${href}`);
  if (!item) continue;
  contract(item.label === label, `${href} 메뉴 이름은 '${label}'이어야 합니다.`);
  contract(
    getNavigationHref(item, "app") === appHref,
    `${href} 모바일 최종 경로는 ${appHref}이어야 합니다.`,
  );
}

const participationPage = read("src/app/(user)/participation/page.tsx");
mustNotContain(participationPage, /redirect\s*\(/, "참가 허브가 다른 페이지로 즉시 이동하면 안 됩니다.");
for (const label of ["모집 중", "예정", "진행 중", "완료", "내 신청"] as const) {
  mustContain(participationPage, new RegExp(label), `참가 허브에 '${label}' 구분이 필요합니다.`);
}

const recruitPage = read("src/app/(user)/recruit/page.tsx");
mustContain(recruitPage, /toPublicRecruitDto/, "공개 구인 화면은 공개 DTO mapper를 사용해야 합니다.");
mustContain(recruitPage, /RecruitParticipationActions/, "모집 중 구인 카드에 참여 CTA가 필요합니다.");
mustContain(recruitPage, /남은 자리/, "구인 카드가 남은 자리를 설명해야 합니다.");
mustNotContain(recruitPage, /roomName:\s*true|hostName:\s*true|requestKey:\s*true/, "공개 구인 조회에 내부 필드를 선택하면 안 됩니다.");

const mobilePlayersPage = read("src/app/app/players/page.tsx");
mustContain(mobilePlayersPage, /page\?:\s*string/, "모바일 플레이어 목록은 페이지 번호를 받아야 합니다.");
mustContain(mobilePlayersPage, /skip:/, "모바일 플레이어 목록은 전체 결과를 위한 페이지 이동을 지원해야 합니다.");
mustContain(mobilePlayersPage, /다음/, "모바일 플레이어 목록에 다음 페이지 이동이 필요합니다.");
mustNotContain(mobilePlayersPage, /DEFAULT_VISIBLE_PLAYERS\s*=\s*12/, "모바일 플레이어 결과가 첫 12명으로 고정되면 안 됩니다.");

const signupForm = read("src/components/SignupForm.tsx");
mustContain(signupForm, /가입 신청이 접수되었습니다/, "가입 성공 문구가 승인 대기 상태를 명시해야 합니다.");
mustContain(signupForm, /승인 전에도 로그인/, "승인 전 로그인 가능 상태를 안내해야 합니다.");

// KL-001 public DTO contracts.
const publicPlayer = read("src/lib/public/player.ts");
const publicRecruit = read("src/lib/public/recruit.ts");
mustContain(publicPlayer, /toPublicPlayerDto/, "공개 플레이어 allowlist mapper가 필요합니다.");
mustNotContain(publicPlayer, /\bname:\s*source\.name\b/, "공개 플레이어 DTO가 실명을 직렬화하면 안 됩니다.");
mustContain(publicRecruit, /toPublicRecruitDto/, "공개 구인 allowlist mapper가 필요합니다.");
mustNotContain(publicRecruit, /requestKey|roomName|hostName/, "공개 구인 DTO에 내부 운영 필드가 포함되면 안 됩니다.");

const publicPlayerRoute = read("src/app/api/players/[playerId]/route.ts");
mustContain(publicPlayerRoute, /isActive:\s*true/, "비활성 플레이어 공개 상세는 조회 전에 차단해야 합니다.");
mustContain(publicPlayerRoute, /toPublicPlayerDetailDto/, "공개 플레이어 상세는 공개 DTO mapper를 사용해야 합니다.");

// KL-002 must fail closed before settings, auth, body parsing, logging or provider work.
const aiRoute = read("src/app/api/ai/chat/route.ts");
const hardOffIndex = aiRoute.indexOf("isProductionAiHardDisabled()");
const settingsIndex = aiRoute.indexOf("await getSiteSettings()");
contract(hardOffIndex >= 0, "Production AI hard-off gate가 필요합니다.");
contract(
  hardOffIndex >= 0 && settingsIndex >= 0 && hardOffIndex < settingsIndex,
  "Production AI hard-off는 설정·인증·provider 작업보다 먼저 실행되어야 합니다.",
);
mustContain(aiRoute, /private, no-store, max-age=0/, "AI 비활성 응답은 private no-store여야 합니다.");

// KL-005 must reject expired evidence before Blob download and keep reconciliation read-only.
const assetRoute = read("src/app/api/admin/private-assets/[id]/route.ts");
const expiryIndex = assetRoute.indexOf("isPrivateAssetExpired");
const downloadIndex = assetRoute.indexOf("downloadPrivateAsset");
contract(expiryIndex >= 0, "비공개 증빙 만료 판정이 필요합니다.");
contract(
  expiryIndex >= 0 && downloadIndex >= 0 && expiryIndex < downloadIndex,
  "만료 증빙은 Blob 다운로드 전에 차단해야 합니다.",
);
const reconciler = read("src/lib/storage/private-asset-reconciler.ts");
mustContain(reconciler, /mode:\s*"DRY_RUN"/, "비공개 증빙 reconciler는 dry-run 전용이어야 합니다.");
mustContain(reconciler, /mutations:\s*0/, "dry-run manifest의 변경 건수는 항상 0이어야 합니다.");
mustNotContain(reconciler, /\.delete\s*\(|\.update\s*\(|del\s*\(/, "dry-run reconciler에 delete/update 호출이 있으면 안 됩니다.");

// Existing accessibility and long Riot ID protections must survive the patch.
const userLayout = read("src/app/(user)/layout.tsx");
mustContain(userLayout, /SkipLink/, "사용자 셸에 본문 바로가기 링크가 필요합니다.");
const globals = read("src/app/globals.css");
mustContain(globals, /accessibility\.css/, "전역 스타일이 접근성 안전망을 포함해야 합니다.");
const playerStyles = [
  read("src/styles/pages/players.css"),
  read("src/styles/app-mobile.css"),
  read("src/styles/overrides/dark-modern-final.css"),
].join("\n");
mustContain(playerStyles, /overflow-wrap:\s*anywhere/, "긴 Riot ID는 좁은 화면에서도 전체 텍스트 접근이 가능해야 합니다.");
mustContain(playerStyles, /line-clamp:\s*2/, "긴 Riot ID는 최대 두 줄 레이아웃 계약을 유지해야 합니다.");

if (failures.length > 0) {
  console.error("다음 사이트 개선 회귀 계약 실패:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("다음 사이트 개선 회귀 계약 통과");
