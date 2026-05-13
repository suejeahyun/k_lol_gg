"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  seasonId: number;
  isActive: boolean;
};

export default function SeasonEndButton({ seasonId, isActive }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleEnd = async () => {
    if (!isActive) return;
    if (!window.confirm("현재 시즌을 종료하고 비활성 상태로 변경할까요?")) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/seasons/${seasonId}/end`, { method: "PATCH" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        alert(data?.message ?? "시즌 종료에 실패했습니다.");
        return;
      }
      alert("시즌이 종료되었습니다.");
      router.refresh();
    } catch (error) {
      console.error("[SEASON_END_BUTTON_ERROR]", error);
      alert("시즌 종료 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!isActive) return null;

  return (
    <button type="button" className="chip-button" onClick={handleEnd} disabled={loading}>
      {loading ? "종료 중..." : "시즌 종료"}
    </button>
  );
}
