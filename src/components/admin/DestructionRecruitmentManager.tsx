"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type ApplyStatus = "APPLIED" | "CONFIRMED" | "REJECTED" | "RESERVE" | "CANCELLED";

type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier?: string | null;
  peakTier?: string | null;
};

type Application = {
  id: number;
  playerId: number;
  mainPosition: Position | string;
  isCaptain: boolean;
  status: ApplyStatus | string;
  createdAt: string;
  player: Player;
};

type LaneLimits = Record<Position, number>;

type ApplicationUpdatePayload = {
  status?: ApplyStatus;
  mainPosition?: Position;
};

type Props = {
  tournamentId: number;
  applications: Application[];
  hasTeams: boolean;
  hasMatches: boolean;
  laneLimits: LaneLimits;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "신청",
  CONFIRMED: "확정",
  RESERVE: "자동 보류",
  CANCELLED: "취소",
  REJECTED: "제외",
};

function isActiveStatus(status: string) {
  return status === "APPLIED" || status === "CONFIRMED";
}

function isAutoManagedStatus(status: string) {
  return status === "APPLIED" || status === "RESERVE";
}

function isRecruitmentPoolStatus(status: string) {
  return status === "APPLIED" || status === "CONFIRMED" || status === "RESERVE";
}

function isEditableApplyStatus(status: string) {
  return status !== "CANCELLED" && status !== "REJECTED";
}

function toPosition(value: string): Position | null {
  return POSITIONS.includes(value as Position) ? (value as Position) : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sortByApplyOrder(applications: Application[]) {
  return applications.slice().sort((a, b) => {
    const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    return a.id - b.id;
  });
}

function getConfirmedCountByPosition(applications: Application[]) {
  const counts = Object.fromEntries(POSITIONS.map((position) => [position, 0])) as Record<Position, number>;

  for (const application of applications) {
    if (application.status !== "CONFIRMED") continue;
    const position = toPosition(String(application.mainPosition));
    if (!position) continue;
    counts[position] += 1;
  }

  return counts;
}

function getAutoReserveIds(applications: Application[], laneLimits: LaneLimits) {
  const pool = sortByApplyOrder(
    applications.filter((application) => isRecruitmentPoolStatus(String(application.status))),
  );
  const confirmedApplications = pool.filter((application) => application.status === "CONFIRMED");
  const candidates = pool.filter((application) => isAutoManagedStatus(String(application.status)));
  const targetTeamCount = pool.length >= 5 ? Math.floor(pool.length / 5) : 0;
  const capacity = targetTeamCount * 5;
  const reserveIds = new Set<number>();

  if (targetTeamCount === 0) return reserveIds;

  const availableCapacity = Math.max(0, capacity - confirmedApplications.length);

  for (const application of candidates.slice(availableCapacity)) {
    reserveIds.add(application.id);
  }

  const remaining = candidates.filter((application) => !reserveIds.has(application.id));
  const confirmedCountByPosition = getConfirmedCountByPosition(pool);

  for (const position of POSITIONS) {
    const samePosition = remaining
      .filter((application) => application.mainPosition === position)
      .sort((a, b) => {
        const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (createdAtDiff !== 0) return createdAtDiff;
        return a.id - b.id;
      });

    const positionLimit = Math.max(0, laneLimits[position] - confirmedCountByPosition[position]);
    if (samePosition.length <= positionLimit) continue;

    for (const application of samePosition.slice(positionLimit)) {
      reserveIds.add(application.id);
    }
  }

  return reserveIds;
}

function getReserveReason(application: Application, reserveIds: Set<number>, applications: Application[], laneLimits: LaneLimits) {
  if (application.status === "CONFIRMED") return "";
  if (!reserveIds.has(application.id) && application.status !== "RESERVE") return "";

  const pool = sortByApplyOrder(
    applications.filter((item) => isRecruitmentPoolStatus(String(item.status))),
  );
  const confirmedApplications = pool.filter((item) => item.status === "CONFIRMED");
  const targetTeamCount = pool.length >= 5 ? Math.floor(pool.length / 5) : 0;
  const capacity = targetTeamCount * 5;

  if (targetTeamCount === 0) return "팀 구성 가능 인원 부족";

  const candidates = pool.filter((item) => isAutoManagedStatus(String(item.status)));
  const candidateIndex = candidates.findIndex((item) => item.id === application.id);
  const availableCapacity = Math.max(0, capacity - confirmedApplications.length);

  if (candidateIndex >= availableCapacity) return `${capacity}명 기준 초과`;

  const confirmedCountByPosition = getConfirmedCountByPosition(pool);
  const samePositionCandidates = candidates
    .filter((item) => item.mainPosition === application.mainPosition)
    .sort((a, b) => {
      const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return a.id - b.id;
    });
  const positionIndex = samePositionCandidates.findIndex((item) => item.id === application.id);

  const position = toPosition(String(application.mainPosition));
  const positionLimit = position ? Math.max(0, (laneLimits[position] ?? 10) - confirmedCountByPosition[position]) : 0;
  if (positionIndex >= positionLimit) return `${application.mainPosition} 최대 ${laneLimits[position ?? "TOP"] ?? 10}명 초과`;

  return "자동 보류";
}

function getStatusBadgeClass(status: string) {
  if (status === "CONFIRMED") return "recruitment-badge confirmed";
  if (status === "RESERVE") return "recruitment-badge reserve";
  if (status === "REJECTED" || status === "CANCELLED") return "recruitment-badge reject";
  return "recruitment-badge";
}

export default function DestructionRecruitmentManager({
  tournamentId,
  applications,
  hasTeams,
  hasMatches,
  laneLimits,
}: Props) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [captainFilter, setCaptainFilter] = useState("ALL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const commonLaneLimit = Math.max(...POSITIONS.map((position) => laneLimits[position] ?? 10));
  const [laneLimitDraft, setLaneLimitDraft] = useState(String(commonLaneLimit));

  const canEdit = !hasTeams && !hasMatches;
  const appliedApplications = applications.filter((application) => application.status === "APPLIED");
  const confirmedApplications = applications.filter((application) => application.status === "CONFIRMED");
  const activeApplications = applications.filter((application) => isActiveStatus(String(application.status)));
  const reserveApplications = applications.filter((application) => application.status === "RESERVE");
  const cancelledApplications = applications.filter((application) => application.status === "CANCELLED");
  const rejectedApplications = applications.filter((application) => application.status === "REJECTED");
  const managedApplicationCount = applications.filter((application) => isRecruitmentPoolStatus(String(application.status))).length;
  const targetTeamCount = managedApplicationCount >= 5 ? Math.floor(managedApplicationCount / 5) : 0;
  const targetActiveCount = targetTeamCount * 5;
  const autoReserveIds = useMemo(() => getAutoReserveIds(applications, laneLimits), [applications, laneLimits]);

  const positionCounts = POSITIONS.map((position) => ({
    position,
    count: activeApplications.filter((application) => application.mainPosition === position).length,
    reserveCount: reserveApplications.filter((application) => application.mainPosition === position).length,
    limit: laneLimits[position],
  }));

  const filteredApplications = applications.filter((application) => {
    if (statusFilter !== "ALL" && application.status !== statusFilter) return false;
    if (positionFilter !== "ALL" && application.mainPosition !== positionFilter) return false;
    if (captainFilter === "PREFERRED" && !application.isCaptain) return false;
    if (captainFilter === "NOT_PREFERRED" && application.isCaptain) return false;

    const value = keyword.trim().toLowerCase();
    if (!value) return true;

    const haystack = [
      application.player.name,
      application.player.nickname,
      application.player.tag,
      `${application.player.nickname}#${application.player.tag}`,
      application.mainPosition,
      application.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(value);
  });

  const updateApplication = async (applicationId: number, payload: ApplicationUpdatePayload) => {
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/admin/destruction-tournaments/${tournamentId}/applications/${applicationId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "참가 신청 정보 변경 실패");
        return false;
      }

      return true;
    } catch {
      setError("참가 신청 정보 변경 중 오류가 발생했습니다.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusUpdate = async (applicationId: number, status: ApplyStatus) => {
    const ok = await updateApplication(applicationId, { status });
    if (ok) router.refresh();
  };

  const handlePositionUpdate = async (applicationId: number, mainPosition: Position) => {
    const ok = await updateApplication(applicationId, { mainPosition });
    if (ok) router.refresh();
  };

  const handleLaneLimitSave = async () => {
    setError("");

    const value = Number(laneLimitDraft);
    if (!Number.isInteger(value) || value < 1 || value > 99) {
      setError("라인 최대 인원은 1~99 사이의 정수로 입력해주세요.");
      return;
    }

    const parsed = Object.fromEntries(POSITIONS.map((position) => [position, value])) as Record<Position, number>;

    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/destruction-tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          laneLimits: parsed,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.message ?? "라인별 최대 인원 저장 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("라인별 최대 인원 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="destruction-recruitment-manager destruction-admin-panel-wide">
      <style>{`
        .destruction-recruitment-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .destruction-position-strip { display: grid; grid-template-columns: repeat(5, minmax(90px, 1fr)); gap: 8px; margin-bottom: 16px; }
        .recruitment-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 14px 0; }
        .destruction-lane-limit-editor { display: grid; grid-template-columns: minmax(160px, 320px); gap: 8px; margin-bottom: 12px; justify-content: center; }
        .destruction-lane-limit-field { border: 1px solid rgba(59,130,246,0.28); border-radius: 14px; padding: 10px; background: rgba(15,23,42,0.48); }
        .destruction-lane-limit-field label { display: block; color: #bfdbfe; font-size: 12px; font-weight: 800; margin-bottom: 6px; }
        .recruitment-auto-note { border: 1px solid rgba(34,211,238,0.28); background: rgba(8,145,178,0.10); color: #c8f5ff; border-radius: 12px; padding: 10px 12px; font-size: 12px; font-weight: 700; }
        .recruitment-table { border: 1px solid rgba(59,130,246,0.30); border-radius: 16px; overflow: hidden; background: rgba(7,16,35,0.72); }
        .recruitment-row { display: grid; grid-template-columns: 52px minmax(90px, 0.8fr) minmax(180px, 1.3fr) 104px 90px 104px 96px minmax(190px, 1fr); gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid rgba(59,130,246,0.18); }
        .recruitment-row:last-child { border-bottom: 0; }
        .recruitment-row.is-head { background: rgba(15,36,72,0.92); color: #dbeafe; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
        .recruitment-row.is-reserve { background: rgba(250,204,21,0.045); }
        .recruitment-row.is-confirmed { background: rgba(34,197,94,0.045); }
        .recruitment-badge { display: inline-flex; width: fit-content; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 12px; border: 1px solid rgba(96,165,250,0.32); background: rgba(96,165,250,0.10); color: #dbeafe; }
        .recruitment-badge.confirmed { border-color: rgba(34,197,94,0.45); background: rgba(34,197,94,0.12); color: #bbf7d0; }
        .recruitment-badge.reserve { border-color: rgba(250,204,21,0.42); background: rgba(250,204,21,0.12); color: #fef3c7; }
        .recruitment-badge.reject { border-color: rgba(248,113,113,0.42); background: rgba(248,113,113,0.12); color: #fecaca; }
        .recruitment-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
        .recruitment-position-select { min-width: 92px; padding: 7px 8px; }
        @media (max-width: 1180px) { .destruction-position-strip, .destruction-lane-limit-editor { grid-template-columns: 1fr 1fr; } .recruitment-row { grid-template-columns: 1fr; } .recruitment-row.is-head { display: none; } .recruitment-actions { justify-content: flex-start; } }
      `}</style>

      <div className="destruction-recruitment-summary">
        <div className="admin-event-detail-card">
          <span>신청</span>
          <strong>{appliedApplications.length}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>확정</span>
          <strong>{confirmedApplications.length}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>자동 보류</span>
          <strong>{reserveApplications.length}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>취소</span>
          <strong>{cancelledApplications.length}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>제외</span>
          <strong>{rejectedApplications.length}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>현재 기준 팀 수</span>
          <strong>{targetTeamCount > 0 ? `${targetTeamCount}팀 · ${targetActiveCount}명` : "산정 불가"}</strong>
        </div>
      </div>

      <div className="empty-box" style={{ marginBottom: 14 }}>
        <strong>라인 최대 인원 설정</strong>
        <p className="admin-page__description" style={{ margin: "8px 0 12px" }}>
          모든 라인에 같은 최대 인원이 적용됩니다. 확정 인원은 자동 보류 대상에서 제외되며, 신청/보류 인원만 남은 정원 기준으로 자동 재계산됩니다. 경매 시작 전까지만 수정할 수 있습니다.
        </p>
        <div className="destruction-lane-limit-editor">
          <div className="destruction-lane-limit-field">
            <label>라인당 최대 인원</label>
            <input
              className="admin-form__input"
              type="number"
              min="1"
              max="99"
              value={laneLimitDraft}
              onChange={(event) => setLaneLimitDraft(event.target.value)}
              disabled={!canEdit || isSubmitting}
            />
          </div>
        </div>
        <button
          type="button"
          className="chip-button"
          onClick={handleLaneLimitSave}
          disabled={!canEdit || isSubmitting}
        >
          {isSubmitting ? "저장 중..." : "라인 최대 인원 저장 / 자동 보류 재계산"}
        </button>
      </div>

      <div className="destruction-position-strip">
        {positionCounts.map((item) => {
          const excessive = item.count > item.limit;
          return (
            <div key={item.position} className="admin-event-detail-card">
              <span>{item.position}</span>
              <strong>{item.count}명</strong>
              <small style={{ color: excessive ? "#ff8b8b" : "#9db4d8" }}>
                최대 {item.limit}명{item.reserveCount > 0 ? ` · 보류 ${item.reserveCount}명` : ""}
              </small>
            </div>
          );
        })}
      </div>

      <div className="empty-box" style={{ marginBottom: 14 }}>
        <strong>관리 기준</strong>
        <p className="admin-page__description" style={{ margin: "8px 0 0" }}>
          라인은 모집 현황에서 바로 변경할 수 있습니다. 보류 인원을 반드시 참가시키려면 관리에서 <b>확정</b>으로 변경하세요. 확정 상태는 자동 보류 재계산으로 다시 보류되지 않습니다.
        </p>
      </div>

      <div className="recruitment-toolbar">
        <input
          className="admin-form__input"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="이름, 닉네임, 포지션, 상태 검색"
          style={{ minWidth: 240, flex: "1 1 260px" }}
        />
        <select
          className="admin-form__input"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={{ minWidth: 130 }}
        >
          <option value="ALL">전체 상태</option>
          <option value="APPLIED">신청</option>
          <option value="CONFIRMED">확정</option>
          <option value="RESERVE">자동 보류</option>
          <option value="CANCELLED">취소</option>
          <option value="REJECTED">제외</option>
        </select>
        <select
          className="admin-form__input"
          value={positionFilter}
          onChange={(event) => setPositionFilter(event.target.value)}
          style={{ minWidth: 120 }}
        >
          <option value="ALL">전체 라인</option>
          {POSITIONS.map((position) => (
            <option key={position} value={position}>{position}</option>
          ))}
        </select>
        <select
          className="admin-form__input"
          value={captainFilter}
          onChange={(event) => setCaptainFilter(event.target.value)}
          style={{ minWidth: 140 }}
        >
          <option value="ALL">팀장 선호 전체</option>
          <option value="PREFERRED">선호</option>
          <option value="NOT_PREFERRED">비선호</option>
        </select>
        <span className="recruitment-auto-note">확정은 보류 대상에서 제외됩니다.</span>
      </div>

      {filteredApplications.length === 0 ? (
        <div className="empty-box">조건에 맞는 참가 신청자가 없습니다.</div>
      ) : (
        <div className="recruitment-table">
          <div className="recruitment-row is-head">
            <span>No</span>
            <span>이름</span>
            <span>닉네임#태그</span>
            <span>라인 변경</span>
            <span>팀장</span>
            <span>상태</span>
            <span>신청</span>
            <span>관리</span>
          </div>
          {filteredApplications.map((application, index) => {
            const reason = getReserveReason(application, autoReserveIds, applications, laneLimits);
            const status = String(application.status);
            const rowClassName = status === "RESERVE"
              ? "recruitment-row is-reserve"
              : status === "CONFIRMED"
                ? "recruitment-row is-confirmed"
                : "recruitment-row";

            return (
              <div key={application.id} className={rowClassName}>
                <span>{index + 1}</span>
                <strong>{application.player.name || application.player.nickname}</strong>
                <span>{application.player.nickname}#{application.player.tag}</span>
                <span>
                  <select
                    className="admin-form__input recruitment-position-select"
                    value={toPosition(String(application.mainPosition)) ?? "TOP"}
                    onChange={(event) => handlePositionUpdate(application.id, event.target.value as Position)}
                    disabled={!canEdit || isSubmitting || !isEditableApplyStatus(status)}
                    aria-label={`${application.player.nickname} 라인 변경`}
                  >
                    {POSITIONS.map((position) => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
                </span>
                <span>{application.isCaptain ? "선호" : "비선호"}</span>
                <span>
                  <span className={getStatusBadgeClass(status)}>
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  {reason ? (
                    <small style={{ display: "block", color: "#fbbf24", marginTop: 4 }}>{reason}</small>
                  ) : null}
                </span>
                <span>{formatDate(application.createdAt)}</span>
                <span className="recruitment-actions">
                  {status !== "CONFIRMED" && status !== "REJECTED" && status !== "CANCELLED" ? (
                    <button
                      type="button"
                      className="chip-button"
                      onClick={() => handleStatusUpdate(application.id, "CONFIRMED")}
                      disabled={!canEdit || isSubmitting}
                    >
                      확정
                    </button>
                  ) : null}

                  {status === "CONFIRMED" || status === "RESERVE" ? (
                    <button
                      type="button"
                      className="chip-button"
                      onClick={() => handleStatusUpdate(application.id, "APPLIED")}
                      disabled={!canEdit || isSubmitting}
                    >
                      신청
                    </button>
                  ) : null}

                  {status === "REJECTED" || status === "CANCELLED" ? (
                    <button
                      type="button"
                      className="chip-button"
                      onClick={() => handleStatusUpdate(application.id, "APPLIED")}
                      disabled={!canEdit || isSubmitting}
                    >
                      복구
                    </button>
                  ) : null}

                  {status !== "REJECTED" && status !== "CANCELLED" ? (
                    <button
                      type="button"
                      className="chip-button danger"
                      onClick={() => handleStatusUpdate(application.id, "REJECTED")}
                      disabled={!canEdit || isSubmitting}
                    >
                      제외
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {error ? <p className="notice-form__error">{error}</p> : null}

      {!canEdit ? (
        <div className="empty-box" style={{ marginTop: 16 }}>
          팀 또는 경기가 생성된 이후에는 모집 현황에서 신청 상태와 라인을 변경할 수 없습니다.
        </div>
      ) : null}
    </div>
  );
}
