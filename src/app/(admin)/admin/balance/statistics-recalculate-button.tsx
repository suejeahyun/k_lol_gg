"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function StatisticsRecalculateButton({
  seasonId,
  seasonName,
  generation,
  allowed,
}: {
  seasonId: string;
  seasonName: string;
  generation: number;
  allowed: boolean;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [message, setMessage] = useState(allowed ? "" : "최고 관리자 전용");
  const [pending, setPending] = useState(false);

  async function recalculate() {
    if (!allowed || pending) return;
    if (!window.confirm(`${seasonName} 통계를 공개 경기 원본에서 다시 계산할까요?`)) return;
    setPending(true);
    setMessage("재계산 중…");
    idempotencyKey.current ??= `stats-${crypto.randomUUID()}`;
    try {
      const response = await fetch("/api/admin/stats/recalculate", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
          "If-Match": `"${generation}"`,
        },
        body: JSON.stringify({ seasonId }),
      });
      const body = await response.json().catch(() => null) as { generation?: number; title?: string } | null;
      if (!response.ok) {
        setMessage(body?.title ?? "재계산 요청을 처리하지 못했습니다.");
        if (response.status === 412) {
          idempotencyKey.current = null;
          router.refresh();
        }
        return;
      }
      idempotencyKey.current = null;
      setMessage(`계산 버전 ${body?.generation ?? generation + 1} 완료`);
      router.refresh();
    } catch {
      setMessage("네트워크 오류로 재계산하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" disabled={!allowed || pending} onClick={recalculate}>
        {pending ? "계산 중" : "수동 재계산"}
      </button>
      <span aria-live="polite">{message}</span>
    </div>
  );
}
