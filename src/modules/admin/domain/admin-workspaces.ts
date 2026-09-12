export const ADMIN_WORKSPACE_ICON_KEYS = [
  "dashboard",
  "people",
  "seasons",
  "matches",
  "balance",
  "tournaments",
  "community",
  "content",
  "integrations",
  "operations",
] as const;

export type AdminWorkspaceIconKey = (typeof ADMIN_WORKSPACE_ICON_KEYS)[number];

export type AdminWorkspace = {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  description: string;
  scope: string;
  icon: AdminWorkspaceIconKey;
  stage: string;
};

export const ADMIN_WORKSPACES = [
  { id: "home", label: "홈", shortLabel: "홈", href: "/admin", description: "검토 대기, 시스템 상태와 최근 활동을 모아 보는 운영 시작점", scope: "대시보드와 빠른 작업", icon: "dashboard", stage: "대시보드" },
  { id: "people", label: "인물·계정", shortLabel: "인물", href: "/admin/players", description: "플레이어 등록부와 사용자 승인·역할·보안 업무", scope: "플레이어·사용자·MMR·Riot 연결", icon: "people", stage: "계정" },
  { id: "seasons", label: "시즌·참가", shortLabel: "시즌", href: "/admin/seasons", description: "시즌 일정과 참가 신청 검토를 한 흐름으로 관리", scope: "시즌·참가 신청", icon: "seasons", stage: "시즌" },
  { id: "matches", label: "경기·결과", shortLabel: "경기", href: "/admin/matches", description: "경기 등록, 결과 접수와 검토를 한곳에서 관리", scope: "경기·접수·증거", icon: "matches", stage: "경기" },
  { id: "balance", label: "팀·AI", shortLabel: "팀", href: "/admin/balance", description: "팀 편성, 저장한 초안, MMR 프로필과 재계산 관리", scope: "밸런스·팀 초안·검토", icon: "balance", stage: "팀" },
  { id: "tournaments", label: "대회", shortLabel: "대회", href: "/admin/progress/event", description: "이벤트전과 멸망전의 단계별 운영 흐름", scope: "이벤트전·멸망전", icon: "tournaments", stage: "대회" },
  { id: "community", label: "커뮤니티", shortLabel: "커뮤니티", href: "/admin/kakao", description: "구인, 스크림, Kakao와 운영 신청을 함께 처리", scope: "구인·Kakao·신청", icon: "community", stage: "커뮤니티" },
  { id: "content", label: "콘텐츠·자료", shortLabel: "콘텐츠", href: "/admin/highlights", description: "하이라이트, 갤러리, 챔피언과 권한 기반 비공개 자료", scope: "하이라이트·갤러리·챔피언·비공개 자료", icon: "content", stage: "콘텐츠" },
  { id: "integrations", label: "연동", shortLabel: "연동", href: "/admin/riot", description: "Riot 계정 연결과 동기화 상태·실패 재시도", scope: "Riot·외부 연동", icon: "integrations", stage: "연동" },
  { id: "operations", label: "운영·감사", shortLabel: "운영", href: "/admin/discipline", description: "징계, 감사, 설정, 백업과 정비를 역할별로 통제", scope: "징계·감사·설정·백업", icon: "operations", stage: "운영" },
] as const satisfies readonly AdminWorkspace[];

export type AdminWorkspaceId = (typeof ADMIN_WORKSPACES)[number]["id"];

export function getAdminWorkspace(id: AdminWorkspaceId) {
  const workspace = ADMIN_WORKSPACES.find((candidate) => candidate.id === id);
  if (!workspace) throw new Error(`Unknown administrator workspace: ${id}`);
  return workspace;
}

export function isAdminWorkspaceActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  if (href === "/admin/players") {
    return pathname.startsWith("/admin/players") || pathname.startsWith("/admin/users");
  }
  if (href === "/admin/progress/event") return pathname.startsWith("/admin/progress/");
  if (href === "/admin/highlights") {
    return ["/admin/champions", "/admin/highlights", "/admin/images", "/admin/private-assets"]
      .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
