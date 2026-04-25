"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EventMode = "POSITION" | "ARAM";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type Participant = {
  id: number;
  playerId: number;
  position: Position | null;
  balanceScore: number;
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
  };
};

type BalancedTeamMember = {
  playerId: number;
  name?: string;
  nickname?: string;
  tag?: string;
  position?: Position | null;
  balanceScore?: number;
};

type BalancedTeam = {
  name: string;
  seed: number;
  score: number;
  memberPlayerIds: number[];
  members: BalancedTeamMember[];
};

type Props = {
  eventId: number;
  mode: EventMode;
  participants: Participant[];
  hasTeams: boolean;
};

export default function EventTeamGenerator({
  eventId,
  mode,
  participants,
  hasTeams,
}: Props) {
  const router = useRouter();

  const [teams, setTeams] = useState<BalancedTeam[]>([]);
  const [error, setError] = useState("");
  const [isBalancing, setIsBalancing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerateTeams = async () => {
    setError("");

    if (participants.length < 10) {
      setError("참가자는 최소 10명 이상이어야 합니다.");
      return;
    }

    if (participants.length % 5 !== 0) {
      setError("참가자는 5명 단위여야 합니다.");
      return;
    }

    setIsBalancing(true);

    try {
      const res = await fetch("/api/event-matches/balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          participants: participants.map((participant) => ({
            playerId: participant.playerId,
            name: participant.player.name,
            nickname: participant.player.nickname,
            tag: participant.player.tag,
            position: participant.position,
            balanceScore: participant.balanceScore,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "팀 자동 생성 실패");
        return;
      }

      setTeams(data.teams);
    } catch {
      setError("팀 자동 생성 중 오류가 발생했습니다.");
    } finally {
      setIsBalancing(false);
    }
  };

  const handleSaveTeams = async () => {
    setError("");

    if (teams.length < 2) {
      setError("저장할 팀이 없습니다.");
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch(`/api/event-matches/${eventId}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teams: teams.map((team) => ({
            name: team.name,
            seed: team.seed,
            memberPlayerIds: team.memberPlayerIds,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "팀 저장 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("팀 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="event-team-generator">
      <div className="event-team-generator__actions">
        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleGenerateTeams}
          disabled={isBalancing || hasTeams}
        >
          {isBalancing ? "생성 중..." : "팀 자동 생성"}
        </button>

        <button
          type="button"
          className="chip-button"
          onClick={handleSaveTeams}
          disabled={isSaving || teams.length === 0 || hasTeams}
        >
          {isSaving ? "저장 중..." : "팀 저장"}
        </button>
      </div>

      {hasTeams ? (
        <div className="empty-box">이미 팀이 생성된 이벤트입니다.</div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}

      {teams.length > 0 ? (
        <div className="event-team-generator__grid">
          {teams.map((team) => (
            <div key={team.seed} className="event-team-generator__team">
              <div className="event-team-generator__team-head">
                <h3>{team.name}</h3>
                <span>점수 {team.score}</span>
              </div>

              <div className="event-team-generator__members">
                {team.members.map((member) => (
                  <div
                    key={member.playerId}
                    className="event-team-generator__member"
                  >
                    <strong>
                      {member.nickname}#{member.tag}
                    </strong>
                    <span>{member.position ?? "포지션 없음"}</span>
                    <em>{member.balanceScore ?? 0}</em>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}