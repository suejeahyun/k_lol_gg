"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type NoticeDeleteButtonProps = {
  noticeId: number;
};

export default function NoticeDeleteButton({
  noticeId,
}: NoticeDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm("이 공지사항을 삭제하시겠습니까?");

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/notices/${noticeId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        alert(result?.message ?? "공지사항 삭제에 실패했습니다.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("[NOTICE_DELETE_BUTTON_ERROR]", error);
      alert("공지사항 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      className="notice-delete-button"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? "삭제 중..." : "삭제"}
    </button>
  );
}