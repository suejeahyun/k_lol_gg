"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MatchDeleteButtonProps = {
  matchId: number;
  matchTitle?: string;
};

async function saveAdminLog(action: string, message: string) {
  await fetch("/api/logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      message,
    }),
  }).catch((error) => {
    console.error("[ADMIN_LOG_SAVE_ERROR]", error);
  });
}

export default function MatchDeleteButton({
  matchId,
  matchTitle,
}: MatchDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (isDeleting) return;

    const ok = window.confirm("정말 삭제하시겠습니까?");
    if (!ok) return;

    setIsDeleting(true);

    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        alert(error?.message ?? "내전 삭제 실패");
        return;
      }

      await saveAdminLog(
        "MATCH_DELETE",
        `내전 삭제: ${matchTitle ?? `ID ${matchId}`}`
      );

      router.refresh();
    } catch (error) {
      console.error("[MATCH_DELETE_ERROR]", error);
      alert("내전 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      type="button"
      className="chip-button danger"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? "삭제 중..." : "삭제"}
    </button>
  );
}
