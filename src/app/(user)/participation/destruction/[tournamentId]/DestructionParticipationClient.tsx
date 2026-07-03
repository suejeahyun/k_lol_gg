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
  isCapacityOverflow?: boolean;
  isLaneOverflow?: boolean;
};

type CurrentApply = {
  id: number;
  status: ApplyStatus | string;
  mainPosition: ApplyPosition | null;
  subPositions?: ApplyPosition[];
  isCaptain: boolean;
  message?: string | null;
  isCapacityOverflow?: boolean;
  isLaneOverflow?: boolean;
} | null;

type LaneLimits = Record<ApplyPosition, number>;

type Tournament = {
  id: number;
  title: string;
  status: string;
  laneLimits?: LaneLimits;
} | null;

type DestructionParticipationClientProps = {
  tournamentId: string;
  embedded?: boolean;
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
  RESERVE: "자동보류",
  CANCELLED: "취소",
  REJECTED: "제외",
};

function getPublicStatusLabel(status: string | undefined, isCapacityOverflow?: boolean, isLaneOverflow?: boolean) {
  if (isCapacityOverflow) return "정원 초과";
  if (isLaneOverflow) return "라인 초과";
  if (status === "RESERVE") return "자동보류";
  return status ? (STATUS_LABELS[status] ?? status) : "신청";
}

function isActiveApplyStatus(status: string | undefined) {
  return Boolean(status && (ACTIVE_APPLY_STATUSES as readonly string[]).includes(status));
}

function formatPositions(positions: ApplyPosition[] | undefined) {
  if (!positions || positions.length === 0) return "-";
  return positions.join(" / ");
}

export default function DestructionParticipationClient({
  tournamentId,
  embedded = false,
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
    <div className={embedded ? "participation-detail participation-detail--embedded" : "page-container participation-detail"}>
      {!embedded ? (
        <div className="page-header">
          <h1 className="page-title">멸망전 참가</h1>
          <p className="page-description destruction-desktop-copy">
            주 포지션, 부 포지션, 팀장 선호 여부와 각오를 입력합니다. 최종 팀장은 관리자 지정 기준으로 확정됩니다.
          </p>
          <p className="page-description destruction-mobile-copy">
            주 라인 선택 후 바로 참가 신청할 수 있습니다.
          </p>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <Link href={`/participation/destruction/${tournamentId}/participants`} className="btn btn-ghost">
              참가자 명단 보기
            </Link>
            <Link href={`/participation/destruction/${tournamentId}/captain-points`} className="btn btn-ghost">
              팀장 포인트표
            </Link>
          </div>
        </div>
      ) : null}

      {currentApply ? (
        <div className="empty-box destruction-current-apply" style={{ marginBottom: 16 }}>
          <strong>내 신청 상태: {getPublicStatusLabel(String(currentApply.status), currentApply.isCapacityOverflow, currentApply.isLaneOverflow)}</strong>
          <p className="page-description" style={{ margin: "8px 0 0" }}>
            주 포지션 {currentApply.mainPosition ?? "-"} · 부 포지션 {formatPositions(currentApply.subPositions)} · {currentApply.isCaptain ? "팀장 선호" : "팀장 비선호"}
            {currentApply.isCapacityOverflow ? " · 현재 최대 참가 가능 인원을 초과한 대기 인원입니다." : currentApply.isLaneOverflow ? " · 현재 선택 라인이 정원을 초과한 상태입니다." : ""}
          </p>
          {currentApply.message ? (
            <p className="page-description" style={{ margin: "8px 0 0" }}>
              각오: {currentApply.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="participation-box destruction-apply-box">
        <div className="destruction-mobile-apply-guide" aria-label="모바일 참가 순서">
          <strong>참가 신청</strong>
          <span>주 라인 선택 → 필요 시 부 라인/각오 입력 → 참가하기</span>
        </div>

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

        <div className="admin-form__actions destruction-apply-actions" style={{ justifyContent: "space-between" }}>
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

      <ParticipationList tournamentId={tournamentId} players={players} laneLimits={tournament?.laneLimits} />
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

function ParticipationList({ tournamentId, players, laneLimits }: { tournamentId: string; players: Player[]; laneLimits?: LaneLimits }) {
  const limits = laneLimits ?? { TOP: 10, JGL: 10, MID: 10, ADC: 10, SUP: 10 };
  const participantPlayers = players.filter((player) => !player.isCapacityOverflow && !player.isLaneOverflow);
  const overflowPlayers = players.filter((player) => player.isCapacityOverflow || player.isLaneOverflow);
  const laneAutoReservePlayers = participantPlayers.filter((player) => player.status === "RESERVE");
  const positionCounts = POSITIONS.map((position) => ({
    position,
    count: participantPlayers.filter((player) => player.mainPosition === position).length,
    reserveCount: laneAutoReservePlayers.filter((player) => player.mainPosition === position).length,
    overflowCount: overflowPlayers.filter((player) => player.mainPosition === position).length,
    limit: limits[position],
  }));
  const captainPreferredCount = participantPlayers.filter((player) => player.isCaptain).length;

  return (
    <div className="participation-list">
      <div className="page-header" style={{ marginTop: 24 }}>
        <h2>현재 참가 신청자</h2>
        <p className="page-description">
          참가 {participantPlayers.length}명 · 초과 {overflowPlayers.length}명 · 팀장 선호 {captainPreferredCount}명 · 팀장 비선호 {participantPlayers.length - captainPreferredCount}명
        </p>
        <div className="page-actions destruction-list-actions" style={{ marginTop: 10 }}>
          <Link href={`/participation/destruction/${tournamentId}/participants`} className="btn btn-ghost">
            공개 명단 전체 보기
          </Link>
          <Link href={`/participation/destruction/${tournamentId}/captain-points`} className="btn btn-ghost">
            팀장 포인트표
          </Link>
        </div>
      </div>

      <div className="destruction-mobile-list-cta">
        <strong>참가자 {participantPlayers.length}명 · 초과 {overflowPlayers.length}명</strong>
        <span>휴대폰에서는 신청 편의를 위해 상세 명단을 접었습니다.</span>
        <Link href={`/participation/destruction/${tournamentId}/participants`} className="btn btn-primary">
          참가자 명단 보기
        </Link>
        <Link href={`/participation/destruction/${tournamentId}/captain-points`} className="btn btn-ghost">
          팀장 포인트표
        </Link>
      </div>

      <div className="admin-event-detail-grid destruction-position-summary-grid" style={{ marginBottom: 16 }}>
        {positionCounts.map((item) => (
          <div key={item.position} className="admin-event-detail-card">
            <span>{item.position}</span>
            <strong>{item.count} / {item.limit}명</strong>
            {null}
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

      {participantPlayers.length === 0 ? (
        <div className="admin-empty">참가 신청자가 없습니다.</div>
      ) : (
        participantPlayers.map((player, index) => (
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
              {getPublicStatusLabel(String(player.status), player.isCapacityOverflow, player.isLaneOverflow)}
              {player.isCaptain ? " · 팀장 선호" : " · 팀장 비선호"}
            </span>
          </Link>
        ))
      )}

      {overflowPlayers.length > 0 ? (
        <>
          <div className="page-header" style={{ marginTop: 20 }}>
            <h3 style={{ margin: 0 }}>초과 신청자</h3>
            <p className="page-description">라인 제한 또는 전체 정원을 초과한 신청자입니다. 참가자와 분리해서 표시합니다.</p>
          </div>
          {overflowPlayers.map((player, index) => (
            <Link
              key={player.id}
              href={`/participation/destruction/${tournamentId}/participants/${player.id}`}
              className="participation-item participation-item--captain"
              style={{ textDecoration: "none" }}
            >
              <span>초과 {index + 1}</span>
              <strong>{player.name}</strong>
              <em>
                {player.nickname}#{player.tag}
              </em>
              <span>{player.currentTier ?? "-"}</span>
              <span>{player.peakTier ?? "-"}</span>
              <span>{player.mainPosition ?? "-"} / {formatPositions(player.subPositions)}</span>
              <span>
                {getPublicStatusLabel(String(player.status), player.isCapacityOverflow, player.isLaneOverflow)}
                {player.isCaptain ? " · 팀장 선호" : " · 팀장 비선호"}
              </span>
            </Link>
          ))}
        </>
      ) : null}
    </div>
  );
}
