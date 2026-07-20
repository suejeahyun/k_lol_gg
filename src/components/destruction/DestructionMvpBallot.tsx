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
  selectable?: boolean;
  unavailableLabel?: string;
};

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export default function DestructionMvpBallot({ matchId, candidates, initialVotePlayerId, finalizedMvp, canVote, unavailableMessage, teamLayout, voteRound = 1 }: {
  matchId: number;
  candidates: Candidate[];
  initialVotePlayerId: number | null;
  finalizedMvp: (Candidate & { method: "VOTE" | "ADMIN" | null }) | null;
  canVote: boolean;
  unavailableMessage?: string;
  teamLayout?: { teamAName: string; teamBName: string };
  voteRound?: number;
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
      setSelectedId(data.status === "VOTED" ? candidatePlayerId : null);
      setMessage(data.message ?? "투표가 저장되었습니다. 확정 전까지 변경할 수 있습니다.");
      router.refresh();
    } catch {
      setMessage("투표 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  const renderCandidate = (candidate: Candidate | undefined) => {
    if (!candidate) {
      return <span className="destruction-mvp-lineup__empty">선수 미정</span>;
    }

    if (candidate.selectable === false) {
      return (
        <span className="destruction-mvp-lineup__empty">
          <strong>{candidate.name}</strong>
          <span>({candidate.nickname}#{candidate.tag})</span>
          <small>{candidate.unavailableLabel ?? "선택 불가"}</small>
        </span>
      );
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
          <p>
            {voteRound > 1
              ? `${voteRound}차 재투표입니다. 동률 후보 중 본인을 제외한 한 명을 선택해주세요.`
              : "전체 세트 활약을 합산해 본인을 제외한 참가자 중 한 명을 선택해주세요. 참가자당 1표입니다."}
          </p>
          {teamLayout ? (
            <div className="destruction-mvp-lineup">
              <div className="destruction-mvp-lineup__header">
                <strong>{teamLayout.teamAName}</strong>
                <span>라인</span>
                <strong>{teamLayout.teamBName}</strong>
              </div>
              {POSITIONS.map((position) => (
                <div className="destruction-mvp-lineup__row" key={position}>
                  {renderCandidate(candidates.find((candidate) => candidate.teamSide === "A" && candidate.position === position))}
                  <b>{position}</b>
                  {renderCandidate(candidates.find((candidate) => candidate.teamSide === "B" && candidate.position === position))}
                </div>
              ))}
            </div>
          ) : (
            <div className="destruction-mvp-ballot__candidates">
              {candidates.map((candidate) => (
                <button key={candidate.id} type="button" className={selectedId === candidate.id ? "chip-button" : "ghost-button"}
                  disabled={!canVote || savingId !== null || candidate.selectable === false} onClick={() => vote(candidate.id)}>
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
