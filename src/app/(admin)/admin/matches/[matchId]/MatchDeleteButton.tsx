"use client";

import { useRouter } from "next/navigation";

type MatchDeleteButtonProps = {
  matchId: number;
};

export default function MatchDeleteButton({
  matchId,
}: MatchDeleteButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    const ok = window.confirm("정말 이 내전을 삭제하시겠습니까?");
    if (!ok) {
      return;
    }

    const response = await fetch(`/api/matches/${matchId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("삭제에 실패했습니다.");
      return;
    }

    alert("삭제되었습니다.");
    router.push("/admin/matches");
    router.refresh();
  };

return (
  <button
    type="button"
    onClick={handleDelete}
    className="chip-button chip-button--danger"
  >
    삭제
  </button>
);
}