"use client";

import { useEffect, useState } from "react";

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

const ACTIVE_APPLY_STATUSES = ["APPLIED", "CONFIRMED", "RESERVE"] as const;

type ApplyPosition = (typeof POSITIONS)[number];
type CaptainPreference = "PREFERRED" | "NOT_PREFERRED";
type ApplyStatus = "APPLIED" | "CONFIRMED" | "REJECTED" | "RESERVE" | "CANCELLED";

type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  mainPosition: ApplyPosition | null;
  isCaptain: boolean;
  status?: ApplyStatus | string;
};

type CurrentApply = {
  id: number;
  status: ApplyStatus | string;
  mainPosition: ApplyPosition | null;
  isCaptain: boolean;
} | null;

type Tournament = {
  id: number;
  title: string;
  status: string;
} | null;

type DestructionParticipationClientProps = {
  tournamentId: string;
};

const POSITION_LABELS: Record<ApplyPosition, string> = {
  TOP: "TOP",
  JGL: "JGL",
  MID: "MID",
  ADC: "ADC",
  SUP: "SUP",
};

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "신청",
  CONFIRMED: "확정",
  RESERVE: "보류",
  CANCELLED: "취소",
  REJECTED: "제외",
};

function isActiveApplyStatus(status: string | undefined) {
  return Boolean(status && (ACTIVE_APPLY_STATUSES as readonly string[]).includes(status));
}

export default function DestructionParticipationClient({
  tournamentId,
}: DestructionParticipationClientProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [tournament, setTournament] = useState<Tournament>(null);
  const [currentApply, setCurrentApply] = useState<CurrentApply>(null);
  const [mainPosition, setMainPosition] = useState<ApplyPosition | "">("");
  const [captainPreference, setCaptainPreference] = useState<CaptainPreference>("NOT_PREFERRED");
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchPlayers = async (targetId: string) => {
    const res = await fetch(`/api/participation/destruction/${targetId}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (res.ok) {
      setTournament(data.tournament ?? null);
      setPlayers(data.players || []);
      setCurrentApply(data.currentApply ?? null);

      if (data.currentApply?.mainPosition) {
        setMainPosition(data.currentApply.mainPosition);
      }

      if (typeof data.currentApply?.isCaptain === "boolean") {
        setCaptainPreference(data.currentApply.isCaptain ? "PREFERRED" : "NOT_PREFERRED");
      }
    }
  };

  useEffect(() => {
    fetchPlayers(tournamentId).catch((error: unknown) => {
      console.error("[DESTRUCTION_PARTICIPATION_FETCH_ERROR]", error);
    });
  }, [tournamentId]);

  const handleApply = async () => {
    if (!mainPosition) {
      alert("주 포지션을 선택해주세요.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(
        `/api/participation/destruction/${tournamentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mainPosition,
            captainPreference,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "참가 신청 실패");
        return;
      }

      alert(currentApply && isActiveApplyStatus(String(currentApply.status)) ? "멸망전 참가 신청이 수정되었습니다." : "멸망전 참가 신청이 완료되었습니다.");
      await fetchPlayers(tournamentId);
    } catch (error: unknown) {
      console.error("[DESTRUCTION_APPLY_ERROR]", error);
      alert("참가 신청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("멸망전 참가 신청을 취소하시겠습니까?")) return;

    try {
      setCancelLoading(true);

      const res = await fetch(`/api/participation/destruction/${tournamentId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "참가 취소 실패");
        return;
      }

      alert("멸망전 참가 신청이 취소되었습니다.");
      setMainPosition("");
      setCaptainPreference("NOT_PREFERRED");
      await fetchPlayers(tournamentId);
    } catch (error: unknown) {
      console.error("[DESTRUCTION_CANCEL_ERROR]", error);
      alert("참가 취소 중 오류가 발생했습니다.");
    } finally {
      setCancelLoading(false);
    }
  };

  const isRecruiting = tournament?.status === "RECRUITING";
  const hasCurrentActiveApply = isActiveApplyStatus(String(currentApply?.status ?? ""));
  const applyButtonText = loading
    ? "처리 중..."
    : hasCurrentActiveApply
      ? "신청 수정하기"
      : "참가하기";

  return (
    <div className="page-container participation-detail">
      <div className="page-header">
        <h1 className="page-title">멸망전 참가</h1>
        <p className="page-description">
          주 포지션 1개와 팀장 선호 여부만 선택합니다. 최종 팀장은 관리자 지정 기준으로 확정됩니다.
        </p>
      </div>

      {currentApply ? (
        <div className="empty-box" style={{ marginBottom: 16 }}>
          <strong>내 신청 상태: {STATUS_LABELS[String(currentApply.status)] ?? currentApply.status}</strong>
          <p className="page-description" style={{ margin: "8px 0 0" }}>
            주 포지션 {currentApply.mainPosition ?? "-"} · {currentApply.isCaptain ? "팀장 선호" : "팀장 비선호"}
            {currentApply.status === "RESERVE" ? " · 현재 관리자가 보류 인원으로 분류했습니다." : ""}
          </p>
        </div>
      ) : null}

      <div className="participation-box">
        <SinglePositionSelector
          title="주 포지션"
          value={mainPosition}
          onChange={setMainPosition}
        />

        <div className="participation-position-section">
          <div className="participation-position-title">
            팀장 여부
            <span>필수</span>
          </div>

          <div className="participation-position-group">
            <button
              type="button"
              className={
                captainPreference === "PREFERRED"
                  ? "participation-position-button active"
                  : "participation-position-button"
              }
              onClick={() => setCaptainPreference("PREFERRED")}
              disabled={!isRecruiting}
            >
              팀장 선호
            </button>
            <button
              type="button"
              className={
                captainPreference === "NOT_PREFERRED"
                  ? "participation-position-button active"
                  : "participation-position-button"
              }
              onClick={() => setCaptainPreference("NOT_PREFERRED")}
              disabled={!isRecruiting}
            >
              팀장 비선호
            </button>
          </div>
        </div>

        <div className="admin-form__actions" style={{ justifyContent: "space-between" }}>
          <button
            type="button"
            className="participation-apply-button"
            onClick={() => {
              handleApply().catch((error: unknown) => {
                console.error("[DESTRUCTION_APPLY_PROMISE_ERROR]", error);
              });
            }}
            disabled={loading || !isRecruiting}
          >
            {applyButtonText}
          </button>

          {hasCurrentActiveApply && isRecruiting ? (
            <button
              type="button"
              className="chip-button danger"
              onClick={() => {
                handleCancel().catch((error: unknown) => {
                  console.error("[DESTRUCTION_CANCEL_PROMISE_ERROR]", error);
                });
              }}
              disabled={cancelLoading}
            >
              {cancelLoading ? "취소 중..." : "참가 취소하기"}
            </button>
          ) : null}
        </div>
      </div>

      <ParticipationList players={players} />
    </div>
  );
}

function SinglePositionSelector({
  title,
  value,
  onChange,
}: {
  title: string;
  value: ApplyPosition | "";
  onChange: (value: ApplyPosition | "") => void;
}) {
  return (
    <div className="participation-position-section">
      <div className="participation-position-title">
        {title}
        <span>필수</span>
      </div>

      <div className="participation-position-group">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            className={
              value === pos
                ? "participation-position-button active"
                : "participation-position-button"
            }
            onClick={() => onChange(pos)}
          >
            {POSITION_LABELS[pos]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ParticipationList({ players }: { players: Player[] }) {
  const positionCounts = POSITIONS.map((position) => ({
    position,
    count: players.filter((player) => player.mainPosition === position && player.status !== "RESERVE").length,
  }));
  const activePlayers = players.filter((player) => player.status !== "RESERVE");
  const reservePlayers = players.filter((player) => player.status === "RESERVE");
  const captainPreferredCount = activePlayers.filter((player) => player.isCaptain).length;

  return (
    <div className="participation-list">
      <div className="page-header" style={{ marginTop: 24 }}>
        <h2>현재 참가 신청자</h2>
        <p className="page-description">
          확정 후보 {activePlayers.length}명 · 보류 {reservePlayers.length}명 · 팀장 선호 {captainPreferredCount}명 · 팀장 비선호 {activePlayers.length - captainPreferredCount}명
        </p>
      </div>

      <div className="admin-event-detail-grid" style={{ marginBottom: 16 }}>
        {positionCounts.map((item) => (
          <div key={item.position} className="admin-event-detail-card">
            <span>{item.position}</span>
            <strong>{item.count}명</strong>
          </div>
        ))}
      </div>

      <div className="participation-header participation-header--captain">
        <span></span>
        <span>이름</span>
        <span>닉네임#태그</span>
        <span>현재티어</span>
        <span>최고티어</span>
        <span>주 포지션</span>
        <span>상태</span>
      </div>

      {players.length === 0 ? (
        <div className="admin-empty">참가 신청자가 없습니다.</div>
      ) : (
        players.map((player, index) => (
          <div
            key={player.id}
            className="participation-item participation-item--captain"
          >
            <span>{index + 1}</span>
            <strong>{player.name}</strong>
            <em>
              {player.nickname}#{player.tag}
            </em>
            <span>{player.currentTier ?? "-"}</span>
            <span>{player.peakTier ?? "-"}</span>
            <span>{player.mainPosition ?? "-"}</span>
            <span>
              {STATUS_LABELS[String(player.status)] ?? player.status ?? "신청"}
              {player.isCaptain ? " · 팀장 선호" : " · 팀장 비선호"}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
