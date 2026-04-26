"use client";

import { useEffect, useState } from "react";
import Pagination from "@/components/Pagination";

type DashboardData = {
  currentSeason: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  playerCount: number;
  matchCount: number;
  latestMatch: {
    id: number;
    title: string | null;
    playedAt: string;
  } | null;
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
          <p className="admin-dashboard-subtitle">
            현재 시즌, 전체 데이터 현황, 최근 내전 및 운영 로그를 확인합니다.
          </p>
        </div>
      </div>

      <section className="admin-summary-grid">
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