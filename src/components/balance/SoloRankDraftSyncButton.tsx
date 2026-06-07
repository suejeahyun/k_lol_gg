"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncResult = {
  processed?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  message?: string;
  results?: Array<{
    playerId: number;
    name: string;
    status: string;
    message: string;
  }>;
};

export default function SoloRankDraftSyncButton({ draftId }: { draftId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function syncSoloRank() {
    if (busy) return;

    setBusy(true);
    setMessage("솔랭 전적 갱신 중...");

    try {
      const response = await fetch(`/api/team-balance/drafts/${draftId}/solo-rank/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as SyncResult;

      if (!response.ok) {
        setMessage(data.message ?? "솔랭 전적 갱신 중 오류가 발생했습니다.");
        return;
      }

      const failedList = (data.results ?? [])
        .filter((item) => item.status === "failed")
        .slice(0, 3)
        .map((item) => `${item.name}(${item.message})`)
        .join(", ");
      const skippedList = (data.results ?? [])
        .filter((item) => item.status === "skipped")
        .slice(0, 3)
        .map((item) => `${item.name}(${item.message})`)
        .join(", ");

      if ((data.failed ?? 0) > 0) {
        setMessage(
          `일부 실패 · 갱신 ${data.updated ?? 0}명 / 스킵 ${data.skipped ?? 0}명 / 실패 ${data.failed ?? 0}명${failedList ? ` · ${failedList}` : ""}`,
        );
      } else if ((data.skipped ?? 0) > 0) {
        setMessage(
          `갱신 완료 · 갱신 ${data.updated ?? 0}명 / 스킵 ${data.skipped ?? 0}명${skippedList ? ` · ${skippedList}` : ""}`,
        );
      } else {
        setMessage(
          `갱신 완료 · 처리 ${data.processed ?? 0}명 / 갱신 ${data.updated ?? 0}명`,
        );
      }
      router.refresh();
    } catch (error) {
      console.error("[DRAFT_SOLO_RANK_SYNC_BUTTON_ERROR]", error);
      setMessage("솔랭 전적 갱신 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-solo-sync">
      <button className="button-secondary" type="button" onClick={syncSoloRank} disabled={busy}>
        {busy ? "솔랭 갱신 중" : "최근 솔로 랭크 전적 갱신"}
      </button>
      {message ? <span className="ai-solo-sync__message">{message}</span> : null}
    </div>
  );
}
