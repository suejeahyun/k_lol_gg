"use client";

import { useState } from "react";

type ImportType = "event" | "destruction";

type ImportParticipantsButtonProps = {
  type: ImportType;
  targetId: number;
};

export default function ImportParticipantsButton({
  type,
  targetId,
}: ImportParticipantsButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const ok = confirm("참가 신청자 목록을 가져오시겠습니까?");
    if (!ok) return;

    try {
      setLoading(true);

      const url =
        type === "event"
          ? `/api/admin/event-matches/${targetId}/import-participants`
          : `/api/admin/destruction-tournaments/${targetId}/import-participants`;

      const res = await fetch(url, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "참가자 가져오기 실패");
        return;
      }

      alert(`${data.message} (${data.count ?? 0}명)`);
      window.location.reload();
    } catch (error: unknown) {
      console.error("[IMPORT_PARTICIPANTS_BUTTON_ERROR]", error);
      alert("참가자 가져오기 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="chip-button"
      onClick={() => {
        handleImport().catch((error: unknown) => {
          console.error("[IMPORT_PARTICIPANTS_PROMISE_ERROR]", error);
        });
      }}
      disabled={loading}
    >
      {loading ? "가져오는 중..." : "참가자 가져오기"}
    </button>
  );
}