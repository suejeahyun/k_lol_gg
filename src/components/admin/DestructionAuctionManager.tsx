"use client";

import { Fragment, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMemberForPosition(team: Team, position: Position) {
  return team.members.find((member) => member.position === position) ?? null;
}

function getTeamPositionStatus(team: Team, position: Position) {
  const member = getMemberForPosition(team, position);

  if (!member) {
    return {
      label: "비어있음",
      filled: false,
    };
  }

  return {
    label: `${member.player.name || member.player.nickname}${member.isCaptain ? " · 팀장" : ""}`,
    subLabel: `${member.player.nickname}#${member.player.tag}${member.purchasePoint ? ` · ${member.purchasePoint}P` : ""}`,
    filled: true,
    isCaptain: member.isCaptain,
  };
}

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
  const [drawnPreview, setDrawnPreview] = useState<Participant | null>(null);
  const [drawPhase, setDrawPhase] = useState<"IDLE" | "SHUFFLING" | "REVEALED">("IDLE");

  const activeDrawn = useMemo(
    () => participants.find((participant) => !participant.isCaptain && participant.auctionStatus === "DRAWN"),
    [participants],
  );

  const selectedParticipant = useMemo(() => {
    const id = Number(selectedParticipantId || activeDrawn?.id || drawnPreview?.id || 0);
    return participants.find((participant) => participant.id === id) ?? drawnPreview ?? null;
  }, [participants, selectedParticipantId, activeDrawn, drawnPreview]);

  const pendingCount = participants.filter(
    (participant) => !participant.isCaptain && participant.auctionStatus === "PENDING",
  ).length;
  const holdCount = participants.filter(
    (participant) => !participant.isCaptain && participant.auctionStatus === "HOLD",
  ).length;
  const drawnCount = participants.filter(
    (participant) => !participant.isCaptain && participant.auctionStatus === "DRAWN",
  ).length;
  const soldCount = participants.filter(
    (participant) => !participant.isCaptain && participant.auctionStatus === "SOLD",
  ).length;
  const totalAuctionTargets = participants.filter((participant) => !participant.isCaptain).length;
  const auctionTargetPoolLabel = pendingCount > 0 ? "일반 미추첨" : holdCount > 0 ? "보류자 재추첨" : "추첨 완료";

  const selectedTeam = teams.find((team) => team.id === Number(selectedTeamId));
  const selectedTeamHasSamePosition = Boolean(
    selectedTeam && selectedParticipant && getMemberForPosition(selectedTeam, selectedParticipant.position),
  );
  const selectedTeamIsFull = Boolean(selectedTeam && selectedTeam.members.length >= 5);

  const handleDraw = async () => {
    setError("");
    setIsDrawing(true);
    setDrawnPreview(null);
    setDrawPhase("SHUFFLING");

    try {
      const startedAt = Date.now();
      const res = await fetch(`/api/destruction-tournaments/${tournamentId}/auction/draw`, {
        method: "POST",
      });
      const data = await res.json();
      const elapsed = Date.now() - startedAt;

      if (elapsed < 1700) {
        await wait(1700 - elapsed);
      }

      if (!res.ok) {
        setError(data.message ?? "추첨 실패");
        setDrawPhase("IDLE");
        return;
      }

      const participant = data.participant as Participant;
      setDrawnPreview(participant);
      setSelectedParticipantId(String(participant.id));
      setSelectedTeamId("");
      setPurchasePoint("1");
      setDrawPhase("REVEALED");
      window.setTimeout(() => router.refresh(), 750);
    } catch {
      setError("추첨 중 오류가 발생했습니다.");
      setDrawPhase("IDLE");
    } finally {
      setIsDrawing(false);
    }
  };

  const handleResolve = async (action: "SOLD" | "HOLD") => {
    setError("");

    const targetParticipantId = Number(selectedParticipantId || activeDrawn?.id || drawnPreview?.id);

    if (!targetParticipantId) {
      setError("처리할 추첨 참가자가 없습니다.");
      return;
    }

    if (action === "SOLD") {
      if (!selectedTeamId) {
        setError("낙찰 팀을 선택해주세요.");
        return;
      }

      if (!Number.isInteger(Number(purchasePoint)) || Number(purchasePoint) < 1) {
        setError("낙찰 포인트는 최소 1포인트 이상이어야 합니다.");
        return;
      }

      if (selectedTeamHasSamePosition) {
        setError(`선택한 팀에는 이미 ${selectedParticipant?.position} 포지션이 있습니다.`);
        return;
      }

      if (selectedTeamIsFull) {
        setError("선택한 팀은 이미 5명입니다.");
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
      setDrawnPreview(null);
      setDrawPhase("IDLE");
      router.refresh();
    } catch {
      setError("경매 결과 처리 중 오류가 발생했습니다.");
    } finally {
      setIsResolving(false);
    }
  };

  const drawableDisabled = hasMatches || isDrawing || Boolean(activeDrawn) || teams.length === 0;
  const currentTarget = activeDrawn ?? selectedParticipant;

  return (
    <div className="destruction-auction-manager destruction-admin-panel-wide">
      <style>{`
        .destruction-admin-panel-wide { width: 100%; }
        .destruction-auction-summary { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; margin-bottom: 18px; }
        .destruction-auction-layout { display: grid; grid-template-columns: minmax(520px, 1.45fr) minmax(340px, 0.95fr); gap: 18px; align-items: stretch; }
        .destruction-auction-right { display: grid; gap: 14px; align-content: start; }
        .destruction-team-matrix { overflow-x: auto; border: 1px solid rgba(59,130,246,0.32); border-radius: 18px; background: rgba(7,16,35,0.72); }
        .destruction-team-matrix-grid { min-width: 720px; display: grid; grid-template-columns: 82px repeat(var(--team-count), minmax(138px, 1fr)); }
        .matrix-cell { min-height: 74px; padding: 12px; border-right: 1px solid rgba(59,130,246,0.20); border-bottom: 1px solid rgba(59,130,246,0.20); display: flex; flex-direction: column; justify-content: center; gap: 3px; }
        .matrix-header { min-height: 58px; background: rgba(15,36,72,0.82); font-weight: 800; color: #eaf4ff; }
        .matrix-position { background: rgba(12,25,50,0.92); color: #60a5fa; font-size: 15px; font-weight: 900; letter-spacing: 0.04em; align-items: center; text-align: center; }
        .matrix-empty { color: rgba(199,213,235,0.52); border: 1px dashed rgba(148,163,184,0.20); border-radius: 12px; padding: 10px; text-align: center; }
        .matrix-filled { border-radius: 12px; border: 1px solid rgba(34,197,94,0.26); background: rgba(34,197,94,0.08); padding: 10px; }
        .matrix-filled.is-captain { border-color: rgba(250,204,21,0.45); background: rgba(250,204,21,0.10); }
        .matrix-player-name { font-weight: 900; color: #f8fbff; }
        .matrix-player-sub { color: #a8bedb; font-size: 12px; word-break: break-all; }
        .auction-deck { min-height: 310px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; border-radius: 22px; border: 1px solid rgba(96,165,250,0.34); background: radial-gradient(circle at 50% 0%, rgba(37,99,235,0.28), rgba(2,8,23,0.42) 55%, rgba(0,0,0,0.22)); }
        .auction-card-back { position: absolute; width: 126px; height: 178px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.24); background: linear-gradient(145deg, rgba(88,101,242,0.98), rgba(37,99,235,0.92) 48%, rgba(15,23,42,0.98)); box-shadow: 0 22px 46px rgba(0,0,0,0.32), inset 0 0 18px rgba(255,255,255,0.08); }
        .auction-card-back:nth-child(1) { transform: translateX(-76px) rotate(-18deg); }
        .auction-card-back:nth-child(2) { transform: translateX(-38px) rotate(-8deg); }
        .auction-card-back:nth-child(3) { transform: translateX(0px) rotate(1deg); }
        .auction-card-back:nth-child(4) { transform: translateX(38px) rotate(9deg); }
        .auction-card-back:nth-child(5) { transform: translateX(76px) rotate(18deg); }
        .auction-deck.is-shuffling .auction-card-back { animation: auctionShuffle 0.34s infinite alternate ease-in-out; }
        .auction-deck.is-shuffling .auction-card-back:nth-child(2n) { animation-delay: 0.08s; }
        .auction-deck.is-shuffling .auction-card-back:nth-child(3n) { animation-delay: 0.14s; }
        .auction-reveal-card { position: relative; z-index: 2; width: min(100%, 350px); min-height: 220px; border-radius: 22px; border: 2px solid rgba(255,214,10,0.95); background: linear-gradient(145deg, rgba(255,255,255,0.13), rgba(255,214,10,0.12)); box-shadow: 0 0 38px rgba(255,214,10,0.46), 0 20px 55px rgba(0,0,0,0.36); padding: 24px; animation: auctionReveal 0.64s cubic-bezier(.2,.8,.2,1); }
        .auction-reveal-card::before { content: ""; position: absolute; inset: -18px; border-radius: 28px; background: radial-gradient(circle, rgba(250,204,21,0.24), transparent 62%); z-index: -1; animation: auctionGlow 1.4s infinite alternate ease-in-out; }
        .auction-reveal-card h3 { margin: 0 0 12px; font-size: 26px; }
        .auction-reveal-card p { margin: 5px 0; color: #d8e7ff; }
        .auction-control-panel { border: 1px solid rgba(59,130,246,0.32); border-radius: 18px; background: rgba(7,16,35,0.72); padding: 18px; }
        .auction-current-box { border-radius: 16px; border: 1px solid rgba(250,204,21,0.35); background: rgba(250,204,21,0.08); padding: 14px; margin-bottom: 14px; }
        @keyframes auctionShuffle { from { margin-top: -12px; filter: brightness(1); } to { margin-top: 12px; filter: brightness(1.28); } }
        @keyframes auctionReveal { from { transform: rotateY(96deg) scale(0.86); opacity: 0; } to { transform: rotateY(0deg) scale(1); opacity: 1; } }
        @keyframes auctionGlow { from { opacity: 0.6; transform: scale(0.98); } to { opacity: 1; transform: scale(1.04); } }
        @media (max-width: 1180px) { .destruction-auction-layout { grid-template-columns: 1fr; } .destruction-auction-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>

      <div className="destruction-auction-summary">
        <div className="admin-event-detail-card">
          <span>미추첨</span>
          <strong>{pendingCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>현재 추첨</span>
          <strong>{drawnCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>보류</span>
          <strong>{holdCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>낙찰</span>
          <strong>{soldCount} / {totalAuctionTargets}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>현재 풀</span>
          <strong>{auctionTargetPoolLabel}</strong>
        </div>
      </div>

      <div className="destruction-auction-layout">
        <section className="destruction-team-matrix">
          <div
            className="destruction-team-matrix-grid"
            style={{ "--team-count": teams.length } as CSSProperties}
          >
            <div className="matrix-cell matrix-header matrix-position">라인</div>
            {teams.map((team) => (
              <div key={team.id} className="matrix-cell matrix-header">
                <strong>{team.name}</strong>
                <span className="matrix-player-sub">
                  {team.captain.name || team.captain.nickname} · 잔여 {team.remainingAuctionPoints}P · {team.members.length}/5
                </span>
              </div>
            ))}

            {POSITIONS.map((position) => (
              <Fragment key={position}>
                <div key={`${position}-label`} className="matrix-cell matrix-position">{position}</div>
                {teams.map((team) => {
                  const status = getTeamPositionStatus(team, position);
                  return (
                    <div key={`${team.id}-${position}`} className="matrix-cell">
                      {status.filled ? (
                        <div className={status.isCaptain ? "matrix-filled is-captain" : "matrix-filled"}>
                          <div className="matrix-player-name">{status.label}</div>
                          <div className="matrix-player-sub">{status.subLabel}</div>
                        </div>
                      ) : (
                        <div className="matrix-empty">대기</div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </section>

        <section className="destruction-auction-right">
          <div className="auction-control-panel">
            <div className="admin-page__header">
              <div>
                <h3 className="admin-event-section-title">랜덤 카드 추첨</h3>
                <p className="admin-page__description">
                  서버에서 대상자를 확정한 뒤, 화면에서는 카드 셔플/뒤집기 효과로 공개합니다.
                </p>
              </div>
            </div>

            <div className={drawPhase === "SHUFFLING" ? "auction-deck is-shuffling" : "auction-deck"}>
              {currentTarget ? (
                <div className="auction-reveal-card">
                  <h3>{currentTarget.player.name || currentTarget.player.nickname}</h3>
                  <p>
                    <strong>{currentTarget.player.nickname}#{currentTarget.player.tag}</strong>
                  </p>
                  <p>포지션: {currentTarget.position}</p>
                  <p>현재 티어: {currentTarget.player.currentTier ?? "-"}</p>
                  <p>최고 티어: {currentTarget.player.peakTier ?? "-"}</p>
                </div>
              ) : (
                <>
                  <div className="auction-card-back" />
                  <div className="auction-card-back" />
                  <div className="auction-card-back" />
                  <div className="auction-card-back" />
                  <div className="auction-card-back" />
                </>
              )}
            </div>

            <button
              type="button"
              className="admin-page__create-button"
              onClick={handleDraw}
              disabled={drawableDisabled}
              style={{ width: "100%", marginTop: 16 }}
            >
              {isDrawing ? "카드 섞는 중..." : activeDrawn ? "현재 카드 처리 대기" : "카드 섞고 추첨"}
            </button>
          </div>

          <div className="auction-control-panel">
            <div className="admin-page__header">
              <div>
                <h3 className="admin-event-section-title">디스코드 경매 결과 입력</h3>
                <p className="admin-page__description">
                  최종 낙찰 팀과 포인트만 입력합니다. 선택한 팀에 같은 포지션이 있으면 저장할 수 없습니다.
                </p>
              </div>
            </div>

            {currentTarget ? (
              <div className="auction-current-box">
                <strong>{currentTarget.player.name || currentTarget.player.nickname}</strong>
                <p className="admin-page__description" style={{ margin: "4px 0 0" }}>
                  {currentTarget.player.nickname}#{currentTarget.player.tag} · {currentTarget.position}
                </p>
              </div>
            ) : null}

            <label className="admin-form__field">
              <span className="admin-form__label">낙찰 팀</span>
              <select
                className="admin-form__input"
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
                disabled={hasMatches || isResolving}
              >
                <option value="">팀 선택</option>
                {teams.map((team) => {
                  const blockedByPosition = currentTarget ? Boolean(getMemberForPosition(team, currentTarget.position)) : false;
                  const blockedByFull = team.members.length >= 5;
                  return (
                    <option key={team.id} value={team.id} disabled={blockedByPosition || blockedByFull}>
                      {team.name} · 남은 {team.remainingAuctionPoints}P{blockedByPosition ? ` · ${currentTarget?.position} 보유` : ""}{blockedByFull ? " · 정원" : ""}
                    </option>
                  );
                })}
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

            <div className="admin-form__actions">
              <button
                type="button"
                className="admin-page__create-button"
                onClick={() => handleResolve("SOLD")}
                disabled={hasMatches || isResolving || !currentTarget}
              >
                {isResolving ? "처리 중..." : "낙찰 저장"}
              </button>
              <button
                type="button"
                className="chip-button"
                onClick={() => handleResolve("HOLD")}
                disabled={hasMatches || isResolving || !currentTarget}
              >
                보류로 넘기기
              </button>
            </div>

            {error ? <p className="notice-form__error">{error}</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
