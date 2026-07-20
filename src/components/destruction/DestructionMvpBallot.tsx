"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  position?: string | null;
  teamSide?: "A" | "B";
};

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export default function DestructionMvpBallot({ matchId, candidates, initialVotePlayerId, finalizedMvp, canVote, unavailableMessage, teamLayout }: {
  matchId: number;
  candidates: Candidate[];
  initialVotePlayerId: number | null;
  finalizedMvp: (Candidate & { method: "VOTE" | "ADMIN" | null }) | null;
  canVote: boolean;
  unavailableMessage?: string;
  teamLayout?: { teamAName: string; teamBName: string };
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

  const renderCandidate = (candidate: Candidate | undefined, side: "A" | "B", position: string) => {
    if (!candidate) {
      const hasPosition = candidates.some((item) => item.teamSide === side && item.position === position);
      return <span className="destruction-mvp-lineup__empty">{hasPosition ? "선택 불가" : "본인 제외"}</span>;
    }

    return (
      <button type="button" className={selectedId === candidate.id ? "chip-button" : "ghost-button"}
        disabled={!canVote || savingId !== null} onClick={() => vote(candidate.id)}>
        {candidate.name} <span>({candidate.nickname}#{candidate.tag})</span>
        {selectedId === candidate.id ? <em>내 선택</em> : null}
      </button>
    );
  };

  return (
    <article className="destruction-mvp-ballot">
      <div className="destruction-mvp-ballot__header">
        <div>
          <span>경기 MVP · 전체 세트 합산</span>
          <strong>{finalizedMvp ? `${finalizedMvp.name} (${finalizedMvp.nickname}#${finalizedMvp.tag})` : "투표 진행 중"}</strong>
        </div>
        {finalizedMvp ? <em>{finalizedMvp.method === "VOTE" ? "유저 투표 선정" : "관리자 선정"}</em> : null}
      </div>
      {!finalizedMvp ? (
        <>
          <p>전체 세트 활약을 합산해 본인을 제외한 참가자 중 한 명을 선택해주세요. 참가자당 1표입니다.</p>
          {teamLayout ? (
            <div className="destruction-mvp-lineup">
              <div className="destruction-mvp-lineup__header">
                <strong>{teamLayout.teamAName}</strong>
                <span>라인</span>
                <strong>{teamLayout.teamBName}</strong>
              </div>
              {POSITIONS.map((position) => (
                <div className="destruction-mvp-lineup__row" key={position}>
                  {renderCandidate(candidates.find((candidate) => candidate.teamSide === "A" && candidate.position === position), "A", position)}
                  <b>{position}</b>
                  {renderCandidate(candidates.find((candidate) => candidate.teamSide === "B" && candidate.position === position), "B", position)}
                </div>
              ))}
            </div>
          ) : (
            <div className="destruction-mvp-ballot__candidates">
              {candidates.map((candidate) => (
                <button key={candidate.id} type="button" className={selectedId === candidate.id ? "chip-button" : "ghost-button"}
                  disabled={!canVote || savingId !== null} onClick={() => vote(candidate.id)}>
                  {candidate.name} ({candidate.nickname}#{candidate.tag}){selectedId === candidate.id ? " · 내 선택" : ""}
                </button>
              ))}
            </div>
          )}
          {!canVote ? <small>{unavailableMessage ?? "투표할 수 없는 경기입니다."}</small> : null}
          {message ? <small>{message}</small> : null}
        </>
      ) : null}
    </article>
  );
}
