"use client";

import Link from "next/link";
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
  subPositions?: ApplyPosition[];
  isCaptain: boolean;
  message?: string | null;
  status?: ApplyStatus | string;
};

type CurrentApply = {
  id: number;
  status: ApplyStatus | string;
  mainPosition: ApplyPosition | null;
  subPositions?: ApplyPosition[];
  isCaptain: boolean;
  message?: string | null;
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

function formatPositions(positions: ApplyPosition[] | undefined) {
  if (!positions || positions.length === 0) return "-";
  return positions.join(" / ");
}

export default function DestructionParticipationClient({
  tournamentId,
}: DestructionParticipationClientProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [tournament, setTournament] = useState<Tournament>(null);
  const [currentApply, setCurrentApply] = useState<CurrentApply>(null);
  const [mainPosition, setMainPosition] = useState<ApplyPosition | "">("");
  const [subPositions, setSubPositions] = useState<ApplyPosition[]>([]);
  const [captainPreference, setCaptainPreference] = useState<CaptainPreference>("NOT_PREFERRED");
  const [message, setMessage] = useState("");
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

      if (Array.isArray(data.currentApply?.subPositions)) {
        setSubPositions(data.currentApply.subPositions);
      }

      if (typeof data.currentApply?.message === "string") {
        setMessage(data.currentApply.message);
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
            subPositions,
            captainPreference,
            message,
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
      setSubPositions([]);
      setMessage("");
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
    <div className="page-container participation-detail destruction-participation-page">
      <style>{`
        .destruction-participation-page {
          width: min(100%, 1120px);
          margin: 0 auto;
          padding-inline: clamp(12px, 3vw, 24px);
          box-sizing: border-box;
          overflow-x: hidden;
        }

        .destruction-participation-page *,
        .destruction-participation-page *::before,
        .destruction-participation-page *::after {
          box-sizing: border-box;
        }

        .destruction-participation-page .page-header,
        .destruction-participation-page .empty-box,
        .destruction-participation-page .participation-box,
        .destruction-participation-page .participation-list {
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }

        .destruction-participation-page .page-title,
        .destruction-participation-page .page-description {
          overflow-wrap: anywhere;
        }

        .destruction-participation-page .page-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .destruction-participation-page .page-actions .btn,
        .destruction-participation-page .chip-button {
          min-width: 0;
          white-space: normal;
          text-align: center;
        }

        .destruction-participation-page .participation-box {
          padding: clamp(16px, 3vw, 24px);
        }

        .destruction-participation-page .participation-position-group {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
          gap: 10px;
        }

        .destruction-participation-page .participation-position-button {
          width: 100%;
          min-width: 0;
          white-space: nowrap;
        }

        .destruction-participation-page .admin-form__textarea {
          width: 100%;
          min-width: 0;
          resize: vertical;
        }

        .destruction-participation-page .admin-form__actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: stretch;
          gap: 10px;
        }

        .destruction-participation-page .participation-list {
          padding: clamp(14px, 3vw, 22px);
        }

        .destruction-participation-page .admin-event-detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 10px;
        }

        .destruction-participation-page .participation-header--captain,
        .destruction-participation-page .participation-item--captain {
          display: grid;
          grid-template-columns: 42px minmax(72px, 0.7fr) minmax(150px, 1.4fr) minmax(82px, 0.8fr) minmax(82px, 0.8fr) minmax(130px, 1.2fr) minmax(150px, 1.4fr);
          gap: 10px;
          align-items: center;
          width: 100%;
          min-width: 0;
        }

        .destruction-participation-page .participation-header--captain {
          padding: 10px 12px;
          border: 1px solid rgba(59, 130, 246, 0.28);
          border-radius: 12px;
          background: rgba(2, 6, 23, 0.45);
          color: rgba(125, 211, 252, 0.95);
          font-size: 12px;
          font-weight: 900;
        }

        .destruction-participation-page .participation-item--captain {
          padding: 14px 12px;
          border: 1px solid rgba(59, 130, 246, 0.24);
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.54);
          color: inherit;
        }

        .destruction-participation-page .participation-item--captain > * {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        @media (max-width: 760px) {
          .destruction-participation-page {
            padding-inline: 12px;
          }

          .destruction-participation-page .page-header {
            padding: 16px;
          }

          .destruction-participation-page .page-actions .btn,
          .destruction-participation-page .admin-form__actions > *,
          .destruction-participation-page .chip-button {
            width: 100%;
          }

          .destruction-participation-page .admin-form__actions {
            grid-template-columns: 1fr;
          }

          .destruction-participation-page .participation-header--captain {
            display: none;
          }

          .destruction-participation-page .participation-item--captain {
            grid-template-columns: 1fr;
            gap: 8px;
            padding: 14px;
          }

          .destruction-participation-page .participation-item--captain > span,
          .destruction-participation-page .participation-item--captain > strong,
          .destruction-participation-page .participation-item--captain > em {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            width: 100%;
            text-align: right;
            font-style: normal;
          }

          .destruction-participation-page .participation-item--captain > span::before,
          .destruction-participation-page .participation-item--captain > strong::before,
          .destruction-participation-page .participation-item--captain > em::before {
            flex: 0 0 auto;
            color: rgba(148, 163, 184, 0.8);
            font-size: 12px;
            font-weight: 900;
            text-align: left;
          }

          .destruction-participation-page .participation-item--captain > span:nth-child(1)::before { content: "순번"; }
          .destruction-participation-page .participation-item--captain > strong::before { content: "이름"; }
          .destruction-participation-page .participation-item--captain > em::before { content: "닉네임#태그"; }
          .destruction-participation-page .participation-item--captain > span:nth-child(4)::before { content: "현재티어"; }
          .destruction-participation-page .participation-item--captain > span:nth-child(5)::before { content: "최고티어"; }
          .destruction-participation-page .participation-item--captain > span:nth-child(6)::before { content: "포지션"; }
          .destruction-participation-page .participation-item--captain > span:nth-child(7)::before { content: "상태"; }
        }

        @media (max-width: 420px) {
          .destruction-participation-page .participation-position-group {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .destruction-participation-page .participation-box,
          .destruction-participation-page .participation-list {
            border-radius: 16px;
          }
        }
      `}</style>
      <div className="page-header">
        <h1 className="page-title">멸망전 참가</h1>
        <p className="page-description">
          주 포지션, 부 포지션, 팀장 선호 여부와 각오를 입력합니다. 최종 팀장은 관리자 지정 기준으로 확정됩니다.
        </p>
        <div className="page-actions" style={{ marginTop: 12 }}>
          <Link href={`/participation/destruction/${tournamentId}/participants`} className="btn btn-ghost">
            참가자 명단 보기
          </Link>
        </div>
      </div>

      {currentApply ? (
        <div className="empty-box" style={{ marginBottom: 16 }}>
          <strong>내 신청 상태: {STATUS_LABELS[String(currentApply.status)] ?? currentApply.status}</strong>
          <p className="page-description" style={{ margin: "8px 0 0" }}>
            주 포지션 {currentApply.mainPosition ?? "-"} · 부 포지션 {formatPositions(currentApply.subPositions)} · {currentApply.isCaptain ? "팀장 선호" : "팀장 비선호"}
            {currentApply.status === "RESERVE" ? " · 현재 관리자가 보류 인원으로 분류했습니다." : ""}
          </p>
          {currentApply.message ? (
            <p className="page-description" style={{ margin: "8px 0 0" }}>
              각오: {currentApply.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="participation-box">
        <SinglePositionSelector
          title="주 포지션"
          value={mainPosition}
          onChange={(value) => {
            setMainPosition(value);
            setSubPositions((prev) => prev.filter((position) => position !== value));
          }}
        />

        <MultiPositionSelector
          title="부 포지션"
          values={subPositions}
          mainPosition={mainPosition}
          onChange={setSubPositions}
          disabled={!isRecruiting}
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

        <div className="participation-position-section">
          <div className="participation-position-title">
            각오 한마디
            <span>선택</span>
          </div>
          <textarea
            className="admin-form__textarea"
            value={message}
            maxLength={500}
            rows={4}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="경매 및 참가자 상세 페이지에서 확인할 각오를 입력하세요."
            disabled={!isRecruiting}
          />
          <p className="page-description" style={{ margin: "6px 0 0", fontSize: 12 }}>
            {message.length}/500자
          </p>
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

      <ParticipationList tournamentId={tournamentId} players={players} />
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

function MultiPositionSelector({
  title,
  values,
  mainPosition,
  onChange,
  disabled,
}: {
  title: string;
  values: ApplyPosition[];
  mainPosition: ApplyPosition | "";
  onChange: (value: ApplyPosition[]) => void;
  disabled?: boolean;
}) {
  const toggle = (position: ApplyPosition) => {
    if (position === mainPosition) return;
    if (values.includes(position)) {
      onChange(values.filter((value) => value !== position));
      return;
    }
    onChange([...values, position]);
  };

  return (
    <div className="participation-position-section">
      <div className="participation-position-title">
        {title}
        <span>선택</span>
      </div>

      <div className="participation-position-group">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            className={
              values.includes(pos)
                ? "participation-position-button active"
                : "participation-position-button"
            }
            onClick={() => toggle(pos)}
            disabled={disabled || pos === mainPosition}
            title={pos === mainPosition ? "주 포지션과 같은 부 포지션은 선택할 수 없습니다." : undefined}
          >
            {POSITION_LABELS[pos]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ParticipationList({ tournamentId, players }: { tournamentId: string; players: Player[] }) {
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
        <div className="page-actions" style={{ marginTop: 10 }}>
          <Link href={`/participation/destruction/${tournamentId}/participants`} className="btn btn-ghost">
            공개 명단 전체 보기
          </Link>
        </div>
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
        <span>주/부 포지션</span>
        <span>상태</span>
      </div>

      {players.length === 0 ? (
        <div className="admin-empty">참가 신청자가 없습니다.</div>
      ) : (
        players.map((player, index) => (
          <Link
            key={player.id}
            href={`/participation/destruction/${tournamentId}/participants/${player.id}`}
            className="participation-item participation-item--captain"
            style={{ textDecoration: "none" }}
          >
            <span>{index + 1}</span>
            <strong>{player.name}</strong>
            <em>
              {player.nickname}#{player.tag}
            </em>
            <span>{player.currentTier ?? "-"}</span>
            <span>{player.peakTier ?? "-"}</span>
            <span>{player.mainPosition ?? "-"} / {formatPositions(player.subPositions)}</span>
            <span>
              {STATUS_LABELS[String(player.status)] ?? player.status ?? "신청"}
              {player.isCaptain ? " · 팀장 선호" : " · 팀장 비선호"}
            </span>
          </Link>
        ))
      )}
    </div>
  );
}
