"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatKoreanDateTime } from "@/platform/time/format-korean-date-time";

export function LiveViewRefresh({ checkedAt }: { checkedAt: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const lastAttempt = useRef(checkedAt ? Date.parse(checkedAt) : 0);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible" || pending || Date.now() - lastAttempt.current < 30_000) return;
      lastAttempt.current = Date.now();
      startTransition(() => router.refresh());
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [pending, router]);

  return <div className="task-status" aria-label="모집 현황 갱신">
    <p role="status" aria-live="polite">{pending ? "최신 현황을 불러오는 중…" : checkedAt ? <>마지막 조회 <time dateTime={checkedAt}>{formatKoreanDateTime(checkedAt)}</time></> : "현황을 확인하지 못했어요."}</p>
    <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => {
      lastAttempt.current = Date.now();
      startTransition(() => router.refresh());
    }}>현황 새로고침</Button>
  </div>;
}
