"use client";

import { useEffect, useState } from "react";

type Visitor = {
  userId: string;
  name: string;
  tag: string | null;
  visitedAt: string;
};

export default function TodayVisitorsBox() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function syncVisit() {
      try {
        await fetch("/api/community/visits", { method: "POST" }).catch(() => null);
        const res = await fetch("/api/community/visits", { cache: "no-store" });
        if (!res.ok) return;
        const data: { visitors?: Visitor[] } = await res.json();
        if (mounted) setVisitors(data.visitors ?? []);
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

  if (!loading && visitors.length === 0) return null;

  return (
    <section className="sidebar-visitors" aria-label="금일 로그인한 유저">
      <div className="sidebar-visitors__head">
        <strong>멤버 소식</strong>
        <span>금일 로그인</span>
      </div>

      <div className="sidebar-visitors__list">
        {loading ? (
          <span className="sidebar-visitors__empty">불러오는 중</span>
        ) : (
          visitors.map((visitor) => (
            <div key={`${visitor.userId}-${visitor.visitedAt}`} className="sidebar-visitors__item" title={visitor.tag ? `${visitor.name}#${visitor.tag}` : visitor.name}>
              <span className="sidebar-visitors__dot" />
              <span className="sidebar-visitors__name">{visitor.name}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
