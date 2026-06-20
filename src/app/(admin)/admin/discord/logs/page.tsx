import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const PAGE_SIZE_OPTIONS = [30, 50, 100];

function getString(params: Record<string, string | string[] | undefined>, key: string, fallback = "") { const value = params[key]; return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback; }
function getNumber(params: Record<string, string | string[] | undefined>, key: string, fallback: number) { const value = Number(getString(params, key, String(fallback))); return Number.isFinite(value) && value > 0 ? value : fallback; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function formatDate(value: Date | string | null | undefined) { if (!value) return "-"; return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)); }
function labelEventType(value: string | null | undefined) { return ({ JOIN: "입장", MOVE: "이동", LEAVE: "퇴장", SNAPSHOT: "스냅샷" } as Record<string, string>)[value || ""] || value || "-"; }
function buildQuery(params: Record<string, string | string[] | undefined>, patch: Record<string, string | number | undefined>) { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) { const normalized = Array.isArray(value) ? value[0] : value; if (normalized) query.set(key, normalized); } for (const [key, value] of Object.entries(patch)) { if (value === undefined || value === "") query.delete(key); else query.set(key, String(value)); } return `?${query.toString()}`; }
function getRawString(rawJson: Prisma.JsonValue | null | undefined, key: string) { if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return null; const value = (rawJson as Record<string, unknown>)[key]; return typeof value === "string" && value.trim() ? value : null; }
function getUserLabel(event: { discordId: string; memberDisplayName?: string | null; memberNickname?: string | null; discordUsername?: string | null; discordGlobalName?: string | null; rawJson?: Prisma.JsonValue | null; userAccount: null | { userId: string; discordUsername: string | null; discordGlobalName: string | null; discordServerNickname?: string | null } }) {
  return event.memberDisplayName || event.memberNickname || getRawString(event.rawJson, "memberDisplayName") || getRawString(event.rawJson, "memberNickname") || event.userAccount?.discordServerNickname || event.userAccount?.discordGlobalName || event.userAccount?.discordUsername || event.discordGlobalName || event.discordUsername || getRawString(event.rawJson, "discordGlobalName") || getRawString(event.rawJson, "discordUsername") || event.userAccount?.userId || `Discord 사용자 ${event.discordId.slice(-4)}`;
}

export default async function DiscordLogsPage(props: PageProps) {
  const params = await props.searchParams ?? {};
  const q = getString(params, "q", "").trim();
  const days = clamp(getNumber(params, "days", 7), 1, 365);
  const page = clamp(getNumber(params, "page", 1), 1, 99999);
  const pageSize = PAGE_SIZE_OPTIONS.includes(getNumber(params, "pageSize", 50)) ? getNumber(params, "pageSize", 50) : 50;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const voiceWhere: Prisma.DiscordVoiceEventWhereInput = {
    occurredAt: { gte: from },
    ...(q ? { OR: [
      { discordId: { contains: q, mode: "insensitive" } }, { channelName: { contains: q, mode: "insensitive" } }, { previousChannelName: { contains: q, mode: "insensitive" } },
      { memberDisplayName: { contains: q, mode: "insensitive" } }, { memberNickname: { contains: q, mode: "insensitive" } }, { discordUsername: { contains: q, mode: "insensitive" } }, { discordGlobalName: { contains: q, mode: "insensitive" } }, { eventType: { contains: q, mode: "insensitive" } },
      { userAccount: { is: { userId: { contains: q, mode: "insensitive" } } } },
    ] } : {}),
  };
  const [voiceTotal, events] = await Promise.all([
    prisma.discordVoiceEvent.count({ where: voiceWhere }),
    prisma.discordVoiceEvent.findMany({ where: voiceWhere, include: { userAccount: { select: { id: true, userId: true, discordUsername: true, discordGlobalName: true, discordServerNickname: true } } }, orderBy: [{ occurredAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const pageCount = Math.max(1, Math.ceil(voiceTotal / pageSize));
  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header"><div><h1 className="admin-page__title">Discord 상세 로그</h1></div><div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link></div></div>
      <DiscordOpsNav active="logs" />
      <div className="discord-ops-notice">이 로그는 원본 이벤트 확인용입니다. 구인/내전 판정은 ID 연동과 이름매칭을 함께 사용하므로, 연동되지 않은 Discord 사용자도 운영 검증에 포함될 수 있습니다.</div>
      <form className="discord-filter-card" method="get"><label>검색<input name="q" defaultValue={q} placeholder="유저명, 채널명, Discord ID" /></label><label>기간<select name="days" defaultValue={String(days)}><option value="1">최근 1일</option><option value="3">최근 3일</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label><label>페이지 크기<select name="pageSize" defaultValue={String(pageSize)}>{PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}개</option>)}</select></label><button className="admin-button" type="submit">조회</button></form>
      <section className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>음성 이벤트 로그</h2><span className="admin-muted">총 {voiceTotal}건</span></div><div className="admin-table-wrap discord-table-scroll"><table className="admin-table discord-compact-table"><thead><tr><th className="col-medium">시간</th><th className="col-small">이벤트</th><th className="col-wide">유저</th><th className="col-wide">채널</th><th className="col-wide">이전 채널</th><th className="col-medium">Discord ID</th></tr></thead><tbody>{events.length === 0 ? <tr><td colSpan={6}>음성 이벤트가 없습니다.</td></tr> : events.map((event) => <tr key={event.id}><td>{formatDate(event.occurredAt)}</td><td>{labelEventType(event.eventType)}</td><td>{getUserLabel(event)}</td><td>{event.channelName || "-"}</td><td>{event.previousChannelName || "-"}</td><td className="mono-cell">{event.discordId}</td></tr>)}</tbody></table></div><div className="discord-pagination"><Link aria-disabled={page <= 1} className={page <= 1 ? "is-disabled" : ""} href={buildQuery(params, { page: Math.max(1, page - 1) })}>이전</Link><span>{page} / {pageCount}</span><Link aria-disabled={page >= pageCount} className={page >= pageCount ? "is-disabled" : ""} href={buildQuery(params, { page: Math.min(pageCount, page + 1) })}>다음</Link></div></section>
    </main>
  );
}