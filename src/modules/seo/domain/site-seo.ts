import type { Metadata, MetadataRoute } from "next";

export const SITE_NAME = "K-LOL.GG";
export const SITE_LOCALE = "ko_KR";
export const SITE_LANGUAGE = "ko-KR";
export const SITE_DESCRIPTION = "한국 리그 오브 레전드 내전 커뮤니티의 플레이어 전적, 최근 경기, 시즌 랭킹, 구인과 팀 도구를 확인하세요.";

export const SOCIAL_IMAGE = Object.freeze({
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "K-LOL.GG 리그 오브 레전드 내전 커뮤니티",
});

export type SeoIndexPolicy = "index" | "noindex";

export type SeoRouteContract = Readonly<{
  template: string;
  title: string;
  description: string;
  indexPolicy: SeoIndexPolicy;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
}>;

/**
 * USER_ROUTE_MAP의 37개 canonical 사용자 경로를 검색 의도와 함께 분류한 계약이다.
 * 동적 경로는 sitemap 생성 시 실제 공개 ID로 치환되어야 한다.
 */
export const SEO_ROUTE_CONTRACTS = [
  { template: "/help", title: "도움말·문의", description: "내전 참가, 파티 모집, 팀 만들기와 계정 이용 방법을 찾고 K-LOL.GG 운영팀에 문의하세요.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.6 },
  { template: "/help/contact", title: "운영팀 문의", description: "K-LOL.GG 운영팀에 이용 문의, 오류와 개인정보 요청을 접수합니다.", indexPolicy: "noindex" },
  { template: "/matches/submissions", title: "내 제출 내역", description: "내 경기 결과 접수와 검토 상태를 확인합니다.", indexPolicy: "noindex" },
  { template: "/competitions/events", title: "이벤트전 모집·결과", description: "이벤트전 모집과 참가 신청, 팀 편성, 결과를 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.8 },
  { template: "/competitions/destruction", title: "멸망전 모집·결과", description: "멸망전 참가 신청과 경매, 팀 편성, 경기 결과를 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.8 },
  { template: "/", title: "한국 LoL 내전 커뮤니티", description: "K-LOL.GG에서 플레이어 전적, 최근 내전, 시즌 랭킹, 구인과 팀 구성 도구를 한 번에 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 1 },
  { template: "/start", title: "K-LOL.GG 시작하기", description: "플레이어 검색부터 내전 참여, 경기 결과 확인까지 K-LOL.GG를 시작하는 방법을 안내합니다.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.7 },
  { template: "/account", title: "내 계정", description: "내 계정과 연결 상태를 관리합니다.", indexPolicy: "noindex" },
  { template: "/account/password", title: "비밀번호 변경", description: "K-LOL.GG 계정 비밀번호를 변경합니다.", indexPolicy: "noindex" },
  { template: "/account/riot", title: "내 Riot 계정", description: "내 Riot 계정 연결과 동기화 상태를 관리합니다.", indexPolicy: "noindex" },
  { template: "/account/discipline", title: "내 징계 과제", description: "내 징계 기록과 증빙 과제를 확인합니다.", indexPolicy: "noindex" },
  { template: "/login", title: "로그인", description: "K-LOL.GG 계정으로 로그인합니다.", indexPolicy: "noindex" },
  { template: "/signup", title: "가입 신청", description: "K-LOL.GG 커뮤니티 가입을 신청합니다.", indexPolicy: "noindex" },
  { template: "/forgot-password", title: "비밀번호 도움", description: "K-LOL.GG 계정 복구를 요청합니다.", indexPolicy: "noindex" },
  { template: "/terms", title: "이용약관", description: "K-LOL.GG 계정과 서비스 이용에 관한 현재 운영 규칙입니다.", indexPolicy: "noindex" },
  { template: "/privacy", title: "개인정보 처리 안내", description: "K-LOL.GG 계정 데이터의 수집, 이용과 보존 방식을 안내합니다.", indexPolicy: "noindex" },
  { template: "/help/kakao", title: "카카오톡 연동 안내", description: "K-LOL.GG 카카오톡 연동 기능의 사용 범위와 안전한 이용 방법을 확인하세요.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.5 },
  { template: "/help/recruits", title: "내전 구인 참여 안내", description: "현재 LoL 내전 구인을 찾고 안전하게 참여하는 방법을 안내합니다.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.6 },
  { template: "/help/riot", title: "Riot 계정 연동 안내", description: "Riot ID 연동으로 제공되는 전적 데이터 범위와 동기화 방법을 확인하세요.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.6 },
  { template: "/install", title: "K-LOL.GG 앱 설치", description: "모바일 홈 화면에 K-LOL.GG를 설치하고 플레이어, 경기와 구인을 빠르게 확인하세요.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.6 },
  { template: "/players", title: "LoL 내전 플레이어 전적 검색", description: "닉네임과 Riot ID로 K-LOL.GG 플레이어의 티어, 승률, MVP와 최근 내전 기록을 검색하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.9 },
  { template: "/players/[playerId]", title: "플레이어 전적", description: "K-LOL.GG 플레이어의 공개 프로필, Riot ID와 내전 기록을 확인하세요.", indexPolicy: "index", changeFrequency: "weekly", priority: 0.7 },
  { template: "/matches", title: "최근 LoL 내전 경기와 결과", description: "K-LOL.GG의 최근 내전 경기, 세트 스코어와 플레이어별 결과를 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.9 },
  { template: "/matches/[matchId]", title: "LoL 내전 경기 결과", description: "K-LOL.GG 내전의 게임별 스코어, 참가 플레이어와 MVP를 확인하세요.", indexPolicy: "index", changeFrequency: "weekly", priority: 0.8 },
  { template: "/matches/submit", title: "경기 결과 접수", description: "내전 경기 결과와 비공개 스코어보드를 제출합니다.", indexPolicy: "noindex" },
  { template: "/rankings", title: "LoL 내전 시즌 랭킹", description: "K-LOL.GG 시즌별 승률, MVP, 참여 횟수와 플레이어 랭킹을 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.9 },
  { template: "/rankings/mmr", title: "LoL 내전 MMR 랭킹", description: "K-LOL.GG 시즌의 공개 MMR과 팀 밸런스 지표를 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.8 },
  { template: "/tools/team-balance", title: "LoL 내전 팀 밸런스 도구", description: "플레이어 티어, 포지션 선호와 내전 통계로 5대5 팀 후보를 구성하세요.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.8 },
  { template: "/tools/team-balance/drafts", title: "내 팀 밸런스 초안", description: "저장한 팀 밸런스 초안을 관리합니다.", indexPolicy: "noindex" },
  { template: "/tools/team-balance/drafts/[draftId]", title: "팀 밸런스 초안", description: "비공개 팀 밸런스 초안을 확인합니다.", indexPolicy: "noindex" },
  { template: "/tools/random-team", title: "LoL 내전 랜덤 팀 나누기", description: "10명의 참가자를 무작위 또는 티어 점수 균형으로 5명씩 나누세요.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.5 },
  { template: "/tools/coin-toss", title: "내전 코인 토스", description: "진영이나 선픽 결정에 쓸 앞면과 뒷면을 공정하게 무작위로 뽑으세요.", indexPolicy: "index", changeFrequency: "monthly", priority: 0.4 },
  { template: "/applications", title: "내전 참가 신청", description: "내 참가 신청과 상태를 확인합니다.", indexPolicy: "noindex" },
  { template: "/competitions", title: "LoL 이벤트전·멸망전", description: "K-LOL.GG 이벤트전과 멸망전의 일정, 참가 모집, 팀, 대진과 결과를 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.8 },
  { template: "/competitions/events/[eventId]", title: "LoL 이벤트전", description: "이벤트전 일정, 참가 현황, 팀 편성과 경기 결과를 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.7 },
  { template: "/competitions/destruction/[tournamentId]", title: "LoL 멸망전", description: "멸망전 참가 현황, 팀, 경매, 예선과 본선 결과를 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.7 },
  { template: "/recruits", title: "LoL 내전 구인 현황", description: "지금 모집 중인 리그 오브 레전드 내전의 시간, 인원과 참여 방법을 확인하세요.", indexPolicy: "index", changeFrequency: "hourly", priority: 0.9 },
  { template: "/discipline", title: "커뮤니티 운영 현황", description: "K-LOL.GG 내전 커뮤니티의 공개 운영·징계 현황을 확인하세요.", indexPolicy: "index", changeFrequency: "daily", priority: 0.4 },
  { template: "/highlights", title: "LoL 내전 하이라이트", description: "K-LOL.GG 내전의 공개 경기 하이라이트 영상을 모아보세요.", indexPolicy: "index", changeFrequency: "weekly", priority: 0.6 },
  { template: "/highlights/[highlightId]", title: "LoL 내전 하이라이트", description: "K-LOL.GG 내전 하이라이트 영상과 설명을 확인하세요.", indexPolicy: "index", changeFrequency: "weekly", priority: 0.6 },
  { template: "/images", title: "LoL 내전 사진 갤러리", description: "K-LOL.GG 이벤트와 내전의 공개 사진을 모아보세요.", indexPolicy: "index", changeFrequency: "weekly", priority: 0.6 },
  { template: "/images/[imageId]", title: "LoL 내전 사진", description: "K-LOL.GG 이벤트와 내전의 공개 사진을 확인하세요.", indexPolicy: "index", changeFrequency: "weekly", priority: 0.6 },
] as const satisfies readonly SeoRouteContract[];

export const STATIC_SITEMAP_CONTRACTS: readonly SeoRouteContract[] = SEO_ROUTE_CONTRACTS.filter(
  (route) => route.indexPolicy === "index" && !route.template.includes("[")
);

export const ROBOTS_DISALLOW_PATHS = [
  "/admin/",
  "/api/",
  "/account/",
  "/applications",
  "/forbidden",
  "/matches/submit",
  "/matches/submissions",
  "/tools/team-balance/drafts",
] as const;

export const ROBOTS_ALLOW_PATHS = ["/", "/api/media/assets/"] as const;

export const PERFORMANCE_BUDGETS = Object.freeze({
  mobileP75LcpMs: 2_500,
  mobileP75InpMs: 200,
  mobileP75Cls: 0.1,
  initialJavaScriptKbGzip: 180,
  initialCssKbGzip: 60,
  documentKbGzip: 80,
  lcpImageMobileKb: 120,
  lcpImageDesktopKb: 180,
  maxAboveFoldPriorityImages: 1,
});

export function getSiteOrigin(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://k-lol-gg.vercel.app";
  const origin = new URL(raw);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") throw new Error("NEXT_PUBLIC_SITE_URL must use http or https");
  origin.username = "";
  origin.password = "";
  origin.pathname = "/";
  origin.search = "";
  origin.hash = "";
  return origin;
}

export function absoluteSiteUrl(pathname: string): string {
  return new URL(pathname, getSiteOrigin()).toString();
}

function brandedTitle(title: string): string {
  return title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;
}

function compactMetadataText(value: string, maximum: number): string {
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

export function createPublicMetadata(input: Readonly<{
  title: string;
  description: string;
  canonical: string;
  image?: Readonly<{ url: string; width?: number; height?: number; alt: string }>;
}>): Metadata {
  const image = input.image ?? SOCIAL_IMAGE;
  const title = compactMetadataText(input.title, 60);
  const description = compactMetadataText(input.description, 160);
  const socialTitle = brandedTitle(title);
  return {
    title,
    description,
    alternates: { canonical: input.canonical },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    openGraph: {
      type: "website",
      locale: SITE_LOCALE,
      siteName: SITE_NAME,
      url: input.canonical,
      title: socialTitle,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [image.url],
    },
  };
}

export function createNoIndexMetadata(input: Readonly<{
  title: string;
  description: string;
  canonical?: string;
}>): Metadata {
  const title = compactMetadataText(input.title, 60);
  const description = compactMetadataText(input.description, 160);
  return {
    title,
    description,
    ...(input.canonical ? { alternates: { canonical: input.canonical } } : {}),
    openGraph: null,
    twitter: null,
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
  };
}

export function routeSeoContract(template: string): SeoRouteContract {
  const contract = SEO_ROUTE_CONTRACTS.find((route) => route.template === template);
  if (!contract) throw new Error(`SEO route contract missing: ${template}`);
  return contract;
}

export function createRouteMetadata(template: string): Metadata {
  const contract = routeSeoContract(template);
  return contract.indexPolicy === "index"
    ? createPublicMetadata({ ...contract, canonical: contract.template })
    : createNoIndexMetadata({ ...contract, canonical: contract.template.includes("[") ? undefined : contract.template });
}
