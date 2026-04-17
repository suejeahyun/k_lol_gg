"use client";

import { useRouter } from "next/navigation";

type Props = {
  playerId: number;
};

export default function PlayerDeleteButton({ playerId }: Props) {
  const router = useRouter();

  const handleDelete = async () => {
    const ok = window.confirm("정말 이 플레이어를 삭제하시겠습니까?");
    if (!ok) return;

    const response = await fetch(`/api/players/${playerId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message ?? "삭제 실패");
      return;
    }

    alert("삭제되었습니다.");
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