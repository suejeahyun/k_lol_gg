"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  tournamentId: number;
  teams: Array<{
    id: number;
    name: string;
    preliminaryGroup: string | null;
    points: number;
    wins: number;
    losses: number;
  }>;
  preliminaryMatchCount: number;
  unfinishedPreliminaryCount: number;
  tournamentMatchCount: number;
};

export default function DestructionTournamentGenerator({
  tournamentId,
  teams,
  preliminaryMatchCount,
  unfinishedPreliminaryCount,
  tournamentMatchCount,
}: Props) {
  const router = useRouter();

  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState(["", "", "", ""]);

  const updateSelectedTeam = (index: number, value: string) => {
    setSelectedTeamIds((current) =>
      current.map((teamId, teamIndex) => (teamIndex === index ? value : teamId))
    );
  };

  const handleGenerate = async () => {
    setError("");

    if (teams.length < 4) {
      setError("토너먼트 생성을 위해 최소 4팀이 필요합니다.");
      return;
    }

    if (preliminaryMatchCount === 0) {
      setError("예선 경기를 먼저 생성해주세요.");
      return;
    }

    if (unfinishedPreliminaryCount > 0) {
      setError("예선 편성 확정과 모든 예선 경기 결과 등록을 먼저 완료해주세요.");
      return;
    }

    if (tournamentMatchCount > 0) {
      setError("이미 생성된 토너먼트 경기가 있습니다.");
      return;
    }

    const parsedTeamIds = selectedTeamIds.map(Number);
    if (
      selectedTeamIds.some((teamId) => !teamId) ||
      parsedTeamIds.some((teamId) => !Number.isInteger(teamId))
    ) {
      setError("본선 진출 팀과 4강 대진을 모두 선택해주세요.");
      return;
    }

    if (new Set(parsedTeamIds).size !== 4) {
      setError("본선 진출 4팀은 서로 다른 팀이어야 합니다.");
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/tournament`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            semiFinals: [
              { teamAId: parsedTeamIds[0], teamBId: parsedTeamIds[1] },
              { teamAId: parsedTeamIds[2], teamBId: parsedTeamIds[3] },
            ],
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "토너먼트 생성 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("토너먼트 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="destruction-tournament-generator" style={{ display: "grid", gap: 16 }}>
      {tournamentMatchCount === 0 ? (
        <>
          <div className="empty-box">
            예선 순위가 동점인 경우를 포함해 본선 진출 4팀과 맞대결 상대를 운영자가 직접 지정합니다.
            같은 팀은 두 번 선택할 수 없습니다.
          </div>

          {[0, 1].map((matchIndex) => (
            <fieldset
              key={matchIndex}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
                padding: 16,
                border: "1px solid rgba(56, 189, 248, 0.22)",
                borderRadius: 14,
              }}
            >
              <legend style={{ padding: "0 8px", fontWeight: 800, color: "#bae6fd" }}>
                4강 {matchIndex + 1}경기
              </legend>

              {[0, 1].map((sideIndex) => {
                const selectionIndex = matchIndex * 2 + sideIndex;
                return (
                  <label key={sideIndex} className="admin-form__field">
                    <span>{sideIndex === 0 ? "팀 A" : "팀 B"}</span>
                    <select
                      value={selectedTeamIds[selectionIndex]}
                      onChange={(event) =>
                        updateSelectedTeam(selectionIndex, event.target.value)
                      }
                      disabled={isGenerating}
                    >
                      <option value="">팀 선택</option>
                      {teams.map((team) => {
                        const isSelectedElsewhere = selectedTeamIds.some(
                          (selectedId, index) =>
                            index !== selectionIndex && selectedId === String(team.id)
                        );
                        return (
                          <option
                            key={team.id}
                            value={team.id}
                            disabled={isSelectedElsewhere}
                          >
                            {team.preliminaryGroup ? `${team.preliminaryGroup}조 · ` : ""}
                            {team.name} ({team.points}점, {team.wins}승 {team.losses}패)
                          </option>
                        );
                      })}
                    </select>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </>
      ) : null}

      <button
        type="button"
        className="admin-page__create-button"
        onClick={handleGenerate}
        disabled={
          isGenerating ||
          teams.length < 4 ||
          preliminaryMatchCount === 0 ||
          unfinishedPreliminaryCount > 0 ||
          tournamentMatchCount > 0 ||
          selectedTeamIds.some((teamId) => !teamId) ||
          new Set(selectedTeamIds).size !== 4
        }
      >
        {isGenerating ? "토너먼트 생성 중..." : "본선 4강 생성"}
      </button>

      {tournamentMatchCount > 0 ? (
        <div className="empty-box">이미 생성된 토너먼트 경기가 있습니다.</div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}
