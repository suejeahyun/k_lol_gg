import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
type ChartItem = { label: string; value: number };
type TrendPoint = { dateKey: string; label: string; recruitCount: number; lateWarningCount: number; errorCount: number; autoFinishCount: number };
type VoiceSession = { discordId: string; label: string; channelId: string; channelName: string | null; start: Date; end: Date };

function getString(params: Record<string, string | string[] | undefined>, key: string, fallback = "") {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}
function getNumber(params: Record<string, string | string[] | undefined>, key: string, fallback: number) {
  const value = Number(getString(params, key, String(fallback)));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function formatDurationSeconds(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}
function getRawString(rawJson: Prisma.JsonValue | null | undefined, key: string) {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return null;
  const value = (rawJson as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}
function label(event: { discordId: string; memberDisplayName?: string | null; memberNickname?: string | null; discordUsername?: string | null; discordGlobalName?: string | null; rawJson?: Prisma.JsonValue | null; userAccount: null | { userId: string; discordUsername: string | null; discordGlobalName: string | null; discordServerNickname?: string | null } }) {
  return event.memberDisplayName || event.memberNickname || getRawString(event.rawJson, "memberDisplayName") || getRawString(event.rawJson, "memberNickname") || event.userAccount?.discordServerNickname || event.userAccount?.discordGlobalName || event.userAccount?.discordUsername || event.discordGlobalName || event.discordUsername || event.userAccount?.userId || `Discord 사용자 ${event.discordId.slice(-4)}`;
}
function normalizeName(value: string | null | undefined) {
  return String(value || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\s#·ㆍ_\-\.\/\\|()[\]{}]+/g, "").toLowerCase();
}
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function getKstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function formatKstMonthDay(key: string) {
  const [, month, day] = key.split("-");
  return `${Number(month)}.${Number(day)}`;
}
function getKstHour(date: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(date));
}
function formatKstDateTime(date: Date | string | null | undefined) {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}
function lateWarningWhere(createdAt?: { gte?: Date; lte?: Date }): Prisma.UserDisciplineRecordWhereInput {
  return {
    ...(createdAt ? { createdAt } : {}),
    OR: [
      { sourceRefType: "RECRUIT_LATE" },
      { sourceRefKey: { startsWith: "RECRUIT_LATE:" } },
      { source: "LATE" },
      { reason: { contains: "지각" } },
    ],
  };
}
function dmStatusLabel(status?: string | null) {
  const map: Record<string, string> = { SENT: "DM 성공", FAILED: "DM 실패", SKIPPED: "DM 불가", PENDING: "대기", UNKNOWN: "미확인" };
  return map[status || "UNKNOWN"] || status || "미확인";
}
function statusKo(status?: string | null) {
  const value = String(status || "UNKNOWN").toUpperCase();
  const map: Record<string, string> = { SUCCESS: "성공", ERROR: "오류", FAILED: "실패", SENT: "성공", SKIPPED: "불가", INFO: "정보", UNKNOWN: "미확인" };
  return map[value] || value;
}
function typeKo(type?: string | null) {
  const value = String(type || "UNKNOWN");
  const map: Record<string, string> = {
    AUTO_FINISH_CHECK_SUCCESS: "자동종료 검사 성공",
    AUTO_FINISH_CHECK_ERROR: "자동종료 검사 오류",
    RECRUIT_LATE_WARNING_CHECK_SUCCESS: "지각 검사 성공",
    RECRUIT_LATE_WARNING_CHECK_ERROR: "지각 검사 오류",
    DM_SEND_SUCCESS: "DM 성공",
    DM_SEND_FAILED: "DM 실패",
    DM_SEND_SKIPPED: "DM 불가",
    ADMIN_LOG_SEND_SUCCESS: "관리자 로그 성공",
    ADMIN_LOG_SEND_FAILED: "관리자 로그 실패",
    REMOTE_SETTINGS_APPLIED: "설정 반영",
    REMOTE_SETTINGS_ERROR: "설정 반영 오류",
    HEARTBEAT_ERROR: "하트비트 오류",
    BOT_START: "봇 시작",
    BOT_SHUTDOWN: "봇 종료",
  };
  return map[value] || value;
}
function countBy<T>(rows: T[], getKey: (row: T) => string | null | undefined) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row) || "미확인";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
function Metric({ label, value, caption, tone = "default" }: { label: string; value: string | number; caption: string; tone?: "default" | "ok" | "warn" | "error" }) {
  return <div className={`discord-ops-stat discord-ops-stat--${tone}`}><span>{label}</span><strong>{value}</strong><em>{caption}</em></div>;
}

function Section({ id, title, caption, children }: { id: string; title: string; caption: string; children: ReactNode }) {
  return (
    <section className="discord-readable-section" id={id}>
      <div className="discord-readable-section__head">
        <div>
          <span className="discord-readable-section__eyebrow">운영 통계</span>
          <h2>{title}</h2>
          <p>{caption}</p>
        </div>
        <a className="discord-readable-section__top" href="#top">상단</a>
      </div>
      {children}
    </section>
  );
}

function InsightCard({ title, value, caption, tone = "default" }: { title: string; value: string | number; caption: string; tone?: "default" | "ok" | "warn" | "error" }) {
  return (
    <div className={`discord-insight-card discord-insight-card--${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </div>
  );
}
const chartVars = ["var(--discord-chart-1)", "var(--discord-chart-2)", "var(--discord-chart-3)", "var(--discord-chart-4)", "var(--discord-chart-5)"];
function DonutChartCard({ title, caption, items }: { title: string; caption: string; items: ChartItem[] }) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  let acc = 0;
  const segments = total > 0 ? items.map((item, index) => { const start = acc; const end = acc + (Math.max(0, item.value) / total) * 360; acc = end; return `${chartVars[index % chartVars.length]} ${start}deg ${end}deg`; }).join(", ") : "rgba(51, 65, 85, .65) 0deg 360deg";
  return <div className="admin-card discord-chart-card"><div className="discord-chart-head"><h2>{title}</h2><span>{caption}</span></div><div className="discord-donut-layout"><div className="discord-donut" style={{ "--discord-donut": `conic-gradient(${segments})` } as CSSProperties}><strong>{total}</strong><span>total</span></div><div className="discord-chart-legend">{items.map((item, index) => { const pct = total > 0 ? Math.round((item.value / total) * 100) : 0; return <div key={item.label}><i style={{ background: chartVars[index % chartVars.length] }} /><span>{item.label}</span><strong>{item.value}</strong><em>{pct}%</em></div>; })}</div></div></div>;
}
function BarChartCard({ title, caption, items, suffix = "" }: { title: string; caption: string; items: ChartItem[]; suffix?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return <div className="admin-card discord-chart-card"><div className="discord-chart-head"><h2>{title}</h2><span>{caption}</span></div><div className="discord-bar-chart">{items.length === 0 ? <p className="admin-muted">표시할 데이터가 없습니다.</p> : items.map((item, index) => <div className="discord-bar-row" key={`${item.label}-${index}`}><span title={item.label}>{item.label}</span><div><i style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} /></div><strong>{item.value}{suffix}</strong></div>)}</div></div>;
}
function TrendChartCard({ title, caption, data }: { title: string; caption: string; data: TrendPoint[] }) {
  const w = 420, h = 170, padX = 25, padY = 20;
  const max = Math.max(1, ...data.flatMap((item) => [item.recruitCount, item.lateWarningCount, item.errorCount, item.autoFinishCount]));
  const point = (value: number, index: number) => { const x = data.length <= 1 ? w / 2 : padX + ((w - padX * 2) * index) / (data.length - 1); const y = h - padY - ((h - padY * 2) * value) / max; return `${x},${y}`; };
  const recruitPoints = data.map((item, index) => point(item.recruitCount, index)).join(" ");
  const latePoints = data.map((item, index) => point(item.lateWarningCount, index)).join(" ");
  const errorPoints = data.map((item, index) => point(item.errorCount, index)).join(" ");
  const autoPoints = data.map((item, index) => point(item.autoFinishCount, index)).join(" ");
  return <div className="admin-card discord-chart-card discord-chart-card--wide"><div className="discord-chart-head"><h2>{title}</h2><span>{caption}</span></div><svg className="discord-trend-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}><line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} /><polyline className="discord-trend-line discord-trend-line--recruit" points={recruitPoints} /><polyline className="discord-trend-line discord-trend-line--late" points={latePoints} /><polyline className="discord-trend-line discord-trend-line--error" points={errorPoints} /><polyline className="discord-trend-line discord-trend-line--auto" points={autoPoints} /></svg><div className="discord-trend-labels">{data.map((item) => <span key={item.dateKey}>{item.label}<em>구인 {item.recruitCount} · 지각 {item.lateWarningCount} · 오류 {item.errorCount}</em></span>)}</div><div className="discord-chart-legend discord-chart-legend--inline"><div><i style={{ background: "var(--discord-chart-1)" }} /><span>구인</span></div><div><i style={{ background: "var(--discord-chart-3)" }} /><span>지각</span></div><div><i style={{ background: "var(--discord-chart-4)" }} /><span>오류</span></div><div><i style={{ background: "var(--discord-chart-2)" }} /><span>자동종료</span></div></div></div>;
}

export default async function DiscordStatsPage(props: PageProps) {
  const params = await props.searchParams ?? {};
  const q = getString(params, "q", "").trim();
  const days = clamp(getNumber(params, "days", 7), 1, 365);
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rangeEnd = now;

  const [events, recruits, monitors, lateWarnings, allWarnings, linkedUsers, approvedUsers, operationLogs, heartbeats] = await Promise.all([
    prisma.discordVoiceEvent.findMany({ where: { occurredAt: { gte: from } }, include: { userAccount: { select: { id: true, userId: true, discordUsername: true, discordGlobalName: true, discordServerNickname: true } } }, orderBy: [{ occurredAt: "asc" }], take: 12000 }),
    prisma.recruitParty.findMany({ where: { createdAt: { gte: from, lte: rangeEnd } }, select: { id: true, recruitNo: true, status: true, type: true, maxMembers: true, createdAt: true, scheduledStartAt: true, protectedUntil: true, members: { select: { id: true, name: true, isSubstitute: true } } } }),
    prisma.recruitPartyDiscordMonitor.findMany({ where: { updatedAt: { gte: from } }, select: { id: true, status: true, lastExpectedCount: true, lastPresentExpectedCount: true, lastNonParticipantCount: true, autoFinishedAt: true, createdAt: true, updatedAt: true, partyId: true } }),
    prisma.userDisciplineRecord.findMany({ where: lateWarningWhere({ gte: from, lte: rangeEnd }), select: { id: true, targetName: true, discordDmStatus: true, createdAt: true, type: true, source: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.userDisciplineRecord.findMany({ where: { createdAt: { gte: from, lte: rangeEnd } }, select: { id: true, targetName: true, type: true, source: true, createdBy: true, isActive: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.userAccount.count({ where: { discordId: { not: null } } }),
    prisma.userAccount.count({ where: { status: "APPROVED" } }),
    prisma.discordOperationLog.findMany({ where: { createdAt: { gte: from, lte: rangeEnd } }, orderBy: { createdAt: "desc" }, take: 10000 }),
    prisma.discordBotHeartbeat.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
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

  const trendDays = Math.min(days, 30);
  const dayKeys = Array.from({ length: trendDays }, (_, index) => getKstDateKey(addDays(rangeEnd, -trendDays + 1 + index)));
  const recruitByDay = new Map(dayKeys.map((key) => [key, 0]));
  const lateByDay = new Map(dayKeys.map((key) => [key, 0]));
  const errorByDay = new Map(dayKeys.map((key) => [key, 0]));
  const autoByDay = new Map(dayKeys.map((key) => [key, 0]));
  for (const row of recruits) { const key = getKstDateKey(row.createdAt); if (recruitByDay.has(key)) recruitByDay.set(key, (recruitByDay.get(key) || 0) + 1); }
  for (const row of lateWarnings) { const key = getKstDateKey(row.createdAt); if (lateByDay.has(key)) lateByDay.set(key, (lateByDay.get(key) || 0) + 1); }
  for (const row of operationLogs) { const key = getKstDateKey(row.createdAt); if (errorByDay.has(key) && ["ERROR", "FAILED"].includes(String(row.status).toUpperCase())) errorByDay.set(key, (errorByDay.get(key) || 0) + 1); if (autoByDay.has(key) && String(row.type).startsWith("AUTO_FINISH") && String(row.status).toUpperCase() === "SUCCESS") autoByDay.set(key, (autoByDay.get(key) || 0) + 1); }
  const trend = dayKeys.map((key) => ({ dateKey: key, label: formatKstMonthDay(key), recruitCount: recruitByDay.get(key) || 0, lateWarningCount: lateByDay.get(key) || 0, errorCount: errorByDay.get(key) || 0, autoFinishCount: autoByDay.get(key) || 0 }));

  const recruitStatusItems = countBy(recruits, (row) => String(row.status));
  const recruitTypeItems = countBy(recruits, (row) => String(row.type));
  const recruitSizeItems = countBy(recruits, (row) => `${row.maxMembers}인`);
  const monitorStatusItems = countBy(monitors, (row) => String(row.status));
  const dmItems = countBy(lateWarnings, (row) => dmStatusLabel(row.discordDmStatus));
  const warningTypeItems = countBy(allWarnings, (row) => String(row.type || "기타"));
  const warningSourceItems = countBy(allWarnings, (row) => String(row.source || "MANUAL"));
  const operationTypeItems = countBy(operationLogs, (row) => typeKo(row.type)).slice(0, 10);
  const operationStatusItems = countBy(operationLogs, (row) => statusKo(row.status));
  const endpointErrorItems = countBy(operationLogs.filter((row) => ["ERROR", "FAILED"].includes(String(row.status).toUpperCase())), (row) => row.endpoint || row.type).slice(0, 10);
  const httpStatusItems = countBy(operationLogs.filter((row) => row.httpStatus), (row) => String(row.httpStatus)).slice(0, 8);
  const channelErrorItems = countBy(operationLogs.filter((row) => ["ERROR", "FAILED"].includes(String(row.status).toUpperCase()) && row.channelId), (row) => row.channelName || row.channelId).slice(0, 10);

  const lateTargets = new Map<string, { name: string; count: number }>();
  for (const row of lateWarnings) { const name = row.targetName || "이름 없음"; const key = normalizeName(name) || name; const item = lateTargets.get(key) || { name, count: 0 }; item.count += 1; lateTargets.set(key, item); }
  const lateTargetBars = Array.from(lateTargets.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10).map((item) => ({ label: item.name, value: item.count }));

  const warningTargets = new Map<string, { name: string; count: number }>();
  for (const row of allWarnings) { const name = row.targetName || "이름 없음"; const key = normalizeName(name) || name; const item = warningTargets.get(key) || { name, count: 0 }; item.count += 1; warningTargets.set(key, item); }
  const warningTargetBars = Array.from(warningTargets.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10).map((item) => ({ label: item.name, value: item.count }));

  const recruitHourCounts = new Map<number, number>();
  const lateHourCounts = new Map<number, number>();
  const voiceHourCounts = new Map<number, number>();
  for (const row of recruits) { const hour = getKstHour(row.createdAt); recruitHourCounts.set(hour, (recruitHourCounts.get(hour) || 0) + 1); }
  for (const row of lateWarnings) { const hour = getKstHour(row.createdAt); lateHourCounts.set(hour, (lateHourCounts.get(hour) || 0) + 1); }
  for (const row of events) { const hour = getKstHour(row.occurredAt); voiceHourCounts.set(hour, (voiceHourCounts.get(hour) || 0) + 1); }
  const hourBars = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}시`, value: recruitHourCounts.get(hour) || 0 })).filter((item) => item.value > 0);
  const lateHourBars = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}시`, value: lateHourCounts.get(hour) || 0 })).filter((item) => item.value > 0);
  const voiceHourBars = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}시`, value: voiceHourCounts.get(hour) || 0 })).filter((item) => item.value > 0);

  const operationErrors = operationLogs.filter((row) => ["ERROR", "FAILED"].includes(String(row.status).toUpperCase()));
  const autoFinishLogs = operationLogs.filter((row) => String(row.type).startsWith("AUTO_FINISH"));
  const lateCheckLogs = operationLogs.filter((row) => String(row.type).startsWith("RECRUIT_LATE_WARNING"));
  const dmLogs = operationLogs.filter((row) => String(row.type).startsWith("DM_SEND"));
  const adminLogLogs = operationLogs.filter((row) => String(row.type).startsWith("ADMIN_LOG"));
  const linkRate = approvedUsers > 0 ? Math.round((linkedUsers / approvedUsers) * 1000) / 10 : 0;
  const activeWarnings = allWarnings.filter((row) => row.isActive).length;
  const scheduledMissing = recruits.filter((item) => !item.scheduledStartAt).length;
  const protectedCount = recruits.filter((item) => item.protectedUntil && item.protectedUntil > now).length;

  const dmNeedsCheckCount = lateWarnings.filter((row) => ["FAILED", "SKIPPED", "PENDING"].includes(String(row.discordDmStatus || "UNKNOWN").toUpperCase())).length;
  const operationErrorTone = operationErrors.length > 0 ? "error" : "ok";
  const scheduledTone = scheduledMissing > 0 ? "warn" : "ok";
  const lateTone = lateWarnings.length > 0 ? "warn" : "ok";
  const dmTone = dmNeedsCheckCount > 0 ? "warn" : "ok";
  const heartbeatTone = heartbeats.length ? "ok" : "error";

  return (
    <main className="admin-page discord-ops-page" id="top">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header discord-ops-header--readable">
        <div>
          <p className="page-eyebrow">Discord Operation Center</p>
          <h1 className="admin-page__title">Discord 운영 상세 통계</h1>
          <p className="admin-muted">구인·음성방·지각·자동종료·봇/API 오류를 운영 판단 순서대로 정리했습니다.</p>
        </div>
        <div className="admin-actions">
          <Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link>
          <Link className="admin-button" href="/admin/discord/settings">운영 설정</Link>
        </div>
      </div>

      <DiscordOpsNav active="stats" />

      <form className="discord-filter-card discord-filter-card--readable" method="get">
        <label>이름 검색<input name="q" defaultValue={q} placeholder="같이 있던 사람 분석용 · 예: 재현" /></label>
        <label>기간<select name="days" defaultValue={String(days)}><option value="1">오늘</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label>
        <button className="admin-button" type="submit">통계 조회</button>
      </form>

      <section className="discord-insight-grid" id="summary">
        <InsightCard title="API 오류" value={`${operationErrors.length}건`} caption={operationErrors.length > 0 ? "봇/API 오류 섹션에서 원인을 먼저 확인하세요." : "선택 기간 오류 로그가 없습니다."} tone={operationErrorTone} />
        <InsightCard title="구인 자동화 준비" value={`${scheduledMissing}건 누락`} caption={scheduledMissing > 0 ? "시작시간 미입력 구인은 지각 자동화에서 제외될 수 있습니다." : "시작시간 입력 상태가 양호합니다."} tone={scheduledTone} />
        <InsightCard title="지각 관리" value={`${lateWarnings.length}건`} caption={lateWarnings.length > 0 ? "반복 대상과 시간대를 확인하세요." : "선택 기간 자동 지각 경고가 없습니다."} tone={lateTone} />
        <InsightCard title="DM 확인" value={`${dmNeedsCheckCount}건`} caption={dmNeedsCheckCount > 0 ? "DM 실패·불가 대상은 수동 안내가 필요합니다." : "DM 발송 상태가 양호합니다."} tone={dmTone} />
        <InsightCard title="Discord 연동률" value={`${linkRate}%`} caption={`${linkedUsers}/${approvedUsers}명 연동 · 자동화 정확도 기준`} />
        <InsightCard title="봇 하트비트" value={heartbeats.length ? "정상" : "없음"} caption={heartbeats[0] ? formatKstDateTime(heartbeats[0].updatedAt) : "최근 기록이 없습니다."} tone={heartbeatTone} />
      </section>

      <section className="discord-ops-stat-grid discord-ops-stat-grid--ops discord-ops-stat-grid--readable">
        <Metric label="기간 내 구인" value={`${recruits.length}건`} caption={`진행중 ${recruits.filter((item) => String(item.status) === "IN_PROGRESS").length}건`} />
        <Metric label="지각 경고" value={`${lateWarnings.length}건`} caption="자동 지각 경고 기준" tone={lateTone} />
        <Metric label="전체 경고" value={`${allWarnings.length}건`} caption={`활성 ${activeWarnings}건`} />
        <Metric label="자동종료" value={`${monitors.filter((item) => item.autoFinishedAt).length}건`} caption="Discord 모니터 기준" />
        <Metric label="API 오류" value={`${operationErrors.length}건`} caption={`최근 로그 ${operationLogs.length}건`} tone={operationErrorTone} />
        <Metric label="음성 이벤트" value={`${events.length}건`} caption={`세션 ${sessions.length}개 계산`} />
        <Metric label="보호중 구인" value={`${protectedCount}건`} caption="protectedUntil 기준" />
      </section>

      <Section id="trend" title="핵심 추이" caption="최근 흐름을 먼저 확인합니다. 구인 증가와 지각·오류 증가가 같이 움직이는지 보는 영역입니다.">
        <div className="discord-chart-grid discord-chart-grid--featured">
          <TrendChartCard title="운영 핵심 추이" caption={`최근 ${trendDays}일 구인·지각·오류·자동종료`} data={trend} />
          <DonutChartCard title="운영 로그 상태" caption="봇/API/DM/관리자 로그 결과" items={operationStatusItems} />
        </div>
      </Section>

      <Section id="recruit" title="구인 운영" caption="구인 상태, 인원, 시간대, 자동종료 상태를 묶어서 봅니다.">
        <div className="discord-chart-grid discord-chart-grid--readable">
          <DonutChartCard title="구인 상태 비율" caption="선택 기간 생성 구인 기준" items={recruitStatusItems} />
          <BarChartCard title="구인 시간대" caption="카카오톡 구인 생성 시간" items={hourBars} suffix="건" />
          <BarChartCard title="구인 인원별" caption="2인/3인/5인 등 maxMembers 기준" items={recruitSizeItems} suffix="건" />
          <BarChartCard title="구인 유형별" caption="게임 종류/파티 유형 기준" items={recruitTypeItems} suffix="건" />
          <BarChartCard title="자동종료 상태" caption="RecruitPartyDiscordMonitor status" items={monitorStatusItems} suffix="건" />
          <DonutChartCard title="자동종료 로그 결과" caption="봇 운영 로그 기준" items={countBy(autoFinishLogs, (row) => statusKo(row.status))} />
        </div>
      </Section>

      <Section id="warning" title="지각 · 경고 · DM" caption="반복 지각자, 경고 출처, DM 실패 대상을 운영자가 바로 확인하는 영역입니다.">
        <div className="discord-chart-grid discord-chart-grid--readable">
          <DonutChartCard title="지각 DM 상태" caption="자동 지각 경고 기준" items={dmItems} />
          <BarChartCard title="지각 경고 TOP 10" caption="반복 지각 대상 확인" items={lateTargetBars} suffix="건" />
          <BarChartCard title="지각 시간대" caption="지각 경고 생성 시간" items={lateHourBars} suffix="건" />
          <BarChartCard title="전체 경고 TOP 10" caption="수동+자동 경고 누적" items={warningTargetBars} suffix="건" />
          <DonutChartCard title="전체 경고 유형" caption="선택 기간 전체 경고 기준" items={warningTypeItems} />
          <DonutChartCard title="경고 출처" caption="수동/자동 경고 비율" items={warningSourceItems} />
          <DonutChartCard title="지각 검사 로그 결과" caption="봇 운영 로그 기준" items={countBy(lateCheckLogs, (row) => statusKo(row.status))} />
          <DonutChartCard title="DM 발송 로그 결과" caption="봇 운영 로그 기준" items={countBy(dmLogs, (row) => statusKo(row.status))} />
        </div>
      </Section>

      <Section id="voice" title="음성방 이용" caption="현재 운영에서 누가 오래 머물고 어떤 방이 많이 쓰이는지 확인합니다.">
        <div className="discord-chart-grid discord-chart-grid--readable">
          <BarChartCard title="음성 이벤트 시간대" caption="입장·이동·퇴장 이벤트" items={voiceHourBars} suffix="건" />
          <BarChartCard title="체류시간 TOP 10" caption="유저별 음성방 총 체류시간" items={stayTopBars} suffix="분" />
          <BarChartCard title="음성방 사용 TOP 10" caption="채널별 누적 체류시간" items={channelTopBars} suffix="분" />
          <DonutChartCard title="Discord 연동률" caption="승인 유저 기준" items={[{ label: "연동", value: linkedUsers }, { label: "미연동", value: Math.max(0, approvedUsers - linkedUsers) }]} />
        </div>
      </Section>

      <Section id="bot" title="봇 · API 안정성" caption="HTTP 오류, API 실패, 관리자 로그 발송 상태를 모아서 봅니다.">
        <div className="discord-chart-grid discord-chart-grid--readable">
          <BarChartCard title="API 오류 경로 TOP" caption="오류/실패 상태 로그 기준" items={endpointErrorItems} suffix="건" />
          <BarChartCard title="운영 로그 유형 TOP" caption="봇 서버에서 저장한 작업 유형" items={operationTypeItems} suffix="건" />
          <BarChartCard title="HTTP 상태코드" caption="오류 응답 코드 분포" items={httpStatusItems} suffix="건" />
          <BarChartCard title="채널별 오류 TOP" caption="채널 ID/이름 기준 오류 집계" items={channelErrorItems} suffix="건" />
          <DonutChartCard title="관리자 로그 발송" caption="봇 운영 로그 기준" items={countBy(adminLogLogs, (row) => statusKo(row.status))} />
        </div>
      </Section>

      <Section id="details" title="상세 로그" caption="문제 발생 시 마지막으로 확인하는 원본성 리스트입니다.">
        <div className="discord-ops-two-col">
          <div className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>최근 운영 오류</h2></div><div className="discord-ops-list discord-stats-list">{operationErrors.slice(0, 15).length === 0 ? <p className="admin-muted">선택 기간 오류 로그가 없습니다.</p> : operationErrors.slice(0, 15).map((item) => <div className="discord-ops-list-row" key={item.id}><strong>{typeKo(item.type)} · {item.endpoint || item.channelName || item.channelId || "공통"}</strong><span>{formatKstDateTime(item.createdAt)}</span><em className="text-muted-compact">{item.message || `${statusKo(item.status)} ${item.httpStatus || ""}`}</em></div>)}</div></div>
          <div className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>최근 운영 로그</h2></div><div className="discord-ops-list discord-stats-list">{operationLogs.slice(0, 15).map((item) => <div className="discord-ops-list-row" key={item.id}><strong>{typeKo(item.type)} · {statusKo(item.status)}</strong><span>{formatKstDateTime(item.createdAt)}</span><em className="text-muted-compact">{item.endpoint || item.channelName || item.channelId || item.message || "-"}</em></div>)}</div></div>
        </div>

        <div className="discord-ops-two-col discord-readable-detail-row">
          <div className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>체류시간 상세 TOP 10</h2></div><div className="discord-ops-list discord-stats-list">{stayTop10.length === 0 ? <p className="admin-muted">체류시간 데이터가 없습니다.</p> : stayTop10.map((item, index) => <div className="discord-ops-list-row" key={item.discordId}><strong>{index + 1}. {item.label}</strong><span>{formatDurationSeconds(item.seconds)}</span></div>)}</div></div>
          <div className="admin-card discord-ops-panel"><div className="admin-section-head"><h2>같이 있던 사람 TOP 10</h2></div>{!q ? <p className="admin-muted">검색어에 이름을 입력하면 같은 음성방에 가장 오래 같이 있던 사람을 계산합니다.</p> : <div className="discord-ops-list discord-stats-list">{coPresenceTop10.length === 0 ? <p className="admin-muted">같이 있던 사람 데이터가 없습니다.</p> : coPresenceTop10.map((item, index) => <div className="discord-ops-list-row" key={item.discordId}><strong>{index + 1}. {item.label}</strong><span>{formatDurationSeconds(item.seconds)}</span></div>)}</div>}</div>
        </div>
      </Section>
    </main>
  );}
