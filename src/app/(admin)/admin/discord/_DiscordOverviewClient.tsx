"use client";

import Link from "next/link";
import DiscordOpsStyles from "./_DiscordOpsStyles";
import DiscordOpsNav from "./_DiscordOpsNav";
import { useEffect, useState, type CSSProperties } from "react";

type Diagnostic = { level: "OK" | "INFO" | "WARN" | "ERROR"; code: string; title: string; message: string; action?: string };
type ChartItem = { label: string; value: number };
type OperationStats = {
  cards: {
    todayRecruitCount: number;
    todayInProgressRecruitCount: number;
    todayScheduledMissingRecruitCount: number;
    autoFinishedTodayCount: number;
    lateWarningTodayCount: number;
    lateWarning7dCount: number;
    lateWarningDmFailed30dCount: number;
    currentVoiceLinkedCount: number;
    currentVoiceUnlinkedCount: number;
  };
  voiceComposition: ChartItem[];
  channelOccupancy: Array<{ channelId: string | null; channelName: string; count: number; linkedCount: number; unlinkedCount: number }>;
  recruitStatusDistribution: ChartItem[];
  lateWarningDmStatus30d: ChartItem[];
  lateWarningTopTargets30d: Array<{ name: string; count: number }>;
  trend7d: Array<{ dateKey: string; label: string; recruitCount: number; lateWarningCount: number }>;
  recentLateWarnings: Array<{ id: number; targetName: string; targetNickname: string | null; targetTag: string | null; discordDmStatus: string | null; reason: string; sourceRefId: string | null; createdAt: string }>;
};
type Overview = {
  summary: {
    approvedUsers: number;
    linkedUsers: number;
    linkRate: number;
    recentEventCount: number;
    currentVoiceUserCount: number;
    currentLinkedVoiceUserCount?: number;
    currentUnlinkedVoiceUserCount?: number;
    activeMonitorCount: number;
    healthyBotCount: number;
    recruitReadyCount: number;
    recruitNeedsCheckCount: number;
    matchAttendancePresentCount: number;
    matchAttendanceTotalCount: number;
    matchAttendanceLateCount: number;
    matchAttendanceAbsentWarningCount: number;
  };
  heartbeats: Array<{ botId: string; status: string; botUsername: string | null; updatedAt: string; uptimeSeconds: number; memoryRssMb: number | null; autoFinishEnabled: boolean; lastError: string | null }>;
  diagnostics?: Diagnostic[];
  recruitVerifications: Array<{ partyId: number; recruitNo: number; title: string; status: string; activeMemberCount: number; maxMembers: number; presentCount: number; matchedByNameCount: number; missingCount: number; voiceChannelId: string | null; lastScannedAt: string | null }>;
  matchAttendance: { totalCount: number; presentCount: number; lateCount: number; absentWarningCount: number; waitingCount: number; unlinkedCount: number };
  operationStats?: OperationStats;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function secondsToText(value: number) {
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function Stat({ label, value, caption, tone = "default" }: { label: string; value: string | number; caption: string; tone?: "default" | "ok" | "warn" | "error" }) {
  return <div className={`discord-ops-stat discord-ops-stat--${tone}`}><span>{label}</span><strong>{value}</strong><em>{caption}</em></div>;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    PARTIAL_ACTIVE: "부분 진행",
    PARTIAL_ACTIVE_WITH_EXTRA: "부분 진행+외부",
    GATHERING: "진행 확인",
    ASSEMBLED: "모임 완료",
    ASSEMBLED_WITH_EXTRA: "모임 완료+외부",
    FINISH_CANDIDATE: "ㅉ 후보",
    AUTO_FINISHED: "자동 ㅉ 완료",
    WAITING: "대기",
    ACTIVE: "감시중",
    RECRUIT_NOT_FULL: "대기",
    DISCORD_LINK_INCOMPLETE: "이름 확인 필요",
  };
  return map[status] || status;
}

function dmStatusLabel(status?: string | null) {
  const map: Record<string, string> = {
    SENT: "DM 성공",
    FAILED: "DM 실패",
    SKIPPED: "DM 불가",
    PENDING: "대기",
    UNKNOWN: "미확인",
  };
  return map[status || "UNKNOWN"] || status || "미확인";
}

const navItems = [
  { href: "/admin/discord/recruits", title: "구인 검증", desc: "구인 참가자 모임 상태, 부분 진행, 자동 ㅉ 후보" },
  { href: "/admin/discord/matches", title: "내전 확인", desc: "오늘 내전 참석, 늦참, 미접속 경고" },
  { href: "/admin/discord/stats", title: "상세 통계", desc: "체류시간, 구인, 지각, DM, 시간대별 통계" },
  { href: "/admin/discord/logs", title: "상세 로그", desc: "음성방 입장·이동·퇴장 원본 로그" },
  { href: "/admin/discord/diagnostics", title: "오류 점검", desc: "봇 heartbeat, 감시 범위, API 오류 상태" },
  { href: "/admin/discord/settings", title: "운영 설정", desc: "자동 ㅉ, 감시 범위, 로그 채널, 역할 ID" },
];

const chartVars = ["var(--discord-chart-1)", "var(--discord-chart-2)", "var(--discord-chart-3)", "var(--discord-chart-4)", "var(--discord-chart-5)"];

function DonutChartCard({ title, caption, items }: { title: string; caption: string; items: ChartItem[] }) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  let acc = 0;
  const segments = total > 0 ? items.map((item, index) => {
    const start = acc;
    const end = acc + (Math.max(0, item.value) / total) * 360;
    acc = end;
    return `${chartVars[index % chartVars.length]} ${start}deg ${end}deg`;
  }).join(", ") : "rgba(51, 65, 85, .65) 0deg 360deg";
  const style = { "--discord-donut": `conic-gradient(${segments})` } as CSSProperties;

  return (
    <div className="admin-card discord-chart-card">
      <div className="discord-chart-head"><h2>{title}</h2><span>{caption}</span></div>
      <div className="discord-donut-layout">
        <div className="discord-donut" style={style}><strong>{total}</strong><span>total</span></div>
        <div className="discord-chart-legend">
          {items.map((item, index) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return <div key={item.label}><i style={{ background: chartVars[index % chartVars.length] }} /><span>{item.label}</span><strong>{item.value}</strong><em>{pct}%</em></div>;
          })}
        </div>
      </div>
    </div>
  );
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

function TrendChartCard({ title, caption, data }: { title: string; caption: string; data: OperationStats["trend7d"] }) {
  const w = 360;
  const h = 150;
  const padX = 24;
  const padY = 18;
  const max = Math.max(1, ...data.flatMap((item) => [item.recruitCount, item.lateWarningCount]));
  const point = (value: number, index: number) => {
    const x = data.length <= 1 ? w / 2 : padX + ((w - padX * 2) * index) / (data.length - 1);
    const y = h - padY - ((h - padY * 2) * value) / max;
    return `${x},${y}`;
  };
  const recruitPoints = data.map((item, index) => point(item.recruitCount, index)).join(" ");
  const latePoints = data.map((item, index) => point(item.lateWarningCount, index)).join(" ");

  return (
    <div className="admin-card discord-chart-card discord-chart-card--wide">
      <div className="discord-chart-head"><h2>{title}</h2><span>{caption}</span></div>
      <svg className="discord-trend-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} />
        <polyline className="discord-trend-line discord-trend-line--recruit" points={recruitPoints} />
        <polyline className="discord-trend-line discord-trend-line--late" points={latePoints} />
        {data.map((item, index) => (
          <g key={item.dateKey}>
            <circle className="discord-trend-dot discord-trend-dot--recruit" cx={point(item.recruitCount, index).split(",")[0]} cy={point(item.recruitCount, index).split(",")[1]} r="3.5" />
            <circle className="discord-trend-dot discord-trend-dot--late" cx={point(item.lateWarningCount, index).split(",")[0]} cy={point(item.lateWarningCount, index).split(",")[1]} r="3.5" />
          </g>
        ))}
      </svg>
      <div className="discord-trend-labels">
        {data.map((item) => <span key={item.dateKey}>{item.label}<em>구인 {item.recruitCount} · 지각 {item.lateWarningCount}</em></span>)}
      </div>
      <div className="discord-chart-legend discord-chart-legend--inline">
        <div><i style={{ background: "var(--discord-chart-1)" }} /><span>구인</span></div>
        <div><i style={{ background: "var(--discord-chart-3)" }} /><span>지각</span></div>
      </div>
    </div>
  );
}

export default function DiscordOverviewClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/discord/overview", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Discord 운영 현황 조회 실패");
    setData(json);
    setLoading(false);
  }

  useEffect(() => {
    void load().catch((error) => { console.error(error); setLoading(false); });
  }, []);

  const latestBot = data?.heartbeats?.[0];
  const errors = data?.diagnostics?.filter((item) => item.level === "ERROR").length || 0;
  const warns = data?.diagnostics?.filter((item) => item.level === "WARN").length || 0;
  const recentRecruits = data?.recruitVerifications?.slice(0, 5) || [];
  const stats = data?.operationStats;
  const channelBars = stats?.channelOccupancy.map((item) => ({ label: item.channelName, value: item.count })) || [];
  const lateTopBars = stats?.lateWarningTopTargets30d.map((item) => ({ label: item.name, value: item.count })) || [];

  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div>
          <h1 className="admin-page__title">Discord 운영 대시보드</h1>
          <p className="admin-muted">실시간 음성방, 구인, 지각 경고, DM 상태를 운영 관점에서 요약합니다.</p>
        </div>
        <div className="admin-actions">
          <button className="admin-button" type="button" onClick={() => void load()}>새로고침</button>
          <Link className="admin-button admin-button--secondary" href="/admin/discord/settings">운영 설정</Link>
        </div>
      </div>

      <DiscordOpsNav active="overview" />

      {loading || !data ? <section className="admin-card"><div className="admin-empty">Discord 운영 현황을 불러오는 중입니다.</div></section> : (
        <>
          <section className="discord-ops-nav-grid">
            {navItems.map((item) => (
              <Link className="discord-ops-nav-card" key={item.href} href={item.href}>
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </Link>
            ))}
          </section>

          <section className="discord-ops-stat-grid discord-ops-stat-grid--ops">
            <Stat label="봇 상태" value={data.summary.healthyBotCount > 0 ? "정상" : "확인 필요"} caption={latestBot ? `마지막 신호 ${formatDate(latestBot.updatedAt)}` : "heartbeat 없음"} tone={data.summary.healthyBotCount > 0 ? "ok" : "error"} />
            <Stat label="현재 음성방" value={`${data.summary.currentVoiceUserCount}명`} caption={`연동 ${stats?.cards.currentVoiceLinkedCount ?? data.summary.currentLinkedVoiceUserCount ?? 0} / 미연동 ${stats?.cards.currentVoiceUnlinkedCount ?? data.summary.currentUnlinkedVoiceUserCount ?? 0}`} />
            <Stat label="진행중 구인" value={`${stats?.cards.todayInProgressRecruitCount ?? data.summary.activeMonitorCount}건`} caption={`시작시간 미입력 ${stats?.cards.todayScheduledMissingRecruitCount ?? 0}건`} tone={(stats?.cards.todayScheduledMissingRecruitCount || 0) > 0 ? "warn" : "default"} />
            <Stat label="오늘 구인" value={`${stats?.cards.todayRecruitCount ?? 0}건`} caption={`자동종료 ${stats?.cards.autoFinishedTodayCount ?? 0}건`} />
            <Stat label="지각 경고" value={`${stats?.cards.lateWarningTodayCount ?? 0}건`} caption={`최근 7일 ${stats?.cards.lateWarning7dCount ?? 0}건`} tone={(stats?.cards.lateWarningTodayCount || 0) > 0 ? "warn" : "default"} />
            <Stat label="자동화 오류" value={`${errors} / ${warns}`} caption="ERROR / WARN" tone={errors > 0 ? "error" : warns > 0 ? "warn" : "ok"} />
          </section>

          {stats && (
            <section className="discord-chart-grid">
              <DonutChartCard title="Discord 연동률" caption={`${data.summary.linkedUsers}/${data.summary.approvedUsers}명 · 승인 유저 기준`} items={[{ label: "연동", value: data.summary.linkedUsers }, { label: "미연동", value: Math.max(0, data.summary.approvedUsers - data.summary.linkedUsers) }]} />
              <DonutChartCard title="현재 음성방 구성" caption="감시 대상 음성방 현재 상태" items={stats.voiceComposition} />
              <TrendChartCard title="최근 7일 구인 · 지각 추이" caption="일별 구인 수와 자동 지각 경고 수" data={stats.trend7d} />
              <BarChartCard title="음성방별 현재 인원" caption="현재 접속자 기준 TOP 음성방" items={channelBars} suffix="명" />
              <BarChartCard title="최근 30일 지각 TOP" caption="자동 지각 경고가 많은 대상" items={lateTopBars} suffix="건" />
              <DonutChartCard title="지각 경고 DM 상태" caption="최근 30일 자동 지각 경고 기준" items={stats.lateWarningDmStatus30d.map((item) => ({ label: dmStatusLabel(item.label), value: item.value }))} />
            </section>
          )}

          <section className="discord-ops-two-col">
            <div className="admin-card discord-ops-panel">
              <div className="admin-section-head"><h2>봇 작동 상태</h2></div>
              {latestBot ? (
                <div className="discord-ops-kv">
                  <div><span>봇</span><strong>{latestBot.botUsername || latestBot.botId}</strong></div>
                  <div><span>상태</span><strong>{latestBot.status}</strong></div>
                  <div><span>Uptime</span><strong>{secondsToText(latestBot.uptimeSeconds)}</strong></div>
                  <div><span>메모리</span><strong>{latestBot.memoryRssMb ? `${latestBot.memoryRssMb.toFixed(1)}MB` : "-"}</strong></div>
                  <div><span>자동 ㅉ</span><strong>{latestBot.autoFinishEnabled ? "ON" : "OFF"}</strong></div>
                  <div><span>최근 오류</span><strong>{latestBot.lastError || "없음"}</strong></div>
                </div>
              ) : <p className="admin-muted">heartbeat 기록이 없습니다.</p>}
            </div>

            <div className="admin-card discord-ops-panel">
              <div className="admin-section-head"><h2>최근 구인 모니터</h2><Link className="chip-button" href="/admin/discord/recruits">전체 보기</Link></div>
              <div className="discord-ops-list">
                {recentRecruits.length === 0 ? <p className="admin-muted">진행중 구인 기록이 없습니다.</p> : recentRecruits.map((item) => (
                  <div className="discord-ops-list-row" key={item.partyId}>
                    <strong>#{item.recruitNo} · {item.title}</strong>
                    <span>{statusLabel(item.status)} · 확인 {item.presentCount}명 · 이름매칭 {item.matchedByNameCount}명</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {stats && (
            <section className="admin-card discord-ops-panel discord-late-warning-panel">
              <div className="admin-section-head"><h2>최근 지각 경고</h2><Link className="chip-button" href="/admin/operation-forms/warnings">경고 페이지</Link></div>
              <div className="discord-ops-list">
                {stats.recentLateWarnings.length === 0 ? <p className="admin-muted">최근 30일 자동 지각 경고가 없습니다.</p> : stats.recentLateWarnings.slice(0, 6).map((item) => (
                  <div className="discord-ops-list-row" key={item.id}>
                    <strong>{item.targetName}{item.targetNickname ? ` · ${item.targetNickname}#${item.targetTag || ""}` : ""}</strong>
                    <span>{formatDate(item.createdAt)} · {dmStatusLabel(item.discordDmStatus)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
