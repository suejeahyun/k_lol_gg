export const USAGE_ACTIONS = {
  "navigation.open": "전체 메뉴 열기",
  "navigation.header": "상단 메뉴에서 이동",
  "navigation.mobile": "모바일 메뉴에서 이동",
  "navigation.menu": "전체 메뉴에서 이동",
  "navigation.home": "홈 바로가기에서 이동",
  "search.open": "기능 검색 열기",
  "search.empty": "기능 검색 결과 없음",
  "search.select": "기능 검색 결과 선택",
  "application.saved": "내전 신청 저장 완료",
  "application.cancelled": "내전 신청 취소 완료",
  "event.applied": "이벤트전 신청 완료",
  "destruction.applied": "멸망전 신청 완료",
  "match.submitted": "경기 결과 접수 완료",
  "team-balance.saved": "팀 구성 저장 완료",
  "recruit.instructions": "모집 참가 방법 보기",
  "support.submitted": "운영팀 문의 접수 완료",
  "team-balance.quick": "팀 밸런스 추천 계산",
  "team-balance.riot": "솔랭 갱신 후 분석",
  "coin-toss.start": "동전 던지기",
  "coin-toss.copy": "동전 결과 복사",
} as const;

export const USAGE_ROUTES: Record<string, string> = {
  "/help": "도움말·문의",
  "/help/contact": "운영팀 문의",
  "/competitions/events": "이벤트전 목록", "/competitions/destruction": "멸망전 목록",
  "/login": "로그인", "/signup": "회원가입",
  "/": "홈", "/players": "플레이어 검색", "/players/:id": "플레이어 전적",
  "/matches": "경기 목록", "/matches/:id": "경기 상세", "/matches/submit": "경기 제출",
  "/matches/submissions": "내 경기 접수", "/rankings": "시즌 랭킹", "/rankings/mmr": "MMR 랭킹",
  "/recruits": "구인", "/applications": "시즌 참가 신청",
  "/competitions": "대회 목록", "/competitions/events/:id": "이벤트전 상세",
  "/competitions/destruction/:id": "멸망전 상세",
  "/highlights": "하이라이트", "/highlights/:id": "하이라이트 상세",
  "/images": "갤러리", "/images/:id": "사진 상세", "/discipline": "징계 안내",
  "/tools/team-balance": "팀 밸런스", "/tools/team-balance/drafts": "팀 초안 목록",
  "/tools/team-balance/drafts/:id": "팀 초안 상세", "/tools/random-team": "랜덤 팀",
  "/tools/coin-toss": "동전 던지기", "/start": "시작 안내", "/install": "앱 설치 안내",
  "/help/kakao": "카카오 안내", "/help/recruits": "구인 안내", "/help/riot": "Riot 안내",
  "/account": "내 계정", "/account/riot": "Riot 연결", "/account/discipline": "내 과제",
};

// Only reviewed templates leave the browser. Never send IDs, queries, text or form values.
export function usageRoute(path: string): string | null {
  if (typeof path !== "string" || path.length > 512 || !path.startsWith("/") || path.startsWith("//")) return null;
  const clean = path.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  if (Object.hasOwn(USAGE_ROUTES, clean)) return clean;
  for (const template of Object.keys(USAGE_ROUTES).filter((key) => key.endsWith("/:id"))) {
    const prefix = template.slice(0, -3);
    const segment = clean.startsWith(prefix) ? clean.slice(prefix.length) : "";
    if (segment && !segment.includes("/") && /^[\p{L}\p{N}_%-]+$/u.test(segment)) return template;
  }
  return null;
}

export type UsageEvent = { id: string; kind: "page" | "click" | "search"; route: string; target: string | null };
export function parseUsageEvent(value: unknown): UsageEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => !["id", "kind", "route", "target"].includes(key))) return null;
  if (typeof v.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)) return null;
  if (typeof v.route !== "string" || !Object.hasOwn(USAGE_ROUTES, v.route)) return null;
  if (v.kind === "page" && v.target === null) return { id: v.id, kind: v.kind, route: v.route, target: null };
  if (v.kind === "search" && v.route === "/players" && v.target === null) return { id: v.id, kind: v.kind, route: v.route, target: null };
  if (v.kind === "click" && typeof v.target === "string" &&
    (Object.hasOwn(USAGE_ROUTES, v.target) || Object.hasOwn(USAGE_ACTIONS, v.target))) {
    return { id: v.id, kind: v.kind, route: v.route, target: v.target };
  }
  return null;
}

export const KST_OFFSET = 9 * 60 * 60 * 1000;
export const DAY_MS = 86_400_000;
export const kstDate = (date: Date) => new Date(date.getTime() + KST_OFFSET).toISOString().slice(0, 10);
export type UsageRange = { from: string; to: string; start: Date; end: Date; days: number };
export function usageRange(from?: string, to?: string, now = new Date()): UsageRange {
  const today = kstDate(now);
  const last = to ?? today;
  const first = from ?? kstDate(new Date(now.getTime() - 29 * DAY_MS));
  const valid = (v: string) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!valid(first) || !valid(last) || last > today || first < kstDate(new Date(now.getTime() - 179 * DAY_MS))) throw new Error("최근 180일 범위에서 올바른 날짜를 선택해 주세요.");
  const start = new Date(`${first}T00:00:00+09:00`);
  const end = new Date(new Date(`${last}T00:00:00+09:00`).getTime() + DAY_MS);
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  if (days < 1 || days > 92) throw new Error("조회 기간은 1일부터 92일까지 선택할 수 있습니다.");
  return { from: first, to: last, start, end, days };
}

export function usageEnabled(env: Record<string, string | undefined>): boolean {
  return env.USAGE_ANALYTICS_ENABLED === "true" && env.V2_PUBLIC_DATA_SOURCE === "postgres" &&
    (!env.VERCEL_ENV || env.VERCEL_ENV === "production") && (env.USAGE_ANALYTICS_SECRET?.length ?? 0) >= 32;
}

export function excludedUsageAgent(userAgent: string): boolean {
  return /bot|crawler|spider|headless|playwright|puppeteer|preview|monitor|uptime/i.test(userAgent);
}
