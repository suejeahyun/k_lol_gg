"use client";

import { useRouter } from "next/navigation";

type SeasonDeleteButtonProps = {
  seasonId: number;
};

export default function SeasonDeleteButton({
  seasonId,
}: SeasonDeleteButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    const ok = window.confirm("정말 이 시즌을 삭제하시겠습니까?");
    if (!ok) {
      return;
    }

    const response = await fetch(`/api/seasons/${seasonId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message ?? "시즌 삭제에 실패했습니다.");
      return;
    }

    alert("시즌이 삭제되었습니다.");
    router.refresh();
  };

  return (
    <button
      type="button"
      className="chip-button chip-button--danger"
      onClick={handleDelete}
    >
      삭제
    </button>
  );
}