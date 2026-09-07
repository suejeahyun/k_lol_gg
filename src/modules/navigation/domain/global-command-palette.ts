export type GlobalCommandAccess = "PUBLIC" | "ACCOUNT";

export type GlobalCommand = Readonly<{
  id: string;
  label: string;
  description: string;
  href: string;
  group: "페이지" | "도구" | "콘텐츠" | "계정";
  access: GlobalCommandAccess;
  keywords: readonly string[];
}>;

const commands = [
  { id: "home", label: "홈", description: "최근 경기와 커뮤니티 현황", href: "/", group: "페이지", access: "PUBLIC", keywords: ["메인", "최근", "현황"] },
  { id: "start", label: "시작하기", description: "K-LOL.GG 이용 흐름 안내", href: "/start", group: "페이지", access: "PUBLIC", keywords: ["가이드", "처음", "안내"] },
  { id: "players", label: "플레이어 찾기", description: "닉네임과 Riot ID 검색", href: "/players", group: "페이지", access: "PUBLIC", keywords: ["선수", "소환사", "라이엇", "riot"] },
  { id: "matches", label: "경기 기록", description: "공개된 내전 결과와 세트", href: "/matches", group: "콘텐츠", access: "PUBLIC", keywords: ["내전", "결과", "전적", "게임"] },
  { id: "rankings", label: "시즌 랭킹", description: "공개 순위와 시즌 통계", href: "/rankings", group: "콘텐츠", access: "PUBLIC", keywords: ["순위", "통계", "시즌"] },
  { id: "mmr", label: "MMR 랭킹", description: "결정적 MMR 공개 순위", href: "/rankings/mmr", group: "콘텐츠", access: "PUBLIC", keywords: ["밸런스", "점수", "mmr"] },
  { id: "applications", label: "참가 신청", description: "시즌과 대회 모집 현황", href: "/applications", group: "페이지", access: "PUBLIC", keywords: ["시즌", "대회", "참여", "신청"] },
  { id: "competitions", label: "대회", description: "이벤트전과 멸망전", href: "/competitions", group: "콘텐츠", access: "PUBLIC", keywords: ["이벤트", "멸망전", "토너먼트"] },
  { id: "recruits", label: "구인 현황", description: "파티와 스크림 모집", href: "/recruits", group: "콘텐츠", access: "PUBLIC", keywords: ["파티", "스크림", "카카오", "모집"] },
  { id: "discipline", label: "징계 현황", description: "공개 조치와 이행 현황", href: "/discipline", group: "콘텐츠", access: "PUBLIC", keywords: ["제재", "조치", "과제"] },
  { id: "highlights", label: "하이라이트", description: "게시된 영상 모음", href: "/highlights", group: "콘텐츠", access: "PUBLIC", keywords: ["영상", "유튜브", "미디어"] },
  { id: "images", label: "이미지 갤러리", description: "공개된 대회와 커뮤니티 사진", href: "/images", group: "콘텐츠", access: "PUBLIC", keywords: ["사진", "갤러리", "미디어"] },
  { id: "team-balance", label: "팀 밸런스", description: "포지션을 고려한 5대5 팀 구성", href: "/tools/team-balance", group: "도구", access: "ACCOUNT", keywords: ["팀짜기", "팀 구성", "드래프트", "mmr"] },
  { id: "balance-drafts", label: "내 밸런스 초안", description: "저장한 팀 구성 이어보기", href: "/tools/team-balance/drafts", group: "도구", access: "ACCOUNT", keywords: ["draft", "저장", "팀"] },
  { id: "random-team", label: "랜덤 팀", description: "10명을 무작위로 나누기", href: "/tools/random-team", group: "도구", access: "PUBLIC", keywords: ["추첨", "랜덤", "섞기"] },
  { id: "coin-toss", label: "코인 토스", description: "블루·레드 진영 동전 던지기", href: "/tools/coin-toss", group: "도구", access: "PUBLIC", keywords: ["동전", "앞면", "뒷면", "진영"] },
  { id: "submit-match", label: "경기 결과 제출", description: "내전 증거와 결과 접수", href: "/matches/submit", group: "계정", access: "ACCOUNT", keywords: ["업로드", "등록", "스코어보드"] },
  { id: "account", label: "내 계정", description: "승인 상태와 연결 플레이어", href: "/account", group: "계정", access: "ACCOUNT", keywords: ["프로필", "내 정보", "상태"] },
  { id: "account-riot", label: "Riot 계정", description: "본인 Riot ID 연결과 동기화", href: "/account/riot", group: "계정", access: "ACCOUNT", keywords: ["라이엇", "rso", "솔랭", "동기화"] },
  { id: "account-password", label: "비밀번호 변경", description: "계정 비밀번호 바꾸기", href: "/account/password", group: "계정", access: "ACCOUNT", keywords: ["암호", "보안"] },
  { id: "account-discipline", label: "내 징계 과제", description: "본인 조치와 제출 상태", href: "/account/discipline", group: "계정", access: "ACCOUNT", keywords: ["제재", "이행", "증거"] },
  { id: "help-kakao", label: "Kakao 도움말", description: "카카오 명령과 연동 안내", href: "/help/kakao", group: "페이지", access: "PUBLIC", keywords: ["카카오", "봇", "명령"] },
  { id: "help-recruits", label: "구인 도움말", description: "파티·스크림 모집 이용법", href: "/help/recruits", group: "페이지", access: "PUBLIC", keywords: ["파티", "스크림", "모집"] },
  { id: "help-riot", label: "Riot 도움말", description: "Riot 연결과 개인정보 안내", href: "/help/riot", group: "페이지", access: "PUBLIC", keywords: ["라이엇", "rso", "연결"] },
  { id: "install", label: "앱 설치", description: "PWA와 모바일 설치 안내", href: "/install", group: "페이지", access: "PUBLIC", keywords: ["pwa", "앱", "모바일"] },
] as const satisfies readonly GlobalCommand[];

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/gu, " ");
}

export function findGlobalCommands(
  query: string,
  options: Readonly<{ accountSignedIn: boolean; limit?: number }>,
): readonly GlobalCommand[] {
  const limit = options.limit ?? 10;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new TypeError("GLOBAL_COMMAND_LIMIT_INVALID");
  const needle = normalize(query);
  return commands.filter((command) => {
    if (command.access === "ACCOUNT" && !options.accountSignedIn) return false;
    if (!needle) return true;
    return normalize([command.label, command.description, ...command.keywords].join(" ")).includes(needle);
  }).slice(0, limit);
}

export function playerSearchHref(query: string): string | null {
  const normalized = query.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized ? `/players?q=${encodeURIComponent(normalized)}` : null;
}
