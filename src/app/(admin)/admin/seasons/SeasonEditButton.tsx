"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SeasonEditButtonProps = {
  seasonId: number;
  currentName: string;
};

export default function SeasonEditButton({
  seasonId,
  currentName,
}: SeasonEditButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleEdit = async () => {
    const nextName = window.prompt("수정할 시즌 이름을 입력하세요.", currentName);

    if (!nextName) {
      return;
    }

    const trimmed = nextName.trim();

    if (!trimmed) {
      alert("시즌 이름을 입력해주세요.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/seasons/${seasonId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmed,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message ?? "시즌 이름 수정에 실패했습니다.");
        return;
      }

      alert("시즌 이름이 수정되었습니다.");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("시즌 이름 수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="chip-button"
      onClick={handleEdit}
      disabled={loading}
    >
      {loading ? "수정 중..." : "이름 수정"}
    </button>
  );
}