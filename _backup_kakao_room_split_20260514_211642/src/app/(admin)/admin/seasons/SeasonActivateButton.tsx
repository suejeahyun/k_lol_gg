"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SeasonActivateButtonProps = {
  seasonId: number;
  isActive: boolean;
};

export default function SeasonActivateButton({
  seasonId,
  isActive,
}: SeasonActivateButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/seasons/${seasonId}/activate`, {
        method: "PATCH",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message ?? "현재 시즌 변경에 실패했습니다.");
        return;
      }

      alert("현재 시즌이 변경되었습니다.");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("현재 시즌 변경 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (isActive) {
    return <span className="chip-button">현재 시즌</span>;
  }

  return (
    <button
      type="button"
      className="chip-button"
      onClick={handleActivate}
      disabled={loading}
    >
      {loading ? "변경 중..." : "현재 시즌으로 설정"}
    </button>
  );
}