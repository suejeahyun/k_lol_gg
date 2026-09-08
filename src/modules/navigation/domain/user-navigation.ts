export type UserNavigationSectionId =
  | "home-account"
  | "auth-help"
  | "registry-match"
  | "tools"
  | "competitions"
  | "community";

export type UserRouteImplementationState = "page-contract" | "planned";

export type UserRouteDefinition = Readonly<{
  template: string;
  label: string;
  section: UserNavigationSectionId;
  implementationState: UserRouteImplementationState;
}>;

export const userNavigationSections = [
  { id: "home-account", label: "홈·계정" },
  { id: "auth-help", label: "인증·도움말" },
  { id: "registry-match", label: "플레이어·경기" },
  { id: "tools", label: "팀 도구" },
  { id: "competitions", label: "대회·신청" },
  { id: "community", label: "구인·미디어" },
] as const satisfies readonly Readonly<{
  id: UserNavigationSectionId;
  label: string;
}>[];

/**
 * USER_ROUTE_MAP.md의 V2 사용자 canonical 37개를 그대로 옮긴 계약이다.
 * `page-contract`는 이 브랜치에서 ready/empty/error/loading 페이지 상태를 구현했다는 뜻이다.
 * V1 기능 동등성, 운영 데이터 이관 또는 production readiness를 뜻하지 않는다.
 */
export const canonicalUserRoutes = [
  { template: "/", label: "홈", section: "home-account", implementationState: "page-contract" },
  { template: "/start", label: "시작하기", section: "home-account", implementationState: "page-contract" },
  { template: "/account", label: "내 계정", section: "home-account", implementationState: "page-contract" },
  { template: "/account/password", label: "비밀번호 변경", section: "home-account", implementationState: "page-contract" },
  { template: "/account/riot", label: "Riot 계정", section: "home-account", implementationState: "page-contract" },
  { template: "/account/discipline", label: "내 징계 과제", section: "home-account", implementationState: "page-contract" },

  { template: "/login", label: "로그인", section: "auth-help", implementationState: "page-contract" },
  { template: "/signup", label: "회원가입", section: "auth-help", implementationState: "page-contract" },
  { template: "/forgot-password", label: "비밀번호 찾기", section: "auth-help", implementationState: "page-contract" },
  { template: "/terms", label: "이용약관", section: "auth-help", implementationState: "page-contract" },
  { template: "/privacy", label: "개인정보 처리방침", section: "auth-help", implementationState: "page-contract" },
  { template: "/help/kakao", label: "Kakao 도움말", section: "auth-help", implementationState: "page-contract" },
  { template: "/help/recruits", label: "구인 도움말", section: "auth-help", implementationState: "page-contract" },
  { template: "/help/riot", label: "Riot 도움말", section: "auth-help", implementationState: "page-contract" },
  { template: "/install", label: "앱 설치", section: "auth-help", implementationState: "page-contract" },

  { template: "/players", label: "플레이어 찾기", section: "registry-match", implementationState: "page-contract" },
  { template: "/players/[playerId]", label: "플레이어 상세", section: "registry-match", implementationState: "page-contract" },
  { template: "/matches", label: "경기", section: "registry-match", implementationState: "page-contract" },
  { template: "/matches/[matchId]", label: "경기 상세", section: "registry-match", implementationState: "page-contract" },
  { template: "/matches/submit", label: "결과 제출", section: "registry-match", implementationState: "page-contract" },
  { template: "/rankings", label: "시즌 랭킹", section: "registry-match", implementationState: "page-contract" },
  { template: "/rankings/mmr", label: "MMR", section: "registry-match", implementationState: "page-contract" },

  { template: "/tools/team-balance", label: "팀 밸런스", section: "tools", implementationState: "page-contract" },
  { template: "/tools/team-balance/drafts", label: "밸런스 초안", section: "tools", implementationState: "page-contract" },
  { template: "/tools/team-balance/drafts/[draftId]", label: "초안 상세", section: "tools", implementationState: "page-contract" },
  { template: "/tools/random-team", label: "랜덤 팀", section: "tools", implementationState: "page-contract" },
  { template: "/tools/coin-toss", label: "코인 토스", section: "tools", implementationState: "page-contract" },

  { template: "/applications", label: "참가 신청", section: "competitions", implementationState: "page-contract" },
  { template: "/competitions", label: "대회", section: "competitions", implementationState: "page-contract" },
  { template: "/competitions/events/[eventId]", label: "이벤트전 상세", section: "competitions", implementationState: "page-contract" },
  { template: "/competitions/destruction/[tournamentId]", label: "멸망전 상세", section: "competitions", implementationState: "page-contract" },

  { template: "/recruits", label: "구인 현황", section: "community", implementationState: "page-contract" },
  { template: "/discipline", label: "징계 현황", section: "community", implementationState: "page-contract" },
  { template: "/highlights", label: "하이라이트", section: "community", implementationState: "page-contract" },
  { template: "/highlights/[highlightId]", label: "하이라이트 상세", section: "community", implementationState: "page-contract" },
  { template: "/images", label: "갤러리", section: "community", implementationState: "page-contract" },
  { template: "/images/[imageId]", label: "갤러리 상세", section: "community", implementationState: "page-contract" },
] as const satisfies readonly UserRouteDefinition[];

export const primaryUserNavigation = [
  { href: "/", activeRoot: "/", label: "홈" },
  { href: "/players", activeRoot: "/players", label: "플레이어" },
  { href: "/matches", activeRoot: "/matches", label: "경기" },
  { href: "/rankings", activeRoot: "/rankings", label: "랭킹" },
  { href: "/tools/team-balance", activeRoot: "/tools", label: "팀 도구" },
  { href: "/applications", activeRoot: "/applications", label: "참가 신청" },
  { href: "/competitions", activeRoot: "/competitions", label: "대회" },
] as const;

export function isUserNavigationActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
