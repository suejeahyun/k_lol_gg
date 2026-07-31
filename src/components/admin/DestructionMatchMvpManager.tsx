"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = { id: number; name: string; nickname: string; tag: string; voteCount: number };

export default function DestructionMatchMvpManager({ matchId, candidates, initialMvpPlayerId, initialMethod }: {
  matchId: number;
  candidates: Candidate[];
  initialMvpPlayerId: number | null;
  initialMethod: "VOTE" | "ADMIN" | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialMvpPlayerId ?? candidates[0]?.id ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const totalVotes = candidates.reduce((sum, candidate) => sum + candidate.voteCount, 0);

  const finalize = async () => {
    setIsSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/destruction-matches/${matchId}/mvp`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "ADMIN", mvpPlayerId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? "MVP 확정에 실패했습니다."); return; }
      router.refresh();
    } catch { setError("MVP 확정 중 오류가 발생했습니다."); }
    finally { setIsSaving(false); }
  };

  const reset = async () => {
    if (!window.confirm("현재 MVP 지정과 1차·재투표를 포함한 전체 투표 내역을 초기화할까요? 초기화 후 참가자 10명이 처음부터 다시 투표해야 합니다.")) return;

    setIsSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/destruction-matches/${matchId}/mvp`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? "MVP 초기화에 실패했습니다."); return; }
      setSelectedId(candidates[0]?.id ?? 0);
      router.refresh();
    } catch { setError("MVP 초기화 중 오류가 발생했습니다."); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="destruction-admin-mvp">
      <div className="destruction-admin-mvp__title">
        <strong>경기 MVP · 전체 세트 합산</strong>
        <span>총 {totalVotes}표{initialMvpPlayerId ? ` · ${initialMethod === "VOTE" ? "투표" : "관리자"} 확정됨` : ""}</span>
      </div>
      <div className="destruction-admin-mvp__candidates">
        {candidates.map((candidate) => (
          <label key={candidate.id}>
            <input type="radio" name={`mvp-${matchId}`} value={candidate.id} checked={selectedId === candidate.id} onChange={() => setSelectedId(candidate.id)} />
            <span>{candidate.name} ({candidate.nickname}#{candidate.tag})</span><b>{candidate.voteCount}표</b>
          </label>
        ))}
      </div>
      <div className="destruction-admin-mvp__actions">
        <button type="button" className="chip-button" disabled={isSaving || !selectedId} onClick={finalize}>선택 선수 직접 지정</button>
        {initialMvpPlayerId || totalVotes > 0 ? (
          <button type="button" className="danger-button" disabled={isSaving} onClick={reset}>MVP 전체 초기화</button>
        ) : null}
      </div>
      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}
