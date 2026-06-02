"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  eventId: number;
  eventTitle: string;
};

export default function EventMatchListActions({ eventId, eventTitle }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (pending) return;

    const confirmed = window.confirm(
      [
        `이벤트 내전 "${eventTitle}"을 삭제합니다.`,
        "",
        "삭제되는 데이터:",
        "- 이벤트 내전 기본 정보",
        "- 참가자 신청/참가자 목록",
        "- 팀 구성 정보",
        "- 대진표 및 경기 결과",
        "",
        "계속 진행할까요?",
      ].join("\n"),
    );

    if (!confirmed) return;

    setPending(true);

    try {
      const response = await fetch(`/api/event-matches/${eventId}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || "이벤트 내전 삭제에 실패했습니다.");
      }

      window.alert(data?.message || "이벤트 내전이 삭제되었습니다.");
      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "이벤트 내전 삭제 중 오류가 발생했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-event-card__actions">
      <Link href={`/admin/progress/event/${eventId}`} className="chip-button">
        상세수정
      </Link>

      <button
        type="button"
        className="chip-button chip-button--danger"
        onClick={handleDelete}
        disabled={pending}
      >
        {pending ? "삭제 중..." : "삭제"}
      </button>
    </div>
  );
}
