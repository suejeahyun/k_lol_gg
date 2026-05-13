"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DragMode = "event" | "destruction";

type TeamInput = {
  id: number;
  name: string;
  score?: number | null;
  points?: number | null;
  wins?: number | null;
  losses?: number | null;
  captainId?: number | null;
};

type ParticipantInput = {
  id: number;
  playerId: number;
  teamId: number | null;
  position?: string | null;
  balanceScore?: number | null;
  player: {
    name?: string | null;
    nickname: string;
    tag: string;
    currentTier?: string | null;
    peakTier?: string | null;
  };
};

type Props = {
  mode: DragMode;
  targetId: number;
  teams: TeamInput[];
  participants: ParticipantInput[];
  disabled?: boolean;
  lockReason?: string;
  lockCaptains?: boolean;
};

const UNASSIGNED_KEY = "unassigned";
const POSITION_ORDER = ["TOP", "JGL", "MID", "ADC", "SUP"];

function getPositionOrder(position?: string | null) {
  const index = POSITION_ORDER.indexOf(position ?? "");
  return index === -1 ? 999 : index;
}

function toPoint(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function makeInitialTeamMap(
  teams: TeamInput[],
  participants: ParticipantInput[],
) {
  const map: Record<string, number[]> = {
    [UNASSIGNED_KEY]: [],
  };

  teams.forEach((team) => {
    map[String(team.id)] = [];
  });

  participants.forEach((participant) => {
    const key = participant.teamId ? String(participant.teamId) : UNASSIGNED_KEY;

    if (!map[key]) {
      map[UNASSIGNED_KEY].push(participant.id);
      return;
    }

    map[key].push(participant.id);
  });

  Object.keys(map).forEach((key) => {
    map[key].sort((a, b) => {
      const left = participants.find((participant) => participant.id === a);
      const right = participants.find((participant) => participant.id === b);

      const positionDiff =
        getPositionOrder(left?.position) - getPositionOrder(right?.position);

      if (positionDiff !== 0) return positionDiff;
      return a - b;
    });
  });

  return map;
}

export default function AdminTeamDragManager({
  mode,
  targetId,
  teams,
  participants,
  disabled = false,
  lockReason,
  lockCaptains = false,
}: Props) {
  const router = useRouter();

  const participantMap = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );

  const captainPlayerIds = useMemo(
    () => new Set(teams.map((team) => team.captainId).filter(Boolean)),
    [teams],
  );

  const [teamMap, setTeamMap] = useState<Record<string, number[]>>(() =>
    makeInitialTeamMap(teams, participants),
  );

  const [points, setPoints] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};

    participants.forEach((participant) => {
      initial[participant.id] = String(participant.balanceScore ?? 0);
    });

    return initial;
  });

  const [draggingParticipantId, setDraggingParticipantId] = useState<number | null>(
    null,
  );
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [swapTargetId, setSwapTargetId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isLockedParticipant = (participant: ParticipantInput) =>
    lockCaptains && captainPlayerIds.has(participant.playerId);

  const getParticipantTeamKey = (participantId: number) => {
    const entry = Object.entries(teamMap).find(([, ids]) =>
      ids.includes(participantId),
    );

    return entry?.[0] ?? UNASSIGNED_KEY;
  };

  const moveParticipant = (participantId: number, targetKey: string) => {
    const participant = participantMap.get(participantId);

    if (!participant || disabled || isLockedParticipant(participant)) return;

    setTeamMap((prev) => {
      const next: Record<string, number[]> = {};

      Object.entries(prev).forEach(([key, ids]) => {
        next[key] = ids.filter((id) => id !== participantId);
      });

      if (!next[targetKey]) {
        next[targetKey] = [];
      }

      next[targetKey] = [...next[targetKey], participantId];

      return next;
    });
  };

  const swapParticipants = (sourceParticipantId: number, targetParticipantId: number) => {
    if (sourceParticipantId === targetParticipantId || disabled) return;

    const sourceParticipant = participantMap.get(sourceParticipantId);
    const targetParticipant = participantMap.get(targetParticipantId);

    if (!sourceParticipant || !targetParticipant) return;
    if (isLockedParticipant(sourceParticipant) || isLockedParticipant(targetParticipant)) return;

    setTeamMap((prev) => {
      const next: Record<string, number[]> = {};
      let sourceKey: string | null = null;
      let targetKey: string | null = null;
      let sourceIndex = -1;
      let targetIndex = -1;

      Object.entries(prev).forEach(([key, ids]) => {
        next[key] = [...ids];

        const foundSourceIndex = ids.indexOf(sourceParticipantId);
        const foundTargetIndex = ids.indexOf(targetParticipantId);

        if (foundSourceIndex !== -1) {
          sourceKey = key;
          sourceIndex = foundSourceIndex;
        }

        if (foundTargetIndex !== -1) {
          targetKey = key;
          targetIndex = foundTargetIndex;
        }
      });

      if (!sourceKey || !targetKey || sourceIndex < 0 || targetIndex < 0) {
        return prev;
      }

      next[sourceKey][sourceIndex] = targetParticipantId;
      next[targetKey][targetIndex] = sourceParticipantId;

      return next;
    });
  };

  const handleSave = async () => {
    setError("");

    if (disabled) {
      setError("이미 경기가 생성되어 팀 구성을 수정할 수 없습니다.");
      return;
    }

    if (teamMap[UNASSIGNED_KEY]?.length > 0) {
      setError("미배정 참가자가 있습니다. 모든 참가자를 팀에 배정해주세요.");
      return;
    }

    const hasInvalidPoint = participants.some((participant) =>
      Number.isNaN(Number(points[participant.id] ?? 0)),
    );

    if (hasInvalidPoint) {
      setError("점수는 숫자로 입력해주세요.");
      return;
    }

    const assignments = participants.map((participant) => {
      const teamKey = getParticipantTeamKey(participant.id);

      return {
        participantId: participant.id,
        teamId: Number(teamKey),
        auctionPoint: toPoint(points[participant.id]),
        balanceScore: toPoint(points[participant.id]),
      };
    });

    const hasInvalidTeam = assignments.some(
      (assignment) => !Number.isFinite(assignment.teamId) || assignment.teamId <= 0,
    );

    if (hasInvalidTeam) {
      setError("팀 배정 데이터가 올바르지 않습니다.");
      return;
    }

    if (mode === "event") {
      const invalidTeam = teams.find((team) => (teamMap[String(team.id)] ?? []).length !== 5);

      if (invalidTeam) {
        setError("이벤트 내전은 각 팀이 정확히 5명이어야 합니다. 팀원 위에 드롭하면 서로 교환됩니다.");
        return;
      }
    }

    setIsSaving(true);

    try {
      const url =
        mode === "event"
          ? `/api/event-matches/${targetId}/teams`
          : `/api/destruction-tournaments/${targetId}/assign-teams`;

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assignments }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "팀 구성 저장에 실패했습니다.");
        return;
      }

      router.refresh();
    } catch {
      setError("팀 구성 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderParticipant = (participantId: number) => {
    const participant = participantMap.get(participantId);

    if (!participant) return null;

    const locked = isLockedParticipant(participant);

    const isSwapTarget = swapTargetId === participant.id && draggingParticipantId !== null;

    return (
      <div
        key={participant.id}
        className={`admin-team-dnd__member${locked ? " admin-team-dnd__member--locked" : ""}${isSwapTarget ? " admin-team-dnd__member--swap-target" : ""}`}
        draggable={!disabled && !locked}
        title={locked ? "팀장은 이동할 수 없습니다." : "다른 팀원의 카드 위에 놓으면 두 참가자가 서로 교환됩니다."}
        onDragStart={(event) => {
          if (disabled || locked) return;

          setDraggingParticipantId(participant.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(participant.id));
        }}
        onDragOver={(event) => {
          if (disabled || locked || draggingParticipantId === null) return;

          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setSwapTargetId(participant.id);
        }}
        onDragLeave={() => {
          if (swapTargetId === participant.id) {
            setSwapTargetId(null);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();

          const fromDataTransfer = Number(event.dataTransfer.getData("text/plain"));
          const sourceParticipantId = Number.isFinite(fromDataTransfer)
            ? fromDataTransfer
            : draggingParticipantId;

          if (sourceParticipantId) {
            swapParticipants(sourceParticipantId, participant.id);
          }

          setDraggingParticipantId(null);
          setHoverKey(null);
          setSwapTargetId(null);
        }}
        onDragEnd={() => {
          setDraggingParticipantId(null);
          setHoverKey(null);
          setSwapTargetId(null);
        }}
      >
        <div className="admin-team-dnd__member-top">
          <span className="admin-team-dnd__position">
            {participant.position ?? "-"}
          </span>
          {locked ? <span className="admin-team-dnd__lock">팀장 고정</span> : null}
        </div>

        <div className="admin-team-dnd__identity">
          <strong>{participant.player.name ?? participant.player.nickname}</strong>
          <span>
            {participant.player.nickname}#{participant.player.tag}
          </span>
        </div>

        <div className="admin-team-dnd__meta">
          <span>현재 {participant.player.currentTier ?? "-"}</span>
          <span>최고 {participant.player.peakTier ?? "-"}</span>
        </div>

        <label className="admin-team-dnd__score-field">
          <span>{mode === "destruction" ? "경매점수" : "밸런스점수"}</span>
          <input
            value={points[participant.id] ?? "0"}
            onChange={(event) =>
              setPoints((prev) => ({
                ...prev,
                [participant.id]: event.target.value,
              }))
            }
            inputMode="decimal"
            disabled={disabled}
          />
        </label>
      </div>
    );
  };

  const renderColumn = (key: string, title: string, subtitle?: string) => {
    const ids = teamMap[key] ?? [];
    const totalScore = ids.reduce((sum, id) => sum + toPoint(points[id]), 0);
    const isHovering = hoverKey === key && draggingParticipantId !== null;

    return (
      <div
        key={key}
        className={`admin-team-dnd__column${isHovering ? " admin-team-dnd__column--hover" : ""}`}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setHoverKey(key);
        }}
        onDragLeave={() => setHoverKey(null)}
        onDrop={(event) => {
          event.preventDefault();

          const fromDataTransfer = Number(event.dataTransfer.getData("text/plain"));
          const targetParticipantId = Number.isFinite(fromDataTransfer)
            ? fromDataTransfer
            : draggingParticipantId;

          if (targetParticipantId) {
            moveParticipant(targetParticipantId, key);
          }

          setDraggingParticipantId(null);
          setHoverKey(null);
        }}
      >
        <div className="admin-team-dnd__column-head">
          <div>
            <h4>{title}</h4>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="admin-team-dnd__column-stats">
            <span>{ids.length}명</span>
            {key !== UNASSIGNED_KEY ? <strong>{totalScore.toFixed(1)}</strong> : null}
          </div>
        </div>

        <div className="admin-team-dnd__dropzone">
          {ids.length === 0 ? (
            <div className="admin-team-dnd__empty">여기로 드래그</div>
          ) : (
            ids.map(renderParticipant)
          )}
        </div>
      </div>
    );
  };

  if (teams.length === 0) {
    return <div className="empty-box">먼저 팀을 생성해주세요.</div>;
  }

  if (participants.length === 0) {
    return <div className="empty-box">먼저 참가자를 등록해주세요.</div>;
  }

  return (
    <div className="admin-team-dnd">
      <div className="admin-team-dnd__head">
        <div>
          <h3>드래그 팀 구성</h3>
          <p>
            빈 영역에 놓으면 이동, 다른 팀원의 카드 위에 놓으면 서로 교환됩니다.
            저장 전까지 DB에는 반영되지 않습니다.
          </p>
        </div>
        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleSave}
          disabled={disabled || isSaving}
        >
          {isSaving ? "저장 중..." : "드래그 팀 구성 저장"}
        </button>
      </div>

      {disabled ? (
        <div className="empty-box">
          {lockReason ?? "팀 구성을 수정할 수 없습니다."}
        </div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}

      <div className="admin-team-dnd__grid">
        {renderColumn(UNASSIGNED_KEY, "미배정", "아직 팀이 없는 참가자")}
        {teams.map((team, index) =>
          renderColumn(
            String(team.id),
            `${index + 1}. ${team.name}`,
            mode === "destruction"
              ? `${team.points ?? 0}점 · ${team.wins ?? 0}승 ${team.losses ?? 0}패`
              : `기존 점수 ${team.score ?? 0}`,
          ),
        )}
      </div>
    </div>
  );
}
