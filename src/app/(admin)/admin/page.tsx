"use client";

import { useEffect, useState } from "react";
import Pagination from "@/components/Pagination";

type DashboardData = {
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
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
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
      const res = await fetch(`/api/admin/dashboard?page=${page}`, { cache: "no-store" });
      if (!res.ok) throw new Error("전체 로그 조회 실패");
      const result = (await res.json()) as DashboardData;
      setData(result);
      setCurrentPage(result.logPagination.page);
    } catch (error) {
      console.error("[ADMIN_LOG_HOME_PAGE_ERROR]", error);
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
      <div className="page-container admin-mobile-home-logs">
        <h1 className="page-title">전체 로그</h1>
        <div className="admin-dashboard-loading">로그를 불러오는 중입니다.</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container admin-mobile-home-logs">
        <h1 className="page-title">전체 로그</h1>
        <div className="admin-dashboard-error">로그를 불러오지 못했습니다.</div>
      </div>
    );
  }

  return (
    <div className="page-container admin-mobile-home-logs">
      <div className="admin-dashboard-header admin-dashboard-header--logs-only">
        <div>
          <p className="page-eyebrow">ADMIN LOG</p>
          <h1 className="page-title">전체 로그</h1>
        </div>
        <div className="admin-log-count">총 {data.logPagination.totalCount.toLocaleString()}개</div>
      </div>

      <section className="admin-log-section admin-log-section--home-only">
        {loading ? (
          <div className="admin-dashboard-loading">로그를 불러오는 중입니다.</div>
        ) : data.logs.length === 0 ? (
          <div className="admin-log-empty">등록된 로그가 없습니다.</div>
        ) : (
          <>
            <div className="admin-log-list">
              {data.logs.map((log) => (
                <div key={log.id} className="admin-log-item">
                  <div className="admin-log-item__left">
                    <span className="admin-log-item__type">{log.action}</span>
                    <span className="admin-log-item__message">{log.message}</span>
                  </div>
                  <div className="admin-log-item__date">{formatDate(log.createdAt)}</div>
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
