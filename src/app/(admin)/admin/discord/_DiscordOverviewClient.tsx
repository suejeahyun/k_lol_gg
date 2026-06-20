"use client";

import Link from "next/link";
import DiscordOpsStyles from "./_DiscordOpsStyles";
import DiscordOpsNav from "./_DiscordOpsNav";
import { useEffect, useState } from "react";

type Diagnostic = { level: "OK" | "INFO" | "WARN" | "ERROR"; code: string; title: string; message: string; action?: string };
type Overview = {
  summary: {
    approvedUsers: number;
    linkedUsers: number;
    linkRate: number;
    recentEventCount: number;
    currentVoiceUserCount: number;
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

function Stat({ label, value, caption }: { label: string; value: string | number; caption: string }) {
  return <div className="discord-ops-stat"><span>{label}</span><strong>{value}</strong><em>{caption}</em></div>;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    PARTIAL_ACTIVE: "부분 진행",
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

const navItems = [
  { href: "/admin/discord/recruits", title: "구인 검증", desc: "구인 참가자 모임 상태, 부분 진행, 자동 ㅉ 후보" },
  { href: "/admin/discord/matches", title: "내전 확인", desc: "오늘 내전 참석, 늦참, 미접속 경고" },
  { href: "/admin/discord/stats", title: "체류 통계", desc: "체류시간 TOP 10, 같이 있던 사람 TOP 10" },
  { href: "/admin/discord/logs", title: "상세 로그", desc: "음성방 입장·이동·퇴장 원본 로그" },
  { href: "/admin/discord/diagnostics", title: "오류 점검", desc: "봇 heartbeat, 감시 범위, API 오류 상태" },
  { href: "/admin/discord/settings", title: "운영 설정", desc: "자동 ㅉ, 감시 범위, 로그 채널, 역할 ID" },
];

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
    // Initial dashboard hydration must fetch external state once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => { console.error(error); setLoading(false); });
  }, []);

  const latestBot = data?.heartbeats?.[0];
  const errors = data?.diagnostics?.filter((item) => item.level === "ERROR").length || 0;
  const warns = data?.diagnostics?.filter((item) => item.level === "WARN").length || 0;
  const recentRecruits = data?.recruitVerifications?.slice(0, 5) || [];

  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div>
          <h1 className="admin-page__title">Discord 운영 대시보드</h1>
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
              </Link>
            ))}
          </section>

          <section className="discord-ops-stat-grid">
            <Stat label="봇 상태" value={data.summary.healthyBotCount > 0 ? "정상" : "확인 필요"} caption={latestBot ? `마지막 신호 ${formatDate(latestBot.updatedAt)}` : "heartbeat 없음"} />
            <Stat label="자동화 오류" value={`${errors} / ${warns}`} caption="ERROR / WARN" />
            <Stat label="ID 연동(선택)" value={`${data.summary.linkRate}%`} caption={`${data.summary.linkedUsers}/${data.summary.approvedUsers}명 · 이름매칭 병행`} />
            <Stat label="현재 음성방" value={`${data.summary.currentVoiceUserCount}명`} caption="최근 음성 상태 기준" />
            <Stat label="구인 확인" value={`${data.summary.recruitReadyCount}건`} caption={`확인 필요 ${data.summary.recruitNeedsCheckCount}건`} />
            <Stat label="내전 확인" value={`${data.summary.matchAttendancePresentCount}/${data.summary.matchAttendanceTotalCount}`} caption={`늦참 ${data.summary.matchAttendanceLateCount} / 불참 ${data.summary.matchAttendanceAbsentWarningCount}`} />
          </section>

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
        </>
      )}
    </main>
  );
}
