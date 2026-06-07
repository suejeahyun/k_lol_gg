"use client";

import { useEffect, useMemo, useState } from "react";

type Visitor = {
  userId: string;
  name: string;
  tag: string | null;
  visitedAt: string;
};

type VisitorMode = "ONLINE" | "TODAY";

const PAGE_SIZE = 5;

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function TodayVisitorsBox() {
  const [todayVisitors, setTodayVisitors] = useState<Visitor[]>([]);
  const [onlineVisitors, setOnlineVisitors] = useState<Visitor[]>([]);
  const [mode, setMode] = useState<VisitorMode>("ONLINE");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function syncVisit() {
      try {
        await fetch("/api/community/visits", { method: "POST" }).catch(() => null);
        const res = await fetch("/api/community/visits", { cache: "no-store" });
        if (!res.ok) return;
        const data: { todayVisitors?: Visitor[]; onlineVisitors?: Visitor[]; visitors?: Visitor[] } = await res.json();

        if (mounted) {
          setTodayVisitors(data.todayVisitors ?? data.visitors ?? []);
          setOnlineVisitors(data.onlineVisitors ?? []);
        }
      } catch (error) {
        console.error("[TODAY_VISITORS_BOX_ERROR]", error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    syncVisit().catch((error) => {
      console.error("[TODAY_VISITORS_BOX_PROMISE_ERROR]", error);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [mode]);

  const visitors = mode === "ONLINE" ? onlineVisitors : todayVisitors;
  const pageCount = Math.max(1, Math.ceil(visitors.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageVisitors = useMemo(
    () => visitors.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [visitors, safePage],
  );

  if (!loading && todayVisitors.length === 0 && onlineVisitors.length === 0) return null;

  return (
    <section className="sidebar-visitors" aria-label="멤버 소식">
      <div className="sidebar-visitors__head">
        <strong>멤버 소식</strong>
        <span>{mode === "ONLINE" ? "로그인 중" : "금일 로그인"}</span>
      </div>

      <div className="sidebar-visitors__tabs" role="tablist" aria-label="멤버 소식 구분">
        <button
          className={mode === "ONLINE" ? "sidebar-visitors__tab sidebar-visitors__tab--active" : "sidebar-visitors__tab"}
          type="button"
          onClick={() => setMode("ONLINE")}
        >
          로그인 중 {onlineVisitors.length}
        </button>
        <button
          className={mode === "TODAY" ? "sidebar-visitors__tab sidebar-visitors__tab--active" : "sidebar-visitors__tab"}
          type="button"
          onClick={() => setMode("TODAY")}
        >
          금일 {todayVisitors.length}
        </button>
      </div>

      <div className="sidebar-visitors__list">
        {loading ? (
          <span className="sidebar-visitors__empty">불러오는 중</span>
        ) : pageVisitors.length > 0 ? (
          pageVisitors.map((visitor) => (
            <div key={`${mode}-${visitor.userId}-${visitor.visitedAt}`} className="sidebar-visitors__item" title={visitor.tag ? `${visitor.name}#${visitor.tag}` : visitor.name}>
              <span className={mode === "ONLINE" ? "sidebar-visitors__dot" : "sidebar-visitors__dot sidebar-visitors__dot--muted"} />
              <span className="sidebar-visitors__name">{visitor.name}</span>
              <span className="sidebar-visitors__time">{formatTime(visitor.visitedAt)}</span>
            </div>
          ))
        ) : (
          <span className="sidebar-visitors__empty">표시할 멤버 없음</span>
        )}
      </div>

      {!loading && pageCount > 1 ? (
        <div className="sidebar-visitors__pager" aria-label="멤버 소식 페이지">
          <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={safePage === 0}>‹</button>
          <span>{safePage + 1}/{pageCount}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={safePage >= pageCount - 1}>›</button>
        </div>
      ) : null}
    </section>
  );
}
