"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  highlightId: number;
};

export default function HighlightDeleteButton({ highlightId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("하이라이트를 삭제할까요?")) return;

    try {
      setDeleting(true);

      const res = await fetch(`/api/highlights/${highlightId}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.message ?? "삭제 중 오류가 발생했습니다.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("[HIGHLIGHT_DELETE_ERROR]", error);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      type="button"
      className="chip-button chip-button--danger"
      onClick={handleDelete}
      disabled={deleting}
    >
      {deleting ? "삭제 중..." : "삭제"}
    </button>
  );
}
