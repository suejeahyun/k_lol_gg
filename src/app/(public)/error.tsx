"use client";

import { useEffect } from "react";

import { StatusPanel } from "@/components/status-panel";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("K-LOL.GG V2 public route error", error);
  }, [error]);

  return (
    <div className="page-wrap status-page" role="alert">
      <StatusPanel
        eyebrow="TEMPORARY ERROR"
        title="화면을 불러오지 못했어요"
        description="잠시 후 다시 시도해 주세요. 같은 문제가 계속되면 오류 식별값과 함께 알려주세요."
      >
        <Button type="button" size="lg" onClick={() => retry()}>
          다시 시도
        </Button>
        {error.digest ? <small>오류 식별값: {error.digest}</small> : null}
      </StatusPanel>
    </div>
  );
}
