"use client";

import { useEffect, useState } from "react";
import Pagination from "@/components/Pagination";
import RecalculateStatsButton from "@/components/admin/RecalculateStatsButton";

type DashboardData = {
  currentSeason: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  playerCount: number;
  matchCount: number;
  pendingUserCount: number;
  todayParticipationCount: number;
  riotFailureCount: number;
  activeRecruitCount: number;
  todayKakaoLogCount: number;
  siteSettings: {
    siteName: string;
    roomName: string | null;
    planStatus: "ACTIVE" | "LOCKED";
    themePreset: "dark-modern" | "neon-cyber" | "black-gold";
    trialEndsAt: string | null;
    billingOwner: string | null;
    lockedFeatureCount: number;
    featureStates: {
      feature: "kakao" | "recruit" | "balanceAi" | "randomTeam" | "riot";
      enabled: boolean;
    }[];
    envReady: {
      superAdmin: boolean;
      database: boolean;
      riotKey: boolean;
      deployReady: boolean;
      deployWarnings: {
        key: string;
        level: "missing" | "weak";
        message: string;
      }[];
    };
  };
  latestMatch: {
    id: number;
    title: string | null;
    playedAt: string;
  } | null;
  recentErrors: {
    id: number;
    action: string;
    message: string;
    createdAt: string;
  }[];
  logs: {
    id: number;
    action: string;
    message: string;
    createdAt: string;
  }[];
  logPagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

function formatDate(value?: string | null) {
  if (!value) return "날짜 없음";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "날짜 오류";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AdminHomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchDashboard = async (page: number) => {
    try {
      setLoading(true);

      const res = await fetch(`/api/admin/dashboard?page=${page}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("대시보드 조회 실패");
      }

      const result: DashboardData = await res.json();

      setData(result);
      setCurrentPage(result.logPagination.page);
    } catch (error) {
      console.error("[ADMIN_DASHBOARD_PAGE_ERROR]", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard(1);
  }, []);

  if (loading && !data) {
    return (
      <div className="page-container">
        <h1 className="page-title">관리자 대시보드</h1>
        <div className="admin-dashboard-loading">
          데이터를 불러오는 중입니다.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container">
        <h1 className="page-title">관리자 대시보드</h1>
        <div className="admin-dashboard-error">
          대시보드 데이터를 불러오지 못했습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="admin-dashboard-header">
        <div>
          <h1 className="page-title">관리자 대시보드</h1>
        </div>
        <div className="admin-dashboard-actions">
          <RecalculateStatsButton seasonId={data.currentSeason?.id ?? null} />
          <a className="admin-button admin-button--ghost" href="/api/admin/backup/players.csv">플레이어 CSV</a>
          <a className="admin-button admin-button--ghost" href="/api/admin/backup/matches.csv">내전 CSV</a>
          <a className="admin-button admin-button--ghost" href="/api/logs?download=csv">로그 CSV</a>
        </div>
      </div>

      <section className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card--premium">
          <div className="admin-summary-card__label">운영 사이트</div>
          <div className="admin-summary-card__value admin-summary-card__value--small">
            {data.siteSettings.siteName}
          </div>
          <div className="admin-summary-card__meta">
            {data.siteSettings.roomName || "방 이름 미설정"} · {data.siteSettings.planStatus === "ACTIVE" ? "유료 활성" : "유료 잠금"}
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">잠긴 기능</div>
          <div className="admin-summary-card__value">
            {data.siteSettings.lockedFeatureCount.toLocaleString()}개
          </div>
          <div className="admin-summary-card__meta">
            카카오·구인·랭킹·랜덤팀·Riot 기준
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">현재 시즌</div>
          <div className="admin-summary-card__value">
            {data.currentSeason ? data.currentSeason.name : "없음"}
          </div>
          <div className="admin-summary-card__meta">
            {data.currentSeason?.isActive ? "활성 시즌" : "활성 시즌 없음"}
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">플레이어 수</div>
          <div className="admin-summary-card__value">
            {data.playerCount.toLocaleString()}명
          </div>
          <div className="admin-summary-card__meta">
            등록된 전체 플레이어
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">총 경기 수</div>
          <div className="admin-summary-card__value">
            {data.matchCount.toLocaleString()}개
          </div>
          <div className="admin-summary-card__meta">
            등록된 전체 내전
          </div>
        </div>


        <div className="admin-summary-card">
          <div className="admin-summary-card__label">자동 승인</div>
          <div className="admin-summary-card__value">
            {data.pendingUserCount > 0 ? `${data.pendingUserCount.toLocaleString()}명` : "ON"}
          </div>
          <div className="admin-summary-card__meta">
            {data.pendingUserCount > 0 ? "예외 승인 대기 확인 필요" : "회원가입 즉시 사용 가능"}
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">오늘 참가 신청</div>
          <div className="admin-summary-card__value">
            {data.todayParticipationCount.toLocaleString()}명
          </div>
          <div className="admin-summary-card__meta">
            당일 시즌 참가 신청 기준
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">Riot 실패 로그</div>
          <div className="admin-summary-card__value">
            {data.riotFailureCount.toLocaleString()}건
          </div>
          <div className="admin-summary-card__meta">
            API 키·호출 제한 점검 대상
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">활성 구인</div>
          <div className="admin-summary-card__value">
            {data.activeRecruitCount.toLocaleString()}개
          </div>
          <div className="admin-summary-card__meta">
            진행 중인 카카오 구인
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">오늘 구인 로그</div>
          <div className="admin-summary-card__value">
            {data.todayKakaoLogCount.toLocaleString()}건
          </div>
          <div className="admin-summary-card__meta">
            카카오 파싱/종료/초기화 기록
          </div>
        </div>

        <div className="admin-summary-card">
          <div className="admin-summary-card__label">최근 내전</div>
          <div className="admin-summary-card__value admin-summary-card__value--small">
            {data.latestMatch
              ? data.latestMatch.title || `내전 #${data.latestMatch.id}`
              : "없음"}
          </div>
          <div className="admin-summary-card__meta">
            {data.latestMatch
              ? formatDate(data.latestMatch.playedAt)
              : "등록된 내전 없음"}
          </div>
        </div>
      </section>

      <section className="admin-log-section admin-dashboard-control">
        <div className="admin-log-section__header">
          <div>
            <h2 className="admin-section-title">방별 운영 설정</h2>
          </div>
          <a className="admin-button admin-button--ghost" href="/admin/site-settings">
            설정 열기
          </a>
        </div>

        <div className="admin-control-grid">
          {data.siteSettings.featureStates.map((item) => (
            <div className="admin-control-card" data-enabled={item.enabled ? "true" : "false"} key={item.feature}>
              <span>
                {item.feature === "kakao"
                  ? "카카오톡"
                  : item.feature === "recruit"
                    ? "구인현황"
                    : item.feature === "balanceAi"
                      ? "K-LOL 랭킹"
                      : item.feature === "randomTeam"
                        ? "랜덤 팀"
                        : "Riot 연동"}
              </span>
              <strong>{item.enabled ? "오픈" : "잠금"}</strong>
            </div>
          ))}
        </div>

        <div className="admin-env-grid">
          <div data-ready={data.siteSettings.envReady.database ? "true" : "false"}>DB 연결</div>
          <div data-ready={data.siteSettings.envReady.superAdmin ? "true" : "false"}>슈퍼어드민 ENV</div>
          <div data-ready={data.siteSettings.envReady.riotKey ? "true" : "false"}>Riot API KEY</div>
          <div data-ready={data.siteSettings.envReady.deployReady ? "true" : "false"}>배포 보안</div>
        </div>
      </section>

      {data.siteSettings.envReady.deployWarnings.length > 0 && (
        <section className="admin-log-section admin-log-section--alert admin-env-warning-section">
          <div className="admin-log-section__header">
            <div>
              <h2 className="admin-section-title">배포 전 보안 점검</h2>
            </div>
            <a className="admin-button admin-button--ghost" href="/admin/site-settings">
              설정 확인
            </a>
          </div>

          <div className="admin-env-warning-list">
            {data.siteSettings.envReady.deployWarnings.slice(0, 9).map((warning) => (
              <div
                className="admin-env-warning-item"
                data-level={warning.level}
                key={`${warning.key}-${warning.message}`}
              >
                <span>{warning.level === "missing" ? "필수 누락" : "값 강화 필요"}</span>
                <strong>{warning.key}</strong>
                <em>{warning.message}</em>
              </div>
            ))}
          </div>
        </section>
      )}


      {data.recentErrors.length > 0 && (
        <section className="admin-log-section admin-log-section--alert">
          <div className="admin-log-section__header">
            <div>
              <h2 className="admin-section-title">최근 오류/실패 기록</h2>
              <p className="admin-section-description">
                운영자가 먼저 확인해야 할 최근 실패 로그입니다.
              </p>
            </div>
          </div>

          <div className="admin-log-list">
            {data.recentErrors.map((log) => (
              <div key={log.id} className="admin-log-item admin-log-item--alert">
                <div className="admin-log-item__left">
                  <span className="admin-log-item__type">{log.action}</span>
                  <span className="admin-log-item__message">{log.message}</span>
                </div>
                <div className="admin-log-item__date">{formatDate(log.createdAt)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="admin-log-section">
        <div className="admin-log-section__header">
          <div>
            <h2 className="admin-section-title">전체 로그</h2>
            <p className="admin-section-description">
              관리자 페이지에서 발생한 주요 작업 기록입니다.
            </p>
          </div>

          <div className="admin-log-count">
            총 {data.logPagination.totalCount.toLocaleString()}개
          </div>
        </div>

        {loading ? (
          <div className="admin-dashboard-loading">
            로그를 불러오는 중입니다.
          </div>
        ) : data.logs.length === 0 ? (
          <div className="admin-log-empty">등록된 로그가 없습니다.</div>
        ) : (
          <>
            <div className="admin-log-list">
              {data.logs.map((log) => (
                <div key={log.id} className="admin-log-item">
                  <div className="admin-log-item__left">
                    <span className="admin-log-item__type">
                      {log.action}
                    </span>
                    <span className="admin-log-item__message">
                      {log.message}
                    </span>
                  </div>

                  <div className="admin-log-item__date">
                    {formatDate(log.createdAt)}
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={data.logPagination.totalPages}
              onPageChange={(page) => fetchDashboard(page)}
            />
          </>
        )}
      </section>
    </div>
  );
}
