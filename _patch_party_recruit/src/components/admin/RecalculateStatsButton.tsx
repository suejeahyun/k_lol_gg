"use client";

import { useState } from "react";

export default function RecalculateStatsButton({ seasonId }: { seasonId?: number | null }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    const ok = window.confirm(
      "현재 시즌 통계를 다시 계산합니다. 랭킹, 챔피언 통계, 포지션 통계에 영향을 줄 수 있습니다. 계속 진행하시겠습니까?",
    );

    if (!ok) return;

    try {
      setLoading(true);
      const res = await fetch("/api/admin/stats/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.message || "통계 재계산 실패");
        return;
      }

      alert(data.message || "통계 재계산이 완료되었습니다.");
      window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button className="admin-button" type="button" onClick={handleClick} disabled={loading}>
      {loading ? "재계산 중" : "현재 시즌 통계 재계산"}
    </button>
  );
}
