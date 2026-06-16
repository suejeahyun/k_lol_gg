"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type AuctionStatus = "PENDING" | "DRAWN" | "SOLD" | "HOLD" | "ASSIGNED";

type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier?: string | null;
  peakTier?: string | null;
};

type Participant = {
  id: number;
  playerId: number;
  teamId: number | null;
  position: Position;
  isCaptain: boolean;
  auctionStatus: AuctionStatus;
  purchasePoint: number | null;
  drawOrder: number | null;
  player: Player;
  team?: { id: number; name: string } | null;
};

type Team = {
  id: number;
  name: string;
  captainId: number;
  points: number;
  wins: number;
  losses: number;
  initialAuctionPoints: number;
  remainingAuctionPoints: number;
  captain: Player;
  members: Participant[];
};

type Props = {
  tournamentId: number;
  teams: Team[];
  participants: Participant[];
  hasMatches: boolean;
};

const STATUS_LABELS: Record<AuctionStatus, string> = {
  PENDING: "대기",
  DRAWN: "추첨됨",
  SOLD: "낙찰",
  HOLD: "보류",
  ASSIGNED: "강제 배정",
};

export default function DestructionAuctionManager({
  tournamentId,
  teams,
  participants,
  hasMatches,
}: Props) {
  const router = useRouter();
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [purchasePoint, setPurchasePoint] = useState("1");
  const [error, setError] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [glowParticipantId, setGlowParticipantId] = useState<number | null>(null);

  const activeDrawn = useMemo(
    () => participants.find((participant) => !participant.isCaptain && participant.auctionStatus === "DRAWN"),
    [participants],
  );
  const selectedParticipant = useMemo(() => {
    const id = Number(selectedParticipantId || activeDrawn?.id || 0);
    return participants.find((participant) => participant.id === id) ?? null;
  }, [participants, selectedParticipantId, activeDrawn]);
  const pendingCount = participants.filter(
    (participant) => !participant.isCaptain && participant.auctionStatus === "PENDING",
  ).length;
  const holdCount = participants.filter(
    (participant) => !participant.isCaptain && participant.auctionStatus === "HOLD",
  ).length;
  const soldCount = participants.filter(
    (participant) => !participant.isCaptain && participant.auctionStatus === "SOLD",
  ).length;

  const handleDraw = async () => {
    setError("");
    setIsDrawing(true);
    setGlowParticipantId(null);

    try {
      const res = await fetch(`/api/destruction-tournaments/${tournamentId}/auction/draw`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "추첨 실패");
        return;
      }

      const participant = data.participant as Participant;
      setSelectedParticipantId(String(participant.id));
      setGlowParticipantId(participant.id);
      setSelectedTeamId("");
      setPurchasePoint("1");
      router.refresh();
    } catch {
      setError("추첨 중 오류가 발생했습니다.");
    } finally {
      setIsDrawing(false);
    }
  };

  const handleResolve = async (action: "SOLD" | "HOLD") => {
    setError("");

    const targetParticipantId = Number(selectedParticipantId || activeDrawn?.id);

    if (!targetParticipantId) {
      setError("처리할 추첨 참가자가 없습니다.");
      return;
    }

    if (action === "SOLD") {
      if (!selectedTeamId) {
        setError("낙찰 팀장을 선택해주세요.");
        return;
      }

      if (!Number.isInteger(Number(purchasePoint)) || Number(purchasePoint) < 1) {
        setError("낙찰 포인트는 최소 1포인트 이상이어야 합니다.");
        return;
      }
    }

    setIsResolving(true);

    try {
      const res = await fetch(`/api/destruction-tournaments/${tournamentId}/auction/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: targetParticipantId,
          action,
          teamId: selectedTeamId ? Number(selectedTeamId) : undefined,
          purchasePoint: purchasePoint ? Number(purchasePoint) : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "경매 결과 처리 실패");
        return;
      }

      setSelectedParticipantId("");
      setSelectedTeamId("");
      setPurchasePoint("1");
      setGlowParticipantId(null);
      router.refresh();
    } catch {
      setError("경매 결과 처리 중 오류가 발생했습니다.");
    } finally {
      setIsResolving(false);
    }
  };

  const drawableDisabled = hasMatches || isDrawing || Boolean(activeDrawn);

  return (
    <div className="destruction-auction-manager">
      <div className="admin-event-detail-grid">
        <div className="admin-event-detail-card">
          <span>미추첨</span>
          <strong>{pendingCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>보류</span>
          <strong>{holdCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>낙찰</span>
          <strong>{soldCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>규칙</span>
          <strong>중복 포지션 불가</strong>
        </div>
      </div>

      <div className="admin-event-team-list">
        {teams.map((team) => (
          <div key={team.id} className="admin-event-team-card">
            <h3>{team.name}</h3>
            <div>
              <span>팀장: {team.captain.nickname}#{team.captain.tag}</span>
              <span>시작 {team.initialAuctionPoints}P</span>
              <span>남은 {team.remainingAuctionPoints}P</span>
              <span>{team.members.length}/5명</span>
            </div>
            <div>
              {team.members.map((member) => (
                <span key={member.id}>
                  {member.position} · {member.player.nickname}#{member.player.tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="admin-form" style={{ marginTop: 16 }}>
        <div className="admin-page__header">
          <div>
            <h3 className="admin-event-section-title">랜덤 카드 추첨</h3>
            <p className="admin-page__description">
              버튼을 누르면 서버에서 대상자가 확정됩니다. 화면에서는 카드가 뒤집힌 것처럼 강조 표시하고,
              디스코드 채팅 경매 후 관리자가 최종 낙찰 정보를 입력합니다.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleDraw}
          disabled={drawableDisabled}
        >
          {isDrawing ? "카드 섞는 중..." : activeDrawn ? "처리 대기 중" : "카드 섞고 추첨"}
        </button>

        {activeDrawn || selectedParticipant ? (
          <div
            className="admin-event-team-card"
            style={{
              marginTop: 16,
              border: glowParticipantId || activeDrawn ? "2px solid rgba(255, 214, 10, 0.85)" : undefined,
              boxShadow: glowParticipantId || activeDrawn ? "0 0 18px rgba(255, 214, 10, 0.35)" : undefined,
            }}
          >
            <h3>이번 경매 대상</h3>
            <div>
              <span>{(activeDrawn ?? selectedParticipant)?.player.name}</span>
              <span>{(activeDrawn ?? selectedParticipant)?.player.nickname}#{(activeDrawn ?? selectedParticipant)?.player.tag}</span>
              <span>포지션 {(activeDrawn ?? selectedParticipant)?.position}</span>
              <span>현재 {(activeDrawn ?? selectedParticipant)?.player.currentTier ?? "-"}</span>
              <span>최고 {(activeDrawn ?? selectedParticipant)?.player.peakTier ?? "-"}</span>
            </div>
          </div>
        ) : null}

        <div className="admin-event-form-grid" style={{ marginTop: 16 }}>
          <label className="admin-form__field">
            <span className="admin-form__label">낙찰 팀장</span>
            <select
              className="admin-form__input"
              value={selectedTeamId}
              onChange={(event) => setSelectedTeamId(event.target.value)}
              disabled={hasMatches || isResolving}
            >
              <option value="">팀장 선택</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} · {team.captain.nickname} · 남은 {team.remainingAuctionPoints}P
                </option>
              ))}
            </select>
          </label>

          <label className="admin-form__field">
            <span className="admin-form__label">최종 낙찰 포인트</span>
            <input
              className="admin-form__input"
              type="number"
              min="1"
              value={purchasePoint}
              onChange={(event) => setPurchasePoint(event.target.value)}
              disabled={hasMatches || isResolving}
            />
          </label>
        </div>

        <div className="admin-form__actions">
          <button
            type="button"
            className="admin-page__create-button"
            onClick={() => handleResolve("SOLD")}
            disabled={hasMatches || isResolving || !(activeDrawn || selectedParticipant)}
          >
            {isResolving ? "처리 중..." : "낙찰 저장"}
          </button>
          <button
            type="button"
            className="chip-button"
            onClick={() => handleResolve("HOLD")}
            disabled={hasMatches || isResolving || !(activeDrawn || selectedParticipant)}
          >
            보류로 넘기기
          </button>
        </div>

        {error ? <p className="notice-form__error">{error}</p> : null}
      </div>

      <div className="admin-event-participant-list" style={{ marginTop: 16 }}>
        {participants
          .filter((participant) => !participant.isCaptain)
          .sort((a, b) => (a.drawOrder ?? 9999) - (b.drawOrder ?? 9999) || a.id - b.id)
          .map((participant) => (
            <div key={participant.id} className="admin-event-participant-row">
              <span>{participant.drawOrder ? `${participant.drawOrder}차` : "-"}</span>
              <span>{participant.player.nickname}#{participant.player.tag}</span>
              <span>{participant.position}</span>
              <span>{STATUS_LABELS[participant.auctionStatus]}</span>
              <span>{participant.team?.name ?? "미배정"}</span>
              <span>{participant.purchasePoint ? `${participant.purchasePoint}P` : "-"}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
