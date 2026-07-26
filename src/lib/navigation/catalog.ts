export type NavigationMode = "user" | "admin";

export type NavigationItem = {
  href: string;
  appHref?: string;
  label: string;
  description: string;
  section: string;
  keywords: string[];
};

const userNavigation: NavigationItem[] = [
  {
    href: "/",
    appHref: "/app",
    label: "홈",
    description: "최근 경기와 시즌 현황",
    section: "바로가기",
    keywords: ["메인", "대시보드"],
  },
  {
    href: "/recruit",
    appHref: "/app/recruits",
    label: "구인현황",
    description: "현재 모집 중인 파티 확인",
    section: "바로가기",
    keywords: ["구인", "파티", "모집"],
  },
  {
    href: "/matches",
    appHref: "/app/matches",
    label: "내전 목록",
    description: "최근 내전 결과와 상세 기록",
    section: "경기",
    keywords: ["내전", "경기", "전적"],
  },
  {
    href: "/rankings",
    appHref: "/app/rankings",
    label: "시즌 랭킹",
    description: "승률·MVP·참여 순위",
    section: "경기",
    keywords: ["랭킹", "순위", "시즌"],
  },
  {
    href: "/players",
    appHref: "/app/players",
    label: "플레이어 찾기",
    description: "플레이어 프로필과 전적 검색",
    section: "플레이어",
    keywords: ["회원", "검색", "프로필"],
  },
  {
    href: "/ai-balance",
    appHref: "/app/rankings",
    label: "K-LOL MMR",
    description: "밸런스 점수와 지표 확인",
    section: "플레이어",
    keywords: ["mmr", "점수", "밸런스"],
  },
  {
    href: "/players/balance",
    appHref: "/app",
    label: "팀 밸런스",
    description: "참가자를 두 팀으로 배정",
    section: "도구",
    keywords: ["팀", "나누기", "밸런스"],
  },
  {
    href: "/random-team",
    appHref: "/app/random-team",
    label: "랜덤 팀 나누기",
    description: "빠르게 무작위 팀 생성",
    section: "도구",
    keywords: ["랜덤", "팀", "추첨"],
  },
  {
    href: "/progress",
    appHref: "/app/matches?tab=events",
    label: "이벤트·멸망전",
    description: "대회 진행 현황과 결과",
    section: "대회",
    keywords: ["이벤트", "멸망전", "대회"],
  },
  {
    href: "/participation",
    appHref: "/app/matches?tab=events",
    label: "참가 신청",
    description: "진행 중인 대회 참가 신청",
    section: "대회",
    keywords: ["참가", "신청", "접수"],
  },
  {
    href: "/coin-toss",
    appHref: "/app/coin-toss",
    label: "코인토스",
    description: "진영과 순서를 공정하게 추첨",
    section: "도구",
    keywords: ["코인", "추첨", "진영"],
  },
  {
    href: "/highlights",
    appHref: "/app",
    label: "하이라이트",
    description: "경기 영상과 주요 장면",
    section: "콘텐츠",
    keywords: ["영상", "클립", "이미지"],
  },
  {
    href: "/account",
    appHref: "/app/me",
    label: "내 정보",
    description: "계정과 연결된 플레이어 관리",
    section: "내 계정",
    keywords: ["계정", "프로필", "티어"],
  },
];

const adminNavigation: NavigationItem[] = [
  {
    href: "/admin",
    appHref: "/app/admin",
    label: "관리자 홈",
    description: "오늘 운영 현황과 주요 알림",
    section: "오늘 운영",
    keywords: ["대시보드", "메인"],
  },
  {
    href: "/admin/matches/new",
    appHref: "/app/admin/matches",
    label: "새 내전 등록",
    description: "경기 참가자와 결과 입력",
    section: "오늘 운영",
    keywords: ["내전", "등록", "경기"],
  },
  {
    href: "/admin/matches",
    appHref: "/app/admin/matches",
    label: "내전 관리",
    description: "등록된 내전 조회와 수정",
    section: "오늘 운영",
    keywords: ["내전", "경기", "결과"],
  },
  {
    href: "/admin/kakao/recruits",
    appHref: "/app/admin/recruits",
    label: "구인 관리",
    description: "진행 중인 구인과 참가자 확인",
    section: "오늘 운영",
    keywords: ["구인", "파티", "모집"],
  },
  {
    href: "/admin/progress",
    appHref: "/app/matches?tab=events",
    label: "이벤트·멸망전 관리",
    description: "대회 생성과 진행 관리",
    section: "오늘 운영",
    keywords: ["이벤트", "멸망전", "대회"],
  },
  {
    href: "/admin/kakao/season-apply",
    appHref: "/app/admin",
    label: "참가 신청 확인",
    description: "내전 참가 신청과 대기자 처리",
    section: "오늘 운영",
    keywords: ["참가", "신청", "대기"],
  },
  {
    href: "/admin/players",
    appHref: "/app/players",
    label: "플레이어 관리",
    description: "플레이어 정보 조회와 수정",
    section: "사람 관리",
    keywords: ["플레이어", "회원", "검색"],
  },
  {
    href: "/admin/users",
    appHref: "/app/admin/users",
    label: "계정 관리",
    description: "가입 계정과 권한 확인",
    section: "사람 관리",
    keywords: ["계정", "회원", "권한"],
  },
  {
    href: "/admin/discipline",
    appHref: "/app/admin",
    label: "주의·경고·벤",
    description: "징계 기록 등록과 조회",
    section: "사람 관리",
    keywords: ["징계", "경고", "벤"],
  },
  {
    href: "/admin/kakao/operation-forms",
    appHref: "/app/admin",
    label: "운영 신청",
    description: "운영 관련 신청 내역 확인",
    section: "사람 관리",
    keywords: ["운영", "신청", "접수"],
  },
  {
    href: "/admin/logs/kakao",
    appHref: "/app/admin",
    label: "카카오톡 처리 로그",
    description: "자동화 처리와 오류 기록",
    section: "자동화",
    keywords: ["카카오", "로그", "오류"],
  },
  {
    href: "/admin/site-settings",
    appHref: "/app/admin",
    label: "사이트 설정",
    description: "브랜드와 기능 공개 범위 설정",
    section: "설정",
    keywords: ["사이트", "기능", "설정"],
  },
  {
    href: "/admin/kakao/settings",
    appHref: "/app/admin",
    label: "자동화 설정",
    description: "카카오톡 명령과 동작 설정",
    section: "설정",
    keywords: ["카카오", "자동화", "설정"],
  },
  {
    href: "/admin/security",
    appHref: "/app/admin",
    label: "보안 설정",
    description: "관리자 접근과 인증 점검",
    section: "설정",
    keywords: ["보안", "인증", "관리자"],
  },
];

export function getNavigationCatalog(mode: NavigationMode) {
  return mode === "admin" ? adminNavigation : userNavigation;
}

export function getNavigationHref(item: NavigationItem, surface: "web" | "app") {
  return surface === "app" ? item.appHref ?? item.href : item.href;
}
