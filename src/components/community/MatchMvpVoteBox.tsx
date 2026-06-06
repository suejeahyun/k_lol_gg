"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Candidate = { playerId: number; label: string; team: string; position: string; votes: number };

export default function MatchMvpVoteBox({ gameId, candidates, closed }: { gameId: number; candidates: Candidate[]; closed: boolean }) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState(candidates[0]?.playerId ? String(candidates[0].playerId) : "");
  const [message, setMessage] = useState("");

  async function vote() {
    setMessage("");
    const res = await fetch("/api/community/mvp-votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, playerId: Number(playerId) }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(data.message ?? (res.ok ? "투표가 반영되었습니다." : "투표 중 오류가 발생했습니다."));
    if (res.ok) router.refresh();
  }

  return (
    <div className="community-mvp-box">
      <div className="community-mvp-box__head">
        <strong>{gameId}번 세트 유저 MVP 투표</strong>
        <span>{closed ? "마감" : "매치 등록 후 24시간 동안 가능"}</span>
      </div>
      <div className="community-mvp-list">
        {candidates.map((candidate) => (
          <div key={candidate.playerId} className="community-mvp-item">
            <span>{candidate.team} · {candidate.position}</span>
            <strong>{candidate.label}</strong>
            <em>{candidate.votes}표</em>
          </div>
        ))}
      </div>
      {!closed && (
        <div className="community-mvp-vote-row">
          <select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
            {candidates.map((candidate) => <option key={candidate.playerId} value={candidate.playerId}>{candidate.label}</option>)}
          </select>
          <button className="button button--primary" onClick={vote}>MVP 투표</button>
        </div>
      )}
      {message && <p className="form-help">{message}</p>}
    </div>
  );
}
