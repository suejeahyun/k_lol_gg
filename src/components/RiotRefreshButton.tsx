"use client";

import { useState } from "react";

type RiotRefreshButtonProps = {
  playerId: number;
};

export default function RiotRefreshButton({
  playerId,
}: RiotRefreshButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleRefresh() {
    if (isLoading) return;

    setIsLoading(true);

    try {
      const response = await fetch(`/api/players/${playerId}/riot/refresh`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error ?? "Riot 데이터 갱신에 실패했습니다.");
        return;
      }

      window.location.reload();
    } catch (error) {
      console.error("[RIOT_REFRESH_BUTTON_ERROR]", error);
      alert("Riot 데이터 갱신 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={isLoading}
      className="btn btn-ghost"
    >
      {isLoading ? "갱신 중..." : "리프레시"}
    </button>
  );
}