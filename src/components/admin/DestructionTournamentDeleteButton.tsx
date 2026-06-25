"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DestructionTournamentDeleteButtonProps = {
  tournamentId: number;
  title: string;
};

export default function DestructionTournamentDeleteButton({
  tournamentId,
  title,
}: DestructionTournamentDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `멸망전 "${title}"을 삭제하시겠습니까?\n\n팀, 참가자, 경기 데이터가 함께 삭제됩니다.`,
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/destruction-tournaments/${tournamentId}`, {
        method: "DELETE",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        alert(result?.message ?? "멸망전 삭제에 실패했습니다.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("[DESTRUCTION_TOURNAMENT_DELETE_BUTTON_ERROR]", error);
      alert("멸망전 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      className="chip-button chip-button--danger"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? "삭제 중..." : "삭제"}
    </button>
  );
}
