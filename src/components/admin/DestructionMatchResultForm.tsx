"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Team = {
  id: number;
  name: string;
};

type Participant = {
  id: number;
  playerId: number;
  teamId: number | null;
  player: {
    id: number;
    nickname: string;
    tag: string;
  };
};

type Props = {
  tournamentId: number;
  matchId: number;
  teamA: Team;
  teamB: Team;
  participants?: Participant[];
  initialWinnerTeamId: number | null;
  initialMvpPlayerId?: number | null;
  initialTeamAScore?: number | null;
  initialTeamBScore?: number | null;
  bestOf?: number | null;
};

function normalizeBestOf(bestOf?: number | null) {
  const value = Number(bestOf ?? 3);

  if (value <= 1) return 1;
  if (value <= 3) return 3;
  return 5;
}

function createInitialSetWinners({
  teamA,
  teamB,
  bestOf,
  initialTeamAScore,
  initialTeamBScore,
}: {
  teamA: Team;
  teamB: Team;
  bestOf: number;
  initialTeamAScore?: number | null;
  initialTeamBScore?: number | null;
}) {
  const winners: Array<number | null> = Array.from({ length: bestOf }, () => null);
  let cursor = 0;

  const teamAScore = Math.max(0, Number(initialTeamAScore ?? 0));
  const teamBScore = Math.max(0, Number(initialTeamBScore ?? 0));

  for (let i = 0; i < teamAScore && cursor < winners.length; i += 1) {
    winners[cursor] = teamA.id;
    cursor += 1;
  }

  for (let i = 0; i < teamBScore && cursor < winners.length; i += 1) {
    winners[cursor] = teamB.id;
    cursor += 1;
  }

  return winners;
}

export default function DestructionMatchResultForm({
  tournamentId,
  matchId,
  teamA,
  teamB,
  initialWinnerTeamId,
  initialTeamAScore,
  initialTeamBScore,
  bestOf,
}: Props) {
  const router = useRouter();
  const normalizedBestOf = normalizeBestOf(bestOf);
  const requiredWins = Math.floor(normalizedBestOf / 2) + 1;

  const [setWinners, setSetWinners] = useState<Array<number | null>>(() =>
    createInitialSetWinners({
      teamA,
      teamB,
      bestOf: normalizedBestOf,
      initialTeamAScore,
      initialTeamBScore,
    }),
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const score = useMemo(() => {
    const teamAScore = setWinners.filter((winner) => winner === teamA.id).length;
    const teamBScore = setWinners.filter((winner) => winner === teamB.id).length;

    let winnerTeamId: number | null = null;
    if (teamAScore >= requiredWins) winnerTeamId = teamA.id;
    if (teamBScore >= requiredWins) winnerTeamId = teamB.id;

    return {
      teamAScore,
      teamBScore,
      winnerTeamId,
    };
  }, [requiredWins, setWinners, teamA.id, teamB.id]);

  const resolvedInitialWinnerTeamId = initialWinnerTeamId ?? null;
  const selectedWinnerName = score.winnerTeamId === teamA.id ? teamA.name : score.winnerTeamId === teamB.id ? teamB.name : "미정";
  const isComplete = Boolean(score.winnerTeamId);

  const handleSetWinner = (setIndex: number, teamId: number) => {
    setError("");
    setSetWinners((current) => {
      const next = [...current];
      next[setIndex] = next[setIndex] === teamId ? null : teamId;
      return next;
    });
  };

  const handleSubmit = async () => {
    setError("");

    if (!score.winnerTeamId) {
      setError(`${normalizedBestOf}판 ${requiredWins}선승 결과가 되도록 세트 승리 팀을 선택해주세요.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/matches/${matchId}/result`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            winnerTeamId: score.winnerTeamId,
            mvpPlayerId: null,
            teamAScore: score.teamAScore,
            teamBScore: score.teamBScore,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "경기 결과 저장 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("경기 결과 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="destruction-match-result-form"
      style={{
        display: "grid",
        gap: 14,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(160px, 1fr) auto minmax(160px, 1fr)",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            border: score.winnerTeamId === teamA.id ? "1px solid rgba(56, 189, 248, 0.75)" : "1px solid rgba(56, 189, 248, 0.2)",
            borderRadius: 14,
            background: score.winnerTeamId === teamA.id ? "rgba(14, 165, 233, 0.16)" : "rgba(15, 23, 42, 0.44)",
          }}
        >
          <span style={{ display: "block", fontSize: 11, color: "#93a4c5", marginBottom: 6 }}>A팀</span>
          <strong style={{ display: "block", color: "#e5f3ff", fontSize: 16 }}>{teamA.name}</strong>
          <span style={{ display: "block", marginTop: 6, color: "#7dd3fc", fontSize: 22, fontWeight: 800 }}>{score.teamAScore}</span>
        </div>

        <div
          style={{
            alignSelf: "center",
            display: "grid",
            placeItems: "center",
            minWidth: 70,
            padding: "0 4px",
            color: "#93a4c5",
            fontWeight: 800,
          }}
        >
          VS
        </div>

        <div
          style={{
            padding: "12px 14px",
            border: score.winnerTeamId === teamB.id ? "1px solid rgba(56, 189, 248, 0.75)" : "1px solid rgba(56, 189, 248, 0.2)",
            borderRadius: 14,
            background: score.winnerTeamId === teamB.id ? "rgba(14, 165, 233, 0.16)" : "rgba(15, 23, 42, 0.44)",
            textAlign: "right",
          }}
        >
          <span style={{ display: "block", fontSize: 11, color: "#93a4c5", marginBottom: 6 }}>B팀</span>
          <strong style={{ display: "block", color: "#e5f3ff", fontSize: 16 }}>{teamB.name}</strong>
          <span style={{ display: "block", marginTop: 6, color: "#7dd3fc", fontSize: 22, fontWeight: 800 }}>{score.teamBScore}</span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          padding: 12,
          border: "1px solid rgba(56, 189, 248, 0.16)",
          borderRadius: 14,
          background: "rgba(2, 6, 23, 0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <strong style={{ display: "block", color: "#e5f3ff" }}>
              {normalizedBestOf}판 {requiredWins}선승 세트 결과
            </strong>
            <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#93a4c5" }}>
              각 세트에서 이긴 팀을 클릭하면 세트 스코어와 승리팀이 자동 계산됩니다.
            </span>
          </div>
          <span
            style={{
              padding: "7px 10px",
              borderRadius: 999,
              border: isComplete ? "1px solid rgba(34, 211, 238, 0.55)" : "1px solid rgba(148, 163, 184, 0.35)",
              background: isComplete ? "rgba(14, 165, 233, 0.18)" : "rgba(15, 23, 42, 0.5)",
              color: isComplete ? "#7dd3fc" : "#cbd5e1",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            승리팀: {selectedWinnerName}
          </span>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {Array.from({ length: normalizedBestOf }).map((_, index) => {
            const setNo = index + 1;
            const selectedTeamId = setWinners[index];

            return (
              <div
                key={setNo}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px minmax(140px, 1fr) minmax(140px, 1fr)",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <strong style={{ fontSize: 12, color: "#cbd5e1" }}>{setNo}세트</strong>

                <button
                  type="button"
                  className={selectedTeamId === teamA.id ? "chip-button" : "ghost-button"}
                  onClick={() => handleSetWinner(index, teamA.id)}
                  style={{ width: "100%", minHeight: 36 }}
                >
                  {teamA.name} 승
                </button>

                <button
                  type="button"
                  className={selectedTeamId === teamB.id ? "chip-button" : "ghost-button"}
                  onClick={() => handleSetWinner(index, teamB.id)}
                  style={{ width: "100%", minHeight: 36 }}
                >
                  {teamB.name} 승
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "#9fb4d8" }}>
          세트 스코어: {teamA.name} {score.teamAScore} : {score.teamBScore} {teamB.name}
          {resolvedInitialWinnerTeamId && !score.winnerTeamId ? " · 저장된 결과를 수정 중입니다." : ""}
        </div>

        <button
          type="button"
          className="chip-button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{ minWidth: 130 }}
        >
          {isSubmitting ? "저장 중..." : "결과 저장"}
        </button>
      </div>

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}
