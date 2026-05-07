"use client";

import { useRouter } from "next/navigation";

type Props = {
  playerId: number;
};

export default function PlayerDeleteButton({ playerId }: Props) {
  const router = useRouter();

  const handleDelete = async () => {
    const ok = window.confirm("이 플레이어를 비활성화하시겠습니까? 기존 경기/통계 기록은 보존됩니다.");
    if (!ok) return;

    const response = await fetch(`/api/players/${playerId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message ?? "비활성화 실패");
      return;
    }

    alert("비활성화되었습니다.");
    router.refresh();
  };

  return (
    <button
      type="button"
      className="chip-button chip-button--danger"
      onClick={handleDelete}
    >
      비활성화
    </button>
  );
}