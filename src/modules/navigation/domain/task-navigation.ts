export type TaskLink = Readonly<{ href: string; label: string; account?: boolean }>;
export const userTaskGroups = [
  { label: "참가·모집", roots: ["/applications", "/recruits"], links: [
    { href: "/applications", label: "오늘 내전 신청" },
    { href: "/recruits", label: "파티·스크림 모집" },
    { href: "/applications?type=event", label: "이벤트전 신청" },
    { href: "/applications?type=destruction", label: "멸망전 신청" },
  ] },
  { label: "팀 만들기", roots: ["/tools"], links: [
    { href: "/tools/team-balance", label: "실력 맞춰 팀 나누기", account: true },
    { href: "/tools/random-team", label: "무작위 팀 나누기" },
    { href: "/tools/coin-toss", label: "진영 정하기" },
    { href: "/tools/team-balance/drafts", label: "내 저장 팀", account: true },
  ] },
  { label: "경기·기록", roots: ["/matches", "/players", "/rankings"], links: [
    { href: "/matches", label: "경기 기록" },
    { href: "/matches/submit", label: "결과 제출", account: true },
    { href: "/matches/submissions", label: "내 접수 기록", account: true },
    { href: "/players", label: "플레이어 찾기" },
    { href: "/rankings", label: "시즌 랭킹" },
    { href: "/rankings/mmr", label: "MMR 랭킹" },
  ] },
  { label: "대회", roots: ["/competitions"], links: [
    { href: "/competitions/events", label: "이벤트전" },
    { href: "/competitions/destruction", label: "멸망전" },
  ] },
  { label: "커뮤니티", roots: ["/highlights", "/images", "/help", "/discipline", "/start"], links: [
    { href: "/highlights", label: "하이라이트" },
    { href: "/images", label: "갤러리" },
    { href: "/start", label: "이용 안내" },
    { href: "/help", label: "도움말·문의" },
    { href: "/discipline", label: "커뮤니티 운영 현황" },
  ] },
] as const satisfies readonly Readonly<{ label: string; roots: readonly string[]; links: readonly TaskLink[] }>[];

export const personalTaskLinks: readonly TaskLink[] = [
  { href: "/account", label: "내 계정 상태", account: true },
  { href: "/applications", label: "내 참가 신청" },
  { href: "/matches/submissions", label: "내 접수 기록", account: true },
  { href: "/tools/team-balance/drafts", label: "내 저장 팀", account: true },
  { href: "/account/riot", label: "Riot 계정 연결", account: true },
];
