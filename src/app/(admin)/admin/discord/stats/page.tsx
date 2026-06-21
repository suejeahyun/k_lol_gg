import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma/client";
import { addDays, getKstDateKey, getKstStartOfDate } from "@/lib/date/kst";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
function getString(params: Record<string, string | string[] | undefined>, key: string, fallback = "") { const value = params[key]; return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback; }
function getNumber(params: Record<string, string | string[] | undefined>, key: string, fallback: number) { const value = Number(getString(params, key, String(fallback))); return Number.isFinite(value) && value > 0 ? value : fallback; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function formatDurationSeconds(totalSeconds: number) { const value = Math.max(0, Math.floor(totalSeconds)); const h = Math.floor(value / 3600); const m = Math.floor((value % 3600) / 60); if (h > 0) return `${h}시간 ${m}분`; return `${m}분`; }
function getRawString(rawJson: Prisma.JsonValue | null | undefined, key: string) { if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return null; const value = (rawJson as Record<string, unknown>)[key]; return typeof value === "string" && value.trim() ? value : null; }
function label(event: { discordId: string; memberDisplayName?: string | null; memberNickname?: string | null; discordUsername?: string | null; discordGlobalName?: string | null; rawJson?: Prisma.JsonValue | null; userAccount: null | { userId: string; discordUsername: string | null; discordGlobalName: string | null; discordServerNickname?: string | null } }) { return event.memberDisplayName || event.memberNickname || getRawString(event.rawJson, "memberDisplayName") || getRawString(event.rawJson, "memberNickname") || event.userAccount?.discordServerNickname || event.userAccount?.discordGlobalName || event.userAccount?.discordUsername || event.discordGlobalName || event.discordUsername || event.userAccount?.userId || `Discord 사용자 ${event.discordId.slice(-4)}`; }
function getKstHour(date: Date) { return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false, hourCycle: "h23" }).format(date)); }
function formatKstMonthDay(dateKey: string) { const [, month, day] = dateKey.split("-"); return `${Number(month)}/${Number(day)}`; }
function normalizeName(value: string | null | undefined) { return String(value || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\s#·ㆍ_\-\.\/\\|()[\]{}]+/g, "").toLowerCase(); }
function lateWarningWhere(createdAt?: { gte?: Date; lte?: Date }): Prisma.UserDisciplineRecordWhereInput {
  const sourceFilter: Prisma.UserDisciplineRecordWhereInput = { OR: [{ sourceRefType: "RECRUIT_LATE" }, { sourceRefKey: { startsWith: "RECRUIT_LATE:" } }] };
  if (!createdAt) return sourceFilter;
  return { AND: [sourceFilter, { createdAt }] };
}
function dmStatusLabel(status?: string | null) { const map: Record<string, string> = { SENT: "DM 성공", FAILED: "DM 실패", SKIPPED: "DM 불가", PENDING: "대기", UNKNOWN: "미확인" }; return map[status || "UNKNOWN"] || status || "미확인"; }

type VoiceSession = { discordId: string; label: string; channelId: string; channelName: string | null; start: Date; end: Date };
type ChartItem = { label: string; value: number };
const chartVars = ["var(--discord-chart-1)", "var(--discord-chart-2)", "var(--discord-chart-3)", "var(--discord-chart-4)", "var(--discord-chart-5)"];

function Metric({ label, value, caption }: { label: string; value: string | number; caption: string }) {
  return <div className="discord-ops-stat"><span>{label}</span><strong>{value}</strong><em>{caption}</em></div>;
}

function BarChartCard({ title, caption, items, suffix = "" }: { title: string; caption: string; items: ChartItem[]; suffix?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="admin-card discord-chart-card">
      <div className="discord-chart-head"><h2>{title}</h2><span>{caption}</span></div>
      <div className="discord-bar-chart">
        {items.length === 0 ? <p className="admin-muted">표시할 데이터가 없습니다.</p> : items.map((item, index) => (
          <div className="discord-bar-row" key={`${item.label}-${index}`}>
            <span title={item.label}>{item.label}</span>
            <div><i style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} /></div>
            <strong>{item.value}{suffix}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChartCard({ title, caption, items }: { title: string; caption: string; items: ChartItem[] }) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  let acc = 0;
  const segments = total > 0 ? items.map((item, index) => { const start = acc; const end = acc + (Math.max(0, item.value) / total) * 360; acc = end; return `${chartVars[index % chartVars.length]} ${start}deg ${end}deg`; }).join(", ") : "rgba(51, 65, 85, .65) 0deg 360deg";
  const style = { "--discord-donut": `conic-gradient(${segments})` } as CSSProperties;
  return (
    <div className="admin-card discord-chart-card">
      <div className="discord-chart-head"><h2>{title}</h2><span>{caption}</span></div>
      <div className="discord-donut-layout">
        <div className="discord-donut" style={style}><strong>{total}</strong><span>total</span></div>
        <div className="discord-chart-legend">
          {items.map((item, index) => { const pct = total > 0 ? Math.round((item.value / total) * 100) : 0; return <div key={item.label}><i style={{ background: chartVars[index % chartVars.length] }} /><span>{item.label}</span><strong>{item.value}</strong><em>{pct}%</em></div>; })}
        </div>
      </div>
    </div>
  );
}

function TrendChartCard({ title, caption, data }: { title: string; caption: string; data: Array<{ dateKey: string; label: string; recruitCount: number; lateWarningCount: number }> }) {
  const w = 560; const h = 150; const padX = 22; const padY = 18;
  const max = Math.max(1, ...data.flatMap((item) => [item.recruitCount, item.lateWarningCount]));
  const point = (value: number, index: number) => { const x = data.length <= 1 ? w / 2 : padX + ((w - padX * 2) * index) / (data.length - 1); const y = h - padY - ((h - padY * 2) * value) / max; return `${x},${y}`; };
  return (
    <div className="admin-card discord-chart-card discord-chart-card--wide">
      <div className="discord-chart-head"><h2>{title}</h2><span>{caption}</span></div>
      <svg className="discord-trend-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} />
        <polyline className="discord-trend-line discord-trend-line--recruit" points={data.map((item, index) => point(item.recruitCount, index)).join(" ")} />
        <polyline className="discord-trend-line discord-trend-line--late" points={data.map((item, index) => point(item.lateWarningCount, index)).join(" ")} />
      </svg>
      <div className="discord-trend-labels" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((item) => <span key={item.dateKey}>{item.label}<em>구인 {item.recruitCount} · 지각 {item.lateWarningCount}</em></span>)}
      </div>
      <div className="discord-chart-legend discord-chart-legend--inline"><div><i style={{ background: "var(--discord-chart-1)" }} /><span>구인</span></div><div><i style={{ background: "var(--discord-chart-3)" }} /><span>지각</span></div></div>
    </div>
  );
}

export default async function DiscordStatsPage(props: PageProps) {
  const params = await props.searchParams ?? {};
  const q = getString(params, "q", "").trim();
  const days = clamp(getNumber(params, "days", 7), 1, 90);
  const now = new Date();
  const todayStart = getKstStartOfDate(getKstDateKey(now));
  const rangeEnd = addDays(todayStart, 1);
  const from = addDays(rangeEnd, -days);
  const events = await prisma.discordVoiceEvent.findMany({ where: { occurredAt: { gte: from, lte: rangeEnd } }, include: { userAccount: { select: { id: true, userId: true, discordUsername: true, discordGlobalName: true, discordServerNickname: true } } }, orderBy: [{ occurredAt: "asc" }], take: 8000 });

  const [recruits, lateWarnings, linkedUsers, approvedUsers, autoFinishedCount] = await Promise.all([
    prisma.recruitParty.findMany({ where: { createdAt: { gte: from, lte: rangeEnd } }, select: { id: true, status: true, createdAt: true, scheduledStartAt: true } }),
    prisma.userDisciplineRecord.findMany({ where: lateWarningWhere({ gte: from, lte: rangeEnd }), select: { id: true, targetName: true, discordDmStatus: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.userAccount.count({ where: { discordId: { not: null } } }),
    prisma.userAccount.count({ where: { status: "APPROVED" } }),
    prisma.recruitPartyDiscordMonitor.count({ where: { autoFinishedAt: { gte: from, lte: rangeEnd } } }),
  ]);

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
  for (const session of open.values()) sessions.push({ ...session, end: now });

  const durationByUser = new Map<string, { label: string; seconds: number }>();
  const durationByChannel = new Map<string, { label: string; seconds: number }>();
  for (const session of sessions) {
    const seconds = Math.max(0, Math.floor((session.end.getTime() - session.start.getTime()) / 1000));
    const prev = durationByUser.get(session.discordId) || { label: session.label, seconds: 0 };
    prev.seconds += seconds; prev.label = session.label || prev.label; durationByUser.set(session.discordId, prev);
    const channelKey = session.channelId || session.channelName || "unknown";
    const channelPrev = durationByChannel.get(channelKey) || { label: session.channelName || "알 수 없는 음성방", seconds: 0 };
    channelPrev.seconds += seconds; durationByChannel.set(channelKey, channelPrev);
  }
  const stayTop10 = Array.from(durationByUser.entries()).map(([discordId, item]) => ({ discordId, label: item.label, seconds: item.seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 10);
  const stayTopBars = stayTop10.map((item) => ({ label: item.label, value: Math.round(item.seconds / 60) }));
  const channelTopBars = Array.from(durationByChannel.values()).sort((a, b) => b.seconds - a.seconds).slice(0, 10).map((item) => ({ label: item.label, value: Math.round(item.seconds / 60) }));

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

  const dayKeys = Array.from({ length: Math.min(days, 30) }, (_, index) => getKstDateKey(addDays(rangeEnd, -Math.min(days, 30) + index)));
  const recruitByDay = new Map(dayKeys.map((key) => [key, 0]));
  const lateByDay = new Map(dayKeys.map((key) => [key, 0]));
  for (const row of recruits) { const key = getKstDateKey(row.createdAt); if (recruitByDay.has(key)) recruitByDay.set(key, (recruitByDay.get(key) || 0) + 1); }
  for (const row of lateWarnings) { const key = getKstDateKey(row.createdAt); if (lateByDay.has(key)) lateByDay.set(key, (lateByDay.get(key) || 0) + 1); }
  const trend = dayKeys.map((key) => ({ dateKey: key, label: formatKstMonthDay(key), recruitCount: recruitByDay.get(key) || 0, lateWarningCount: lateByDay.get(key) || 0 }));

  const dmCounts = new Map<string, number>();
  const lateTargets = new Map<string, { name: string; count: number }>();
  for (const row of lateWarnings) {
    const dm = row.discordDmStatus || "UNKNOWN";
    dmCounts.set(dm, (dmCounts.get(dm) || 0) + 1);
    const name = row.targetName || "이름 없음";
    const key = normalizeName(name) || name;
    const item = lateTargets.get(key) || { name, count: 0 };
    item.count += 1;
    lateTargets.set(key, item);
  }
  const lateTargetBars = Array.from(lateTargets.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10).map((item) => ({ label: item.name, value: item.count }));
  const dmItems = Array.from(dmCounts.entries()).map(([labelText, value]) => ({ label: dmStatusLabel(labelText), value }));

  const recruitHourCounts = new Map<number, number>();
  for (const row of recruits) {
    const hour = getKstHour(row.createdAt);
    recruitHourCounts.set(hour, (recruitHourCounts.get(hour) || 0) + 1);
  }
  const hourBars = Array.from(recruitHourCounts.entries()).sort((a, b) => a[0] - b[0]).map(([hour, value]) => ({ label: `${String(hour).padStart(2, "0")}시`, value }));
  const linkRate = approvedUsers > 0 ? Math.round((linkedUsers / approvedUsers) * 1000) / 10 : 0;

  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header"><div><h1 className="admin-page__title">Discord 운영 상세 통계</h1><p className="admin-muted">구인·음성방·지각 경고를 기간별로 비교합니다.</p></div><div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link></div></div>
      <DiscordOpsNav active="stats" />
      <div className="discord-ops-notice">검색어는 이름 일부로 입력하면 됩니다. 같이 있던 사람은 같은 음성방에 겹쳐 있던 시간을 합산합니다.</div>
      <form className="discord-filter-card" method="get"><label>이름 검색<input name="q" defaultValue={q} placeholder="예: 재현" /></label><label>기간<select name="days" defaultValue={String(days)}><option value="1">오늘</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label><button className="admin-button" type="submit">조회</button></form>

      <section className="discord-ops-stat-grid">
        <Metric label="기간 내 구인" value={`${recruits.length}건`} caption={`진행중 ${recruits.filter((item) => String(item.status) === "IN_PROGRESS").length}건`} />
        <Metric label="지각 경고" value={`${lateWarnings.length}건`} caption="자동 지각 경고 기준" />
        <Metric label="자동종료" value={`${autoFinishedCount}건`} caption="Discord 모니터 autoFinishedAt 기준" />
        <Metric label="음성 이벤트" value={`${events.length}건`} caption={`세션 ${sessions.length}개 계산`} />
        <Metric label="Discord 연동률" value={`${linkRate}%`} caption={`${linkedUsers}/${approvedUsers}명`} />
        <Metric label="시작시간 누락" value={`${recruits.filter((item) => !item.scheduledStartAt).length}건`} caption="검증/지각 대상 제외 가능" />
      </section>

      <section className="discord-chart-grid">
        <TrendChartCard title="구인 · 지각 추이" caption={`최근 ${Math.min(days, 30)}일 일별 흐름`} data={trend} />
        <DonutChartCard title="지각 경고 DM 상태" caption="선택 기간 자동 지각 경고 기준" items={dmItems} />
        <BarChartCard title="시간대별 구인 수" caption="카카오톡 구인 생성 시간 기준" items={hourBars} suffix="건" />
        <BarChartCard title="체류시간 TOP 10" caption="유저별 음성방 총 체류시간" items={stayTopBars} suffix="분" />
        <BarChartCard title="음성방 사용 TOP 10" caption="채널별 누적 체류시간" items={channelTopBars} suffix="분" />
        <BarChartCard title="지각 경고 TOP 10" caption="반복 지각 대상 확인" items={lateTargetBars} suffix="건" />
      </section>

      <section className="discord-ops-two-col">
        <div className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>체류시간 상세 TOP 10</h2></div><div className="discord-ops-list discord-stats-list">{stayTop10.length === 0 ? <p className="admin-muted">체류시간 데이터가 없습니다.</p> : stayTop10.map((item, index) => <div className="discord-ops-list-row" key={item.discordId}><strong>{index + 1}. {item.label}</strong><span>{formatDurationSeconds(item.seconds)}</span></div>)}</div></div>
        <div className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>같이 있던 사람 TOP 10</h2></div>{!q ? <p className="admin-muted">검색어에 이름을 입력하면 같은 음성방에 가장 오래 같이 있던 사람을 계산합니다.</p> : <div className="discord-ops-list discord-stats-list">{coPresenceTop10.length === 0 ? <p className="admin-muted">같이 있던 사람 데이터가 없습니다.</p> : coPresenceTop10.map((item, index) => <div className="discord-ops-list-row" key={item.discordId}><strong>{index + 1}. {item.label}</strong><span>{formatDurationSeconds(item.seconds)}</span></div>)}</div>}</div>
      </section>
    </main>
  );
}
