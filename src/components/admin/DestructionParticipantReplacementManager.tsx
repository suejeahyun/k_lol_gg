"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PlayerSearchInput from "@/components/admin/PlayerSearchInput";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type PlayerOption = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
};

type Participant = {
  id: number;
  playerId: number;
  teamId: number | null;
  position: Position;
  isCaptain: boolean;
  player: {
    nickname: string;
    tag: string;
  };
  team: {
    name: string;
  } | null;
};

type Replacement = {
  id: number;
  teamName: string;
  outgoingPlayerName: string;
  incomingPlayerName: string;
  outgoingPosition: Position;
  incomingPosition: Position;
  reason: string;
  effectiveAt: string;
};

type Props = {
  tournamentId: number;
  participants: Participant[];
  replacements: Replacement[];
  disabled?: boolean;
  unavailableReason?: string;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

export default function DestructionParticipantReplacementManager({
  tournamentId,
  participants,
  replacements,
  disabled = false,
  unavailableReason,
}: Props) {
  const router = useRouter();
  const eligibleParticipants = useMemo(
    () => participants.filter((participant) => participant.teamId !== null),
    [participants],
  );
  const [participantId, setParticipantId] = useState("");
  const [incomingPlayer, setIncomingPlayer] = useState<PlayerOption | null>(null);
  const [incomingPlayerLabel, setIncomingPlayerLabel] = useState("");
  const [incomingPosition, setIncomingPosition] = useState<Position | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedParticipant = eligibleParticipants.find(
    (participant) => participant.id === Number(participantId),
  );

  const handleParticipantChange = (value: string) => {
    setParticipantId(value);
    const participant = eligibleParticipants.find((item) => item.id === Number(value));
    setIncomingPosition(participant?.position ?? "");
    setError("");
    setSuccess("");
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!selectedParticipant) {
      setError("교체할 기존 참가자를 선택해주세요.");
      return;
    }

    if (!incomingPlayer) {
      setError("교체 투입할 플레이어를 검색 결과에서 선택해주세요.");
      return;
    }

    if (!incomingPosition) {
      setError("교체 선수의 포지션을 선택해주세요.");
      return;
    }

    if (reason.trim().length < 2) {
      setError("교체 사유를 2자 이상 입력해주세요.");
      return;
    }

    const confirmed = window.confirm(
      `${selectedParticipant.player.nickname}#${selectedParticipant.player.tag} 선수를 ${incomingPlayer.nickname}#${incomingPlayer.tag} 선수로 교체하시겠습니까?\n\n팀, 경매 포인트, 기존 경기 결과는 유지됩니다.`,
    );
    if (!confirmed) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/destruction-tournaments/${tournamentId}/participants/${selectedParticipant.id}/replace`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incomingPlayerId: incomingPlayer.id,
            incomingPosition,
            reason: reason.trim(),
          }),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "참가자 교체에 실패했습니다.");
        return;
      }

      setSuccess(result.message ?? "참가자를 교체했습니다.");
      setParticipantId("");
      setIncomingPlayer(null);
      setIncomingPlayerLabel("");
      setIncomingPosition("");
      setReason("");
      router.refresh();
    } catch {
      setError("참가자 교체 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="admin-form" style={{ marginBottom: 18 }}>
      <div className="admin-page__header">
        <div>
          <h3 className="admin-event-section-title">참가자 긴급 교체</h3>
          <p className="admin-page__description">
            기존 참가자의 팀·경매 정보와 경기 결과는 유지하고 선수와 포지션만 교체합니다. 모든 변경은 교체 이력에 남습니다.
          </p>
        </div>
      </div>

      {disabled ? (
        <div className="empty-box">
          {unavailableReason ?? "종료되거나 취소된 멸망전은 참가자를 교체할 수 없습니다."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <label className="admin-form__field">
            <span>기존 참가자</span>
            <select
              className="admin-form__input"
              value={participantId}
              onChange={(event) => handleParticipantChange(event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">교체할 선수 선택</option>
              {eligibleParticipants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.team?.name ?? "팀 미정"} · {participant.player.nickname}#{participant.player.tag} · {participant.position}
                  {participant.isCaptain ? " · 팀장" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-form__field">
            <span>신규 선수</span>
            <PlayerSearchInput
              value={incomingPlayerLabel}
              onChange={(player, label) => {
                setIncomingPlayer(player);
                setIncomingPlayerLabel(label);
              }}
              excludePlayerIds={participants.map((participant) => participant.playerId)}
              disabled={isSubmitting}
              placeholder="이름 / 닉네임 / 태그 검색"
            />
          </label>

          <label className="admin-form__field">
            <span>신규 포지션</span>
            <select
              className="admin-form__input"
              value={incomingPosition}
              onChange={(event) => setIncomingPosition(event.target.value as Position)}
              disabled={isSubmitting}
            >
              <option value="">포지션 선택</option>
              {POSITIONS.map((position) => (
                <option key={position} value={position}>{position}</option>
              ))}
            </select>
          </label>

          <label className="admin-form__field" style={{ gridColumn: "1 / -1" }}>
            <span>교체 사유</span>
            <textarea
              className="admin-form__input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              disabled={isSubmitting}
              placeholder="예: 개인 사정으로 예선 3경기부터 대체 선수 투입"
            />
          </label>
        </div>
      )}

      {error ? <p className="notice-form__error">{error}</p> : null}
      {success ? <p className="notice-form__success">{success}</p> : null}

      {!disabled ? (
        <div className="admin-form__actions">
          <button
            type="button"
            className="admin-page__create-button"
            onClick={handleSubmit}
            disabled={isSubmitting || eligibleParticipants.length === 0}
          >
            {isSubmitting ? "교체 처리 중..." : "참가자 교체"}
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <h4 style={{ marginBottom: 10 }}>교체 이력</h4>
        {replacements.length === 0 ? (
          <div className="empty-box">아직 교체 이력이 없습니다.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {replacements.map((replacement) => (
              <div key={replacement.id} className="empty-box" style={{ textAlign: "left" }}>
                <strong>{replacement.teamName}</strong>{" · "}
                {replacement.outgoingPlayerName} ({replacement.outgoingPosition}) → {replacement.incomingPlayerName} ({replacement.incomingPosition})
                <br />
                <span>{new Date(replacement.effectiveAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {replacement.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
