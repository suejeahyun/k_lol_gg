"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  seasonId: number;
  currentName: string;
};

export default function SeasonCloneButton({ seasonId, currentName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClone = async () => {
    const name = window.prompt("새 시즌 이름을 입력하세요.", `${currentName} 복제본`);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      alert("시즌 이름을 입력해주세요.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/seasons/${seasonId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        alert(data?.message ?? "시즌 복제에 실패했습니다.");
        return;
      }
      alert("시즌이 복제되었습니다.");
      router.refresh();
    } catch (error) {
      console.error("[SEASON_CLONE_BUTTON_ERROR]", error);
      alert("시즌 복제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" className="chip-button" onClick={handleClone} disabled={loading}>
      {loading ? "복제 중..." : "시즌 복제"}
    </button>
  );
}
