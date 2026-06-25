"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateDestructionCaptainPoints } from "@/lib/destruction/captain-points";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type ApplyStatus =
  | "APPLIED"
  | "CONFIRMED"
  | "REJECTED"
  | "RESERVE"
  | "CANCELLED";

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
  player: Player;
};

type ExistingTeam = {
  id: number;
  name: string;
  captainId: number;
  initialAuctionPoints: number;
  remainingAuctionPoints: number;
  captain: Player;
};

type Props = {
  tournamentId: number;
  applications: Application[];
  existingTeams: ExistingTeam[];
  hasMatches: boolean;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function getRequiredCaptainCount(applicationCount: number) {
  if (applicationCount === 0 || applicationCount % 5 !== 0) return 0;
  return applicationCount / 5;
}

function toDefaultTeamName(application: Application) {
  return `${application.player.name || application.player.nickname}팀`;
}

function matchesSearch(application: Application, keyword: string) {
  const value = keyword.trim().toLowerCase();
  if (!value) return true;

  const haystack = [
    application.player.name,
    application.player.nickname,
    application.player.tag,
    `${application.player.nickname}#${application.player.tag}`,
    application.mainPosition,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(value);
}

function getStatusMessage(
  activeCount: number,
  requiredCaptainCount: number,
  selectedCount: number,
) {
  if (activeCount === 0) return "참가 신청을 먼저 받아야 합니다.";
  if (activeCount % 5 !== 0)
    return `참가자 수가 5의 배수가 아닙니다. 현재 ${activeCount}명입니다.`;
  if (selectedCount < requiredCaptainCount)
    return `팀장 ${requiredCaptainCount - selectedCount}명을 더 지정해야 합니다.`;
  if (selectedCount > requiredCaptainCount)
    return `팀장이 ${selectedCount - requiredCaptainCount}명 초과되었습니다.`;
  return "팀장 수가 맞습니다. 팀명과 포인트를 확인한 뒤 경매 단계로 이동할 수 있습니다.";
}

export default function DestructionTeamForm({
  tournamentId,
  applications,
  existingTeams,
  hasMatches,
}: Props) {
  const router = useRouter();
  const existingTeamByCaptainId = useMemo(() => {
    return new Map(existingTeams.map((team) => [team.captainId, team]));
  }, [existingTeams]);

  const [selectedCaptainIds, setSelectedCaptainIds] = useState<number[]>(
    existingTeams.length > 0 ? existingTeams.map((team) => team.captainId) : [],
  );
  const [teamNames, setTeamNames] = useState<Record<number, string>>(() => {
    const value: Record<number, string> = {};
    for (const application of applications) {
      const existing = existingTeamByCaptainId.get(application.playerId);
      value[application.playerId] =
        existing?.name ?? toDefaultTeamName(application);
    }
    return value;
  });
  const [points, setPoints] = useState<Record<number, string>>(() => {
    const value: Record<number, string> = {};
    for (const application of applications) {
      const existing = existingTeamByCaptainId.get(application.playerId);
      if (existing) {
        value[application.playerId] = String(existing.initialAuctionPoints);
      }
    }
    return value;
  });
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showAllApplicants, setShowAllApplicants] = useState(false);
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeApplications = useMemo(
    () =>
      applications.filter(
        (application) =>
          application.status === "APPLIED" ||
          application.status === "CONFIRMED",
      ),
    [applications],
  );

  const requiredCaptainCount = getRequiredCaptainCount(
    activeApplications.length,
  );
  const preferredCount = activeApplications.filter(
    (application) => application.isCaptain,
  ).length;
  const selectedCount = selectedCaptainIds.length;
  const canCreateTeams =
    requiredCaptainCount > 0 &&
    selectedCount === requiredCaptainCount &&
    !hasMatches;

  const applicationByPlayerId = useMemo(() => {
    return new Map(
      activeApplications.map((application) => [
        application.playerId,
        application,
      ]),
    );
  }, [activeApplications]);

  const selectedApplications = useMemo(() => {
    return selectedCaptainIds
      .map((playerId) => applicationByPlayerId.get(playerId))
      .filter((application): application is Application =>
        Boolean(application),
      );
  }, [applicationByPlayerId, selectedCaptainIds]);

  const autoPointDetails = useMemo(() => {
    return calculateDestructionCaptainPoints(
      selectedApplications.map((application) => ({
        participantId: application.playerId,
        currentTier: application.player.currentTier,
        peakTier: application.player.peakTier,
        lane: application.mainPosition,
      })),
    );
  }, [selectedApplications]);

  const autoPointByPlayerId = useMemo(() => {
    return new Map(
      autoPointDetails.map((detail) => [detail.participantId, detail]),
    );
  }, [autoPointDetails]);

  useEffect(() => {
    if (autoPointDetails.length === 0 || hasMatches) return;

    setPoints((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const detail of autoPointDetails) {
        const existing = existingTeamByCaptainId.get(detail.participantId);
        if (existing) continue;

        const currentValue = next[detail.participantId];
        if (
          currentValue === undefined ||
          currentValue === "" ||
          currentValue === "100"
        ) {
          next[detail.participantId] = String(detail.auctionPoint);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [autoPointDetails, existingTeamByCaptainId, hasMatches]);

  const applyAutoPoints = () => {
    if (hasMatches || autoPointDetails.length === 0) return;

    setPoints((prev) => {
      const next = { ...prev };
      for (const detail of autoPointDetails) {
        next[detail.participantId] = String(detail.auctionPoint);
      }
      return next;
    });
  };

  const candidateApplications = activeApplications.filter((application) => {
    if (!showAllApplicants && !application.isCaptain) return false;
    if (positionFilter !== "ALL" && application.mainPosition !== positionFilter)
      return false;
    return matchesSearch(application, searchKeyword);
  });

  const positionCounts = POSITIONS.map((position) => ({
    position,
    count: activeApplications.filter(
      (application) => application.mainPosition === position,
    ).length,
  }));

  const toggleCaptain = (playerId: number) => {
    if (hasMatches) return;

    setSelectedCaptainIds((prev) => {
      if (prev.includes(playerId)) {
        setError("");
        return prev.filter((id) => id !== playerId);
      }
      if (requiredCaptainCount > 0 && prev.length >= requiredCaptainCount) {
        setError(
          `팀장은 정확히 ${requiredCaptainCount}명까지만 지정할 수 있습니다.`,
        );
        return prev;
      }
      setError("");
      return [...prev, playerId];
    });
  };

  const handleSubmit = async () => {
    setError("");

    if (activeApplications.length === 0) {
      setError(
        "참가 신청자가 없습니다. 유저 페이지에서 참가 신청을 먼저 받아주세요.",
      );
      return;
    }

    if (activeApplications.length % 5 !== 0) {
      setError(
        `참가자 수가 5의 배수가 아닙니다. 현재 ${activeApplications.length}명입니다.`,
      );
      return;
    }

    if (selectedCaptainIds.length !== requiredCaptainCount) {
      setError(`팀장은 정확히 ${requiredCaptainCount}명을 지정해야 합니다.`);
      return;
    }

    const teams = selectedCaptainIds.map((captainId) => {
      const application = applicationByPlayerId.get(captainId);
      return {
        name:
          (teamNames[captainId] ?? "").trim() ||
          (application ? toDefaultTeamName(application) : "팀"),
        captainId,
        captainPosition: application?.mainPosition,
        initialAuctionPoints: Number(
          points[captainId] ??
            autoPointByPlayerId.get(captainId)?.auctionPoint ??
            0,
        ),
      };
    });

    const hasInvalidPosition = teams.some((team) => !team.captainPosition);
    if (hasInvalidPosition) {
      setError("팀장 포지션 정보를 찾을 수 없습니다.");
      return;
    }

    const hasInvalidPoints = teams.some(
      (team) =>
        !Number.isInteger(team.initialAuctionPoints) ||
        team.initialAuctionPoints < 0,
    );
    if (hasInvalidPoints) {
      setError("팀장 지급 포인트는 0 이상의 정수로 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/teams`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ teams }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "팀장 지정 및 경매 단계 전환 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("팀장 지정 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="destruction-team-form destruction-admin-panel-wide">
      <style>{`
        .destruction-captain-summary { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .destruction-position-strip { display: grid; grid-template-columns: repeat(5, minmax(90px, 1fr)); gap: 8px; margin-bottom: 18px; }
        .destruction-captain-layout { display: grid; grid-template-columns: minmax(420px, 1.2fr) minmax(360px, 0.8fr); gap: 18px; align-items: start; }
        .destruction-candidate-panel, .destruction-selected-panel { border: 1px solid rgba(59,130,246,0.32); border-radius: 18px; background: rgba(7,16,35,0.72); padding: 16px; }
        .destruction-candidate-toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 14px; }
        .destruction-candidate-list { display: grid; gap: 8px; max-height: 560px; overflow: auto; padding-right: 4px; }
        .destruction-candidate-row { display: grid; grid-template-columns: minmax(90px, 0.8fr) minmax(170px, 1.3fr) 70px 86px 90px; gap: 8px; align-items: center; border: 1px solid rgba(59,130,246,0.26); border-radius: 12px; padding: 10px; background: rgba(15,23,42,0.42); }
        .captain-selected-list { display: grid; gap: 10px; }
        .captain-selected-card { border: 1px solid rgba(34,197,94,0.32); background: rgba(34,197,94,0.07); border-radius: 14px; padding: 12px; display: grid; gap: 9px; }
        .captain-selected-card__head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
        .captain-selected-card__inputs { display: grid; grid-template-columns: 1fr 110px; gap: 8px; }
        .captain-status-note { border-radius: 14px; border: 1px solid rgba(96,165,250,0.26); background: rgba(96,165,250,0.08); padding: 12px; margin-bottom: 14px; color: #dbeafe; }
        @media (max-width: 1080px) { .destruction-captain-layout, .destruction-captain-summary, .destruction-position-strip { grid-template-columns: 1fr; } .destruction-candidate-row { grid-template-columns: 1fr; } .captain-selected-card__inputs { grid-template-columns: 1fr; } }
      `}</style>

      <div className="destruction-captain-summary">
        <div className="admin-event-detail-card">
          <span>확정 후보</span>
          <strong>{activeApplications.length}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>필요 팀장</span>
          <strong>
            {requiredCaptainCount > 0
              ? `${requiredCaptainCount}명`
              : "산정 불가"}
          </strong>
        </div>
        <div className="admin-event-detail-card">
          <span>지정 팀장</span>
          <strong>{selectedCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>팀장 선호</span>
          <strong>{preferredCount}명</strong>
        </div>
      </div>

      <div className="destruction-position-strip">
        {positionCounts.map((item) => (
          <div key={item.position} className="admin-event-detail-card">
            <span>{item.position}</span>
            <strong>{item.count}명</strong>
          </div>
        ))}
      </div>

      <div className="captain-status-note">
        {getStatusMessage(
          activeApplications.length,
          requiredCaptainCount,
          selectedCount,
        )}
      </div>

      {activeApplications.length === 0 ? (
        <div className="empty-box">
          참가 신청자가 없습니다. 유저 참가 페이지에서 신청을 받은 뒤 팀장을
          지정하세요.
        </div>
      ) : null}

      <div className="destruction-captain-layout">
        <section className="destruction-candidate-panel">
          <div className="admin-page__header">
            <div>
              <h3 className="admin-event-section-title">팀장 후보 검색</h3>
              <p className="admin-page__description">
                기본은 팀장 선호자만 표시합니다. 부족하면 비선호자를 포함해
                검색해서 지정하세요.
              </p>
            </div>
          </div>

          <div className="destruction-candidate-toolbar">
            <input
              className="admin-form__input"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="이름, 닉네임, 태그, 포지션 검색"
              style={{ minWidth: 220, flex: "1 1 220px" }}
            />
            <select
              className="admin-form__input"
              value={positionFilter}
              onChange={(event) => setPositionFilter(event.target.value)}
              style={{ minWidth: 120 }}
            >
              <option value="ALL">전체 라인</option>
              {POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="chip-button"
              onClick={() => setShowAllApplicants((prev) => !prev)}
            >
              {showAllApplicants ? "팀장 선호만" : "비선호 포함"}
            </button>
          </div>

          <div className="destruction-candidate-list">
            {candidateApplications.length === 0 ? (
              <div className="empty-box">조건에 맞는 후보가 없습니다.</div>
            ) : (
              candidateApplications.map((application) => {
                const selected = selectedCaptainIds.includes(
                  application.playerId,
                );
                return (
                  <div
                    key={application.id}
                    className="destruction-candidate-row"
                  >
                    <strong>
                      {application.player.name || application.player.nickname}
                    </strong>
                    <span>
                      {application.player.nickname}#{application.player.tag}
                    </span>
                    <span>{application.mainPosition}</span>
                    <span>{application.isCaptain ? "선호" : "비선호"}</span>
                    <button
                      type="button"
                      className={
                        selected ? "chip-button danger" : "chip-button"
                      }
                      onClick={() => toggleCaptain(application.playerId)}
                      disabled={hasMatches || isSubmitting}
                    >
                      {selected ? "해제" : "지정"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="destruction-selected-panel">
          <div className="admin-page__header">
            <div>
              <h3 className="admin-event-section-title">
                지정된 팀장 · 포인트
              </h3>
              <p className="admin-page__description">
                팀장으로 확정할 사람만 표시합니다. 포인트는 티어/라인 기준
                역비율 정규화 방식으로 자동 산정되며, 필요 시 수동 수정할 수
                있습니다.
              </p>
            </div>
          </div>

          <div className="captain-status-note" style={{ marginTop: 0 }}>
            낮은 티어/라인 기준값 참가자는 2000점, 높은 티어/라인 기준값
            참가자는 800점에 가까워지도록 자동 계산합니다.
            <button
              type="button"
              className="chip-button"
              onClick={applyAutoPoints}
              disabled={
                hasMatches || isSubmitting || autoPointDetails.length === 0
              }
              style={{ marginLeft: 8 }}
            >
              자동 포인트 다시 적용
            </button>
          </div>

          <div className="captain-selected-list">
            {selectedApplications.length === 0 ? (
              <div className="empty-box">아직 지정된 팀장이 없습니다.</div>
            ) : (
              selectedApplications.map((application) => {
                const autoPoint = autoPointByPlayerId.get(application.playerId);
                return (
                  <div key={application.id} className="captain-selected-card">
                    <div className="captain-selected-card__head">
                      <div>
                        <strong>
                          {application.player.name ||
                            application.player.nickname}
                        </strong>
                        <p
                          className="admin-page__description"
                          style={{ margin: "4px 0 0" }}
                        >
                          {application.player.nickname}#{application.player.tag}{" "}
                          · {application.mainPosition} ·{" "}
                          {application.isCaptain ? "선호" : "비선호"}
                        </p>
                        {autoPoint ? (
                          <p
                            className="admin-page__description"
                            style={{ margin: "4px 0 0" }}
                          >
                            자동 기준: {autoPoint.tierLabel} /{" "}
                            {autoPoint.laneKey} · 기준값 {autoPoint.powerValue}{" "}
                            · 자동 {autoPoint.auctionPoint}점
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="chip-button danger"
                        onClick={() => toggleCaptain(application.playerId)}
                        disabled={hasMatches || isSubmitting}
                      >
                        해제
                      </button>
                    </div>

                    <div className="captain-selected-card__inputs">
                      <input
                        className="admin-form__input"
                        value={
                          teamNames[application.playerId] ??
                          toDefaultTeamName(application)
                        }
                        onChange={(event) =>
                          setTeamNames((prev) => ({
                            ...prev,
                            [application.playerId]: event.target.value,
                          }))
                        }
                        disabled={hasMatches || isSubmitting}
                        placeholder="팀명"
                      />
                      <input
                        className="admin-form__input"
                        type="number"
                        min="0"
                        value={
                          points[application.playerId] ??
                          String(autoPoint?.auctionPoint ?? "")
                        }
                        onChange={(event) =>
                          setPoints((prev) => ({
                            ...prev,
                            [application.playerId]: event.target.value,
                          }))
                        }
                        disabled={hasMatches || isSubmitting}
                        placeholder="포인트"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            className="admin-page__create-button"
            onClick={handleSubmit}
            disabled={!canCreateTeams || isSubmitting}
            style={{ width: "100%", marginTop: 16 }}
          >
            {isSubmitting
              ? "저장 중..."
              : existingTeams.length > 0
                ? "팀장/포인트 다시 저장"
                : "팀 생성 및 경매 시작"}
          </button>

          {error ? <p className="notice-form__error">{error}</p> : null}
        </section>
      </div>
    </div>
  );
}
