import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
function getString(params: Record<string, string | string[] | undefined>, key: string, fallback = "") { const value = params[key]; return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback; }
function getNumber(params: Record<string, string | string[] | undefined>, key: string, fallback: number) { const value = Number(getString(params, key, String(fallback))); return Number.isFinite(value) && value > 0 ? value : fallback; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function formatDurationSeconds(totalSeconds: number) { const value = Math.max(0, Math.floor(totalSeconds)); const h = Math.floor(value / 3600); const m = Math.floor((value % 3600) / 60); if (h > 0) return `${h}시간 ${m}분`; return `${m}분`; }
function getRawString(rawJson: Prisma.JsonValue | null | undefined, key: string) { if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return null; const value = (rawJson as Record<string, unknown>)[key]; return typeof value === "string" && value.trim() ? value : null; }
function label(event: { discordId: string; memberDisplayName?: string | null; memberNickname?: string | null; discordUsername?: string | null; discordGlobalName?: string | null; rawJson?: Prisma.JsonValue | null; userAccount: null | { userId: string; discordUsername: string | null; discordGlobalName: string | null; discordServerNickname?: string | null } }) { return event.memberDisplayName || event.memberNickname || getRawString(event.rawJson, "memberDisplayName") || getRawString(event.rawJson, "memberNickname") || event.userAccount?.discordServerNickname || event.userAccount?.discordGlobalName || event.userAccount?.discordUsername || event.discordGlobalName || event.discordUsername || event.userAccount?.userId || `Discord 사용자 ${event.discordId.slice(-4)}`; }

type VoiceSession = { discordId: string; label: string; channelId: string; channelName: string | null; start: Date; end: Date };

export default async function DiscordStatsPage(props: PageProps) {
  const params = await props.searchParams ?? {};
  const q = getString(params, "q", "").trim();
  const days = clamp(getNumber(params, "days", 7), 1, 365);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await prisma.discordVoiceEvent.findMany({ where: { occurredAt: { gte: from } }, include: { userAccount: { select: { id: true, userId: true, discordUsername: true, discordGlobalName: true, discordServerNickname: true } } }, orderBy: [{ occurredAt: "asc" }], take: 5000 });

  const open = new Map<string, VoiceSession>();
  const sessions: VoiceSession[] = [];
  const labelByDiscordId = new Map<string, string>();
  for (const event of events) {
    const userLabel = label(event);
    labelByDiscordId.set(event.discordId, userLabel);
    const key = event.discordId;
    if (event.eventType === "JOIN" || event.eventType === "SNAPSHOT") {
      if (event.channelId && !open.has(key)) open.set(key, { discordId: event.discordId, label: userLabel, channelId: event.channelId, channelName: event.channelName, start: event.occurredAt, end: event.occurredAt });
    } else if (event.eventType === "MOVE") {
      const existing = open.get(key);
      if (existing) sessions.push({ ...existing, end: event.occurredAt });
      if (event.channelId) open.set(key, { discordId: event.discordId, label: userLabel, channelId: event.channelId, channelName: event.channelName, start: event.occurredAt, end: event.occurredAt });
      else open.delete(key);
    } else if (event.eventType === "LEAVE") {
      const existing = open.get(key);
      if (existing) sessions.push({ ...existing, end: event.occurredAt });
      open.delete(key);
    }
  }
  const now = new Date();
  for (const session of open.values()) sessions.push({ ...session, end: now });

  const durationByUser = new Map<string, { label: string; seconds: number }>();
  for (const session of sessions) {
    const seconds = Math.max(0, Math.floor((session.end.getTime() - session.start.getTime()) / 1000));
    const prev = durationByUser.get(session.discordId) || { label: session.label, seconds: 0 };
    prev.seconds += seconds; prev.label = session.label || prev.label; durationByUser.set(session.discordId, prev);
  }
  const stayTop10 = Array.from(durationByUser.entries()).map(([discordId, item]) => ({ discordId, label: item.label, seconds: item.seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 10);

  const targetIds = q ? Array.from(labelByDiscordId.entries()).filter(([, userLabel]) => userLabel.toLowerCase().includes(q.toLowerCase())).map(([discordId]) => discordId) : [];
  const targetIdSet = new Set(targetIds);
  const targetSessions = sessions.filter((session) => targetIdSet.has(session.discordId));
  const coPresence = new Map<string, { label: string; seconds: number }>();
  for (const target of targetSessions) {
    for (const other of sessions) {
      if (other.discordId === target.discordId || other.channelId !== target.channelId) continue;
      const overlapMs = Math.min(target.end.getTime(), other.end.getTime()) - Math.max(target.start.getTime(), other.start.getTime());
      if (overlapMs <= 0) continue;
      const prev = coPresence.get(other.discordId) || { label: other.label, seconds: 0 };
      prev.seconds += Math.floor(overlapMs / 1000); prev.label = other.label || prev.label; coPresence.set(other.discordId, prev);
    }
  }
  const coPresenceTop10 = Array.from(coPresence.entries()).map(([discordId, item]) => ({ discordId, label: item.label, seconds: item.seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 10);

  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header"><div><h1 className="admin-page__title">Discord 체류 통계</h1><p className="admin-page__description">체류시간 TOP 10과 이름 검색 기준 같이 있던 사람 TOP 10입니다. ID 연동 여부와 무관하게 Discord 표시명을 사용합니다.</p></div><div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link></div></div>
      <DiscordOpsNav active="stats" />
      <div className="discord-ops-notice">검색어는 이름 일부로 입력하면 됩니다. 같이 있던 사람은 같은 음성방에 겹쳐 있던 시간을 합산합니다.</div>
      <form className="discord-filter-card" method="get"><label>이름 검색<input name="q" defaultValue={q} placeholder="예: 재현" /></label><label>기간<select name="days" defaultValue={String(days)}><option value="1">최근 1일</option><option value="3">최근 3일</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label><button className="admin-button" type="submit">조회</button></form>
      <section className="discord-ops-two-col">
        <div className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>체류시간 TOP 10</h2></div><div className="discord-ops-list discord-stats-list">{stayTop10.length === 0 ? <p className="admin-muted">체류시간 데이터가 없습니다.</p> : stayTop10.map((item, index) => <div className="discord-ops-list-row" key={item.discordId}><strong>{index + 1}. {item.label}</strong><span>{formatDurationSeconds(item.seconds)}</span></div>)}</div></div>
        <div className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>같이 있던 사람 TOP 10</h2></div>{!q ? <p className="admin-muted">검색어에 이름을 입력하면 같은 음성방에 가장 오래 같이 있던 사람을 계산합니다.</p> : <div className="discord-ops-list discord-stats-list">{coPresenceTop10.length === 0 ? <p className="admin-muted">같이 있던 사람 데이터가 없습니다.</p> : coPresenceTop10.map((item, index) => <div className="discord-ops-list-row" key={item.discordId}><strong>{index + 1}. {item.label}</strong><span>{formatDurationSeconds(item.seconds)}</span></div>)}</div>}</div>
      </section>
    </main>
  );
}