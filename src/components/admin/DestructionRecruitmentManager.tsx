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

type Props = {
  tournamentId: number;
  applications: Application[];
  hasTeams: boolean;
  hasMatches: boolean;
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

function isManagedStatus(status: string) {
  return status === "APPLIED" || status === "CONFIRMED" || status === "RESERVE";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getAutoReserveIds(applications: Application[]) {
  const candidates = applications
    .filter((application) => isManagedStatus(String(application.status)))
    .slice()
    .sort((a, b) => {
      const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return a.id - b.id;
    });

  const targetTeamCount = candidates.length >= 5 ? Math.floor(candidates.length / 5) : 0;
  const capacity = targetTeamCount * 5;
  const reserveIds = new Set<number>();

  if (targetTeamCount === 0) return reserveIds;

  for (const application of candidates.slice(capacity)) {
    reserveIds.add(application.id);
  }

  const remaining = candidates.filter((application) => !reserveIds.has(application.id));

  for (const position of POSITIONS) {
    const samePosition = remaining
      .filter((application) => application.mainPosition === position)
      .sort((a, b) => {
        const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (createdAtDiff !== 0) return createdAtDiff;
        return a.id - b.id;
      });

    if (samePosition.length <= targetTeamCount) continue;

    for (const application of samePosition.slice(targetTeamCount)) {
      reserveIds.add(application.id);
    }
  }

  return reserveIds;
}

function getReserveReason(application: Application, reserveIds: Set<number>, applications: Application[]) {
  if (!reserveIds.has(application.id) && application.status !== "RESERVE") return "";

  const candidates = applications
    .filter((item) => isManagedStatus(String(item.status)))
    .slice()
    .sort((a, b) => {
      const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return a.id - b.id;
    });
  const targetTeamCount = candidates.length >= 5 ? Math.floor(candidates.length / 5) : 0;
  const capacity = targetTeamCount * 5;
  const globalIndex = candidates.findIndex((item) => item.id === application.id);

  if (targetTeamCount === 0) return "팀 구성 가능 인원 부족";
  if (globalIndex >= capacity) return `${capacity}명 이후 신청`;

  const samePosition = candidates
    .filter((item) => item.mainPosition === application.mainPosition)
    .sort((a, b) => {
      const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return a.id - b.id;
    });
  const positionIndex = samePosition.findIndex((item) => item.id === application.id);

  if (positionIndex >= targetTeamCount) return `${application.mainPosition} ${targetTeamCount}명 초과`;

  return "자동 보류";
}

export default function DestructionRecruitmentManager({
  tournamentId,
  applications,
  hasTeams,
  hasMatches,
}: Props) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [captainFilter, setCaptainFilter] = useState("ALL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canEdit = !hasTeams && !hasMatches;
  const activeApplications = applications.filter((application) => isActiveStatus(String(application.status)));
  const reserveApplications = applications.filter((application) => application.status === "RESERVE");
  const cancelledApplications = applications.filter((application) => application.status === "CANCELLED");
  const rejectedApplications = applications.filter((application) => application.status === "REJECTED");
  const managedApplicationCount = applications.filter((application) => isManagedStatus(String(application.status))).length;
  const targetTeamCount = managedApplicationCount >= 5 ? Math.floor(managedApplicationCount / 5) : 0;
  const targetActiveCount = targetTeamCount * 5;
  const autoReserveIds = useMemo(() => getAutoReserveIds(applications), [applications]);

  const positionCounts = POSITIONS.map((position) => ({
    position,
    count: activeApplications.filter((application) => application.mainPosition === position).length,
    reserveCount: reserveApplications.filter((application) => application.mainPosition === position).length,
    recommendedMax: targetTeamCount,
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

  const updateStatus = async (applicationId: number, status: ApplyStatus) => {
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
          body: JSON.stringify({ status }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "참가 신청 상태 변경 실패");
        return false;
      }

      return true;
    } catch {
      setError("참가 신청 상태 변경 중 오류가 발생했습니다.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusUpdate = async (applicationId: number, status: ApplyStatus) => {
    const ok = await updateStatus(applicationId, status);
    if (ok) router.refresh();
  };

  return (
    <div className="destruction-recruitment-manager destruction-admin-panel-wide">
      <style>{`
        .destruction-recruitment-summary { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .destruction-position-strip { display: grid; grid-template-columns: repeat(5, minmax(90px, 1fr)); gap: 8px; margin-bottom: 16px; }
        .recruitment-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 14px 0; }
        .recruitment-auto-note { border: 1px solid rgba(34,211,238,0.28); background: rgba(8,145,178,0.10); color: #c8f5ff; border-radius: 12px; padding: 10px 12px; font-size: 12px; font-weight: 700; }
        .recruitment-table { border: 1px solid rgba(59,130,246,0.30); border-radius: 16px; overflow: hidden; background: rgba(7,16,35,0.72); }
        .recruitment-row { display: grid; grid-template-columns: 52px minmax(90px, 0.8fr) minmax(180px, 1.3fr) 72px 90px 96px 96px minmax(130px, 0.8fr); gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid rgba(59,130,246,0.18); }
        .recruitment-row:last-child { border-bottom: 0; }
        .recruitment-row.is-head { background: rgba(15,36,72,0.92); color: #dbeafe; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
        .recruitment-row.is-reserve { background: rgba(250,204,21,0.045); }
        .recruitment-badge { display: inline-flex; width: fit-content; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 12px; border: 1px solid rgba(96,165,250,0.32); background: rgba(96,165,250,0.10); color: #dbeafe; }
        .recruitment-badge.reserve { border-color: rgba(250,204,21,0.42); background: rgba(250,204,21,0.12); color: #fef3c7; }
        .recruitment-badge.reject { border-color: rgba(248,113,113,0.42); background: rgba(248,113,113,0.12); color: #fecaca; }
        .recruitment-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
        @media (max-width: 1180px) { .destruction-recruitment-summary, .destruction-position-strip { grid-template-columns: 1fr 1fr; } .recruitment-row { grid-template-columns: 1fr; } .recruitment-row.is-head { display: none; } .recruitment-actions { justify-content: flex-start; } }
      `}</style>

      <div className="destruction-recruitment-summary">
        <div className="admin-event-detail-card">
          <span>확정 후보</span>
          <strong>{activeApplications.length}명</strong>
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

      <div className="destruction-position-strip">
        {positionCounts.map((item) => {
          const excessive = item.recommendedMax > 0 && item.count > item.recommendedMax;
          return (
            <div key={item.position} className="admin-event-detail-card">
              <span>{item.position}</span>
              <strong>{item.count}명</strong>
              {item.recommendedMax > 0 ? (
                <small style={{ color: excessive ? "#ff8b8b" : "#9db4d8" }}>
                  기준 {item.recommendedMax}명{item.reserveCount > 0 ? ` · 보류 ${item.reserveCount}명` : ""}
                </small>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="empty-box" style={{ marginBottom: 14 }}>
        <strong>자동 보류 기준</strong>
        <p className="admin-page__description" style={{ margin: "8px 0 0" }}>
          모집 현황에 들어오거나 참가 신청/취소가 발생하면 자동으로 보류가 계산됩니다. 21명, 22명처럼 5의 배수가 아니면 늦게 신청한 인원이 보류되고, 20명이어도 TOP 6명처럼 특정 포지션이 팀 수보다 많으면 해당 포지션의 늦은 신청자가 자동 보류됩니다.
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
        <span className="recruitment-auto-note">보류는 자동 계산됩니다.</span>
      </div>

      {filteredApplications.length === 0 ? (
        <div className="empty-box">조건에 맞는 참가 신청자가 없습니다.</div>
      ) : (
        <div className="recruitment-table">
          <div className="recruitment-row is-head">
            <span>No</span>
            <span>이름</span>
            <span>닉네임#태그</span>
            <span>라인</span>
            <span>팀장</span>
            <span>상태</span>
            <span>신청</span>
            <span>관리</span>
          </div>
          {filteredApplications.map((application, index) => {
            const reason = getReserveReason(application, autoReserveIds, applications);
            const status = String(application.status);

            return (
              <div key={application.id} className={status === "RESERVE" ? "recruitment-row is-reserve" : "recruitment-row"}>
                <span>{index + 1}</span>
                <strong>{application.player.name || application.player.nickname}</strong>
                <span>{application.player.nickname}#{application.player.tag}</span>
                <span>{application.mainPosition}</span>
                <span>{application.isCaptain ? "선호" : "비선호"}</span>
                <span>
                  <span className={status === "RESERVE" ? "recruitment-badge reserve" : status === "REJECTED" ? "recruitment-badge reject" : "recruitment-badge"}>
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  {reason ? (
                    <small style={{ display: "block", color: "#fbbf24", marginTop: 4 }}>{reason}</small>
                  ) : null}
                </span>
                <span>{formatDate(application.createdAt)}</span>
                <span className="recruitment-actions">
                  {status === "REJECTED" ? (
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
          팀 또는 경기가 생성된 이후에는 모집 현황에서 신청 상태를 변경할 수 없습니다.
        </div>
      ) : null}
    </div>
  );
}
