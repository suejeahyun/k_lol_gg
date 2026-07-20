"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = { id: number; nickname: string; tag: string };

export default function DestructionMvpBallot({ matchId, candidates, initialVotePlayerId, finalizedMvp, canVote }: {
  matchId: number;
  candidates: Candidate[];
  initialVotePlayerId: number | null;
  finalizedMvp: (Candidate & { method: "VOTE" | "ADMIN" | null }) | null;
  canVote: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialVotePlayerId);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const vote = async (candidatePlayerId: number) => {
    setSavingId(candidatePlayerId);
    setMessage("");
    try {
      const res = await fetch(`/api/destruction-matches/${matchId}/mvp/vote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidatePlayerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message ?? "투표 저장에 실패했습니다.");
        return;
      }
      setSelectedId(candidatePlayerId);
      setMessage("투표가 저장되었습니다. 확정 전까지 변경할 수 있습니다.");
      router.refresh();
    } catch {
      setMessage("투표 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <article className="destruction-mvp-ballot">
      <div className="destruction-mvp-ballot__header">
        <div>
          <span>경기 MVP · 전체 세트 합산</span>
          <strong>{finalizedMvp ? `${finalizedMvp.nickname}#${finalizedMvp.tag}` : "투표 진행 중"}</strong>
        </div>
        {finalizedMvp ? <em>{finalizedMvp.method === "VOTE" ? "유저 투표 선정" : "관리자 선정"}</em> : null}
      </div>
      {!finalizedMvp ? (
        <>
          <p>이 경기의 전체 세트를 합산해 가장 활약한 선수를 선택해주세요. 한 계정당 1표입니다.</p>
          <div className="destruction-mvp-ballot__candidates">
            {candidates.map((candidate) => (
              <button key={candidate.id} type="button" className={selectedId === candidate.id ? "chip-button" : "ghost-button"}
                disabled={!canVote || savingId !== null} onClick={() => vote(candidate.id)}>
                {candidate.nickname}#{candidate.tag}{selectedId === candidate.id ? " · 내 선택" : ""}
              </button>
            ))}
          </div>
          {!canVote ? <small>로그인한 승인 회원만 투표할 수 있습니다.</small> : null}
          {message ? <small>{message}</small> : null}
        </>
      ) : null}
    </article>
  );
}
