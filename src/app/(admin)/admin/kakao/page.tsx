export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { getKakaoOperationSettings } from "@/lib/kakao/settings";

function formatKstDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function settingStatus(enabled: boolean) {
  return enabled ? "사용" : "중지";
}

export default async function AdminKakaoPage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

  const [settings, activeRecruits, todayLogs, pendingSeasonApplies, pendingForms, recentLogs] = await Promise.all([
    getKakaoOperationSettings(),
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }),
    prisma.recruitPartyLog.count({ where: { recruitDate: today } }),
    prisma.seasonParticipationPendingApply.count(),
    Promise.all([
      prisma.kakaoLeaveRequest.count({ where: { status: { not: "CANCELLED" } } }),
      prisma.kakaoMeetupRecord.count({ where: { status: { not: "CANCELLED" } } }),
      prisma.kakaoSuggestionRequest.count({ where: { status: { not: "CANCELLED" } } }),
      prisma.kakaoFriendApplication.count({ where: { status: { not: "CANCELLED" } } }),
    ]).then((counts) => counts.reduce((sum, count) => sum + count, 0)),
    prisma.recruitPartyLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">KAKAO CENTER</p>
          <h1>카카오톡 운영센터</h1>
          <p className="admin-muted">카카오톡 구인, 내전 참가신청, 운영신청 상태를 요약합니다. 페이지 이동은 좌측 사이드바에서만 사용합니다.</p>
        </div>
      </div>

      <section className="card-grid">
        <div className="stat-card"><span className="stat-card__label">진행 중 구인</span><strong className="stat-card__value">{activeRecruits.toLocaleString("ko-KR")}</strong></div>
        <div className="stat-card"><span className="stat-card__label">오늘 구인 로그</span><strong className="stat-card__value">{todayLogs.toLocaleString("ko-KR")}</strong></div>
        <div className="stat-card"><span className="stat-card__label">내전 참가신청</span><strong className="stat-card__value">{pendingSeasonApplies.toLocaleString("ko-KR")}</strong></div>
        <div className="stat-card"><span className="stat-card__label">운영신청 보관</span><strong className="stat-card__value">{pendingForms.toLocaleString("ko-KR")}</strong></div>
      </section>

      <section className="admin-card" style={{ marginTop: 24 }}>
        <div className="admin-section-head">
          <div>
            <h2>카카오톡 설정 요약</h2>
            <p className="admin-muted">자세한 설정 변경은 좌측 사이드바의 카카오톡 설정에서 처리합니다.</p>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              <tr><th>구인 명령</th><td>{settingStatus(settings.recruitCommandEnabled)}</td><th>전적 검색</th><td>{settingStatus(settings.playerRecordSearchEnabled)}</td></tr>
              <tr><th>내전 참가신청</th><td>{settingStatus(settings.seasonApplyCommandEnabled)}</td><th>운영신청 접수</th><td>{settingStatus(settings.operationFormsEnabled)}</td></tr>
              <tr><th>명령 쿨다운</th><td>{settings.commandCooldownSeconds}초</td><th>현황 표시 최대 수</th><td>{settings.recruitStatusMaxVisible}개</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card" style={{ marginTop: 24 }}>
        <div className="admin-section-head">
          <div>
            <h2>최근 카카오톡 구인 기록</h2>
            <p className="admin-muted">최근 처리된 카카오톡 구인 이벤트입니다.</p>
          </div>
          <Link className="admin-button admin-button--ghost" href="/admin/kakao/recruits/logs">전체 로그</Link>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>시간</th><th>번호</th><th>액션</th><th>제목</th><th>방/처리자</th></tr></thead>
            <tbody>
              {recentLogs.length === 0 ? <tr><td colSpan={5}>최근 구인 기록이 없습니다.</td></tr> : recentLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatKstDateTime(log.createdAt)}</td>
                  <td>{log.recruitNo > 0 ? `#${log.recruitNo}` : "-"}</td>
                  <td><span className="admin-log-action-pill">{log.action}</span></td>
                  <td>{log.title}</td>
                  <td><div>{log.roomName || "-"}</div><div className="admin-muted">{log.sender || "-"}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
