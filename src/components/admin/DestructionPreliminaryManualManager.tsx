"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Team = {
  id: number;
  name: string;
  preliminaryGroup?: string | null;
  captain: {
    nickname: string;
    tag: string;
  };
  members: Array<{ id: number }>;
};

type PreliminaryMatch = {
  id: number;
  round: number;
  preliminaryGroup?: string | null;
  teamAId: number;
  teamBId: number;
  winnerTeamId: number | null;
  bestOf: number;
  isConfirmed: boolean;
};

type ManualMatchRow = {
  localId: string;
  round: number;
  preliminaryGroup: string;
  teamAId: number | "";
  teamBId: number | "";
  bestOf: 1 | 3 | 5;
};

type Props = {
  tournamentId: number;
  teams: Team[];
  matches: PreliminaryMatch[];
  preliminaryBestOf: number;
  hasInvalidTeamSize: boolean;
};

const GROUP_OPTIONS = ["A", "B", "C", "D"];

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBestOf(value: number) {
  if (value <= 1) return 1;
  if (value <= 3) return 3;
  return 5;
}

function getGroupLabel(group?: string | null) {
  return group ? `${group}조` : "미지정";
}

export default function DestructionPreliminaryManualManager({
  tournamentId,
  teams,
  matches,
  preliminaryBestOf,
  hasInvalidTeamSize,
}: Props) {
  const router = useRouter();
  const defaultBestOf = normalizeBestOf(preliminaryBestOf);
  const hasResult = matches.some((match) => Boolean(match.winnerTeamId));
  const hasSavedMatches = matches.length > 0;
  const allConfirmed = hasSavedMatches && matches.every((match) => match.isConfirmed);
  const hasDraftMatches = hasSavedMatches && matches.some((match) => !match.isConfirmed);

  const [groupAssignments, setGroupAssignments] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    teams.forEach((team) => {
      initial[team.id] = team.preliminaryGroup ?? "";
    });
    return initial;
  });
  const [rows, setRows] = useState<ManualMatchRow[]>(() => {
    if (matches.length === 0) return [];

    return matches
      .slice()
      .sort((a, b) => {
        const groupCompare = (a.preliminaryGroup ?? "").localeCompare(b.preliminaryGroup ?? "");
        if (groupCompare !== 0) return groupCompare;
        return a.round - b.round;
      })
      .map((match) => ({
        localId: createLocalId(),
        round: match.round,
        preliminaryGroup: match.preliminaryGroup ?? "",
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        bestOf: normalizeBestOf(match.bestOf),
      }));
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const teamNameById = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [teams]);

  const groupedTeamSummary = useMemo(() => {
    const summary = new Map<string, string[]>();

    teams.forEach((team) => {
      const group = groupAssignments[team.id] || "";
      if (!group) return;

      const current = summary.get(group) ?? [];
      current.push(team.name);
      summary.set(group, current);
    });

    return Array.from(summary.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [groupAssignments, teams]);

  const markDirty = () => {
    setError("");
    setMessage("");
    setIsDirty(true);
  };

  const updateGroup = (teamId: number, value: string) => {
    markDirty();
    setGroupAssignments((current) => ({ ...current, [teamId]: value }));
  };

  const addRow = () => {
    markDirty();
    setRows((current) => [
      ...current,
      {
        localId: createLocalId(),
        round: current.length + 1,
        preliminaryGroup: "",
        teamAId: "",
        teamBId: "",
        bestOf: defaultBestOf,
      },
    ]);
  };

  const updateRow = <K extends keyof ManualMatchRow>(
    localId: string,
    key: K,
    value: ManualMatchRow[K],
  ) => {
    markDirty();
    setRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, [key]: value } : row)),
    );
  };

  const removeRow = (localId: string) => {
    markDirty();
    setRows((current) =>
      current
        .filter((row) => row.localId !== localId)
        .map((row, index) => ({ ...row, round: index + 1 })),
    );
  };

  const assignAlternatingGroups = () => {
    markDirty();
    const next: Record<number, string> = {};
    teams.forEach((team, index) => {
      next[team.id] = index % 2 === 0 ? "A" : "B";
    });
    setGroupAssignments(next);
  };

  const fillFullRoundRobin = () => {
    markDirty();

    const generated: ManualMatchRow[] = [];
    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        generated.push({
          localId: createLocalId(),
          round: generated.length + 1,
          preliminaryGroup: "",
          teamAId: teams[i].id,
          teamBId: teams[j].id,
          bestOf: defaultBestOf,
        });
      }
    }

    setRows(generated);
  };

  const fillGroupRoundRobin = () => {
    markDirty();

    const generated: ManualMatchRow[] = [];
    const groups = GROUP_OPTIONS
      .map((group) => ({
        group,
        teams: teams.filter((team) => groupAssignments[team.id] === group),
      }))
      .filter((entry) => entry.teams.length >= 2);

    if (groups.length === 0) {
      setError("2팀 이상 들어간 조가 없습니다. 먼저 A조/B조를 지정해주세요.");
      return;
    }

    groups.forEach(({ group, teams: groupTeams }) => {
      for (let i = 0; i < groupTeams.length; i += 1) {
        for (let j = i + 1; j < groupTeams.length; j += 1) {
          generated.push({
            localId: createLocalId(),
            round: generated.length + 1,
            preliminaryGroup: group,
            teamAId: groupTeams[i].id,
            teamBId: groupTeams[j].id,
            bestOf: defaultBestOf,
          });
        }
      }
    });

    setRows(generated);
  };

  const validateRows = () => {
    if (rows.length === 0) return "저장할 예선 경기를 1개 이상 추가해주세요.";

    const roundSet = new Set<number>();

    for (const row of rows) {
      if (!row.round || row.round <= 0) return "경기 번호는 1 이상이어야 합니다.";
      if (roundSet.has(row.round)) return "경기 번호가 중복되었습니다.";
      roundSet.add(row.round);

      if (!row.teamAId || !row.teamBId) return "모든 경기의 양쪽 팀을 선택해주세요.";
      if (row.teamAId === row.teamBId) return "같은 팀끼리는 예선 경기를 만들 수 없습니다.";
    }

    return "";
  };

  const save = async (saveMatches: boolean) => {
    setError("");
    setMessage("");

    if (saveMatches) {
      if (hasInvalidTeamSize) {
        setError("각 팀은 5명이고 포지션 중복이 없어야 예선 경기를 저장할 수 있습니다.");
        return;
      }

      if (hasResult) {
        setError("이미 결과가 입력된 예선 경기가 있어 경기 편성을 다시 저장할 수 없습니다. 조 저장만 가능합니다.");
        return;
      }

      const rowError = validateRows();
      if (rowError) {
        setError(rowError);
        return;
      }
    }

    setIsSaving(true);

    try {
      const res = await fetch(`/api/destruction-tournaments/${tournamentId}/preliminary/manual`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveMatches,
          groupAssignments: teams.map((team) => ({
            teamId: team.id,
            preliminaryGroup: groupAssignments[team.id] || null,
          })),
          matches: rows.map((row) => ({
            round: row.round,
            preliminaryGroup: row.preliminaryGroup || null,
            teamAId: row.teamAId,
            teamBId: row.teamBId,
            bestOf: row.bestOf,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "수동 예선 편성 저장 실패");
        return;
      }

      setIsDirty(false);
      setMessage(saveMatches ? "확정 전 상태로 조 편성과 예선 경기 편성을 저장했습니다. 확인 후 예선 편성 확정을 눌러주세요." : "조 편성을 저장했습니다.");
      router.refresh();
    } catch {
      setError("수동 예선 편성 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfirmation = async (isConfirmed: boolean) => {
    setError("");
    setMessage("");

    if (isDirty) {
      setError("수정한 내용이 있습니다. 먼저 확정 전 편성 저장을 눌러주세요.");
      return;
    }

    if (!hasSavedMatches) {
      setError("확정할 예선 경기가 없습니다. 먼저 예선 편성을 저장해주세요.");
      return;
    }

    if (!isConfirmed && hasResult) {
      setError("이미 결과가 입력된 예선 경기가 있어 확정 취소를 할 수 없습니다.");
      return;
    }

    setIsConfirming(true);

    try {
      const res = await fetch(`/api/destruction-tournaments/${tournamentId}/preliminary/confirm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isConfirmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "예선 편성 확정 상태 변경 실패");
        return;
      }

      setMessage(isConfirmed ? "예선 편성을 확정했습니다. 이제 결과 입력이 가능합니다." : "예선 편성 확정을 취소했습니다. 다시 수정할 수 있습니다.");
      router.refresh();
    } catch {
      setError("예선 편성 확정 상태 변경 중 오류가 발생했습니다.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <section
      className="admin-form"
      style={{
        display: "grid",
        gap: 18,
        marginBottom: 18,
        border: "1px solid rgba(56, 189, 248, 0.20)",
        background: "rgba(8, 18, 34, 0.66)",
      }}
    >
      <div className="admin-page__header" style={{ paddingBottom: 0 }}>
        <div>
          <h3 className="admin-event-section-title">수동 조 / 예선 편성</h3>
          <p className="admin-page__description">
            생성된 예선도 결과 입력 전까지 확정 전 상태로 수정할 수 있습니다. 편성을 저장한 뒤 최종 확인이 끝나면 예선 편성 확정을 누르세요.
          </p>
        </div>

        <div className="admin-event-detail-actions">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 34,
              padding: "7px 10px",
              borderRadius: 999,
              border: allConfirmed ? "1px solid rgba(34, 211, 238, 0.55)" : "1px solid rgba(250, 204, 21, 0.45)",
              background: allConfirmed ? "rgba(14, 165, 233, 0.16)" : "rgba(250, 204, 21, 0.08)",
              color: allConfirmed ? "#7dd3fc" : "#fde68a",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {allConfirmed ? "예선 편성 확정됨" : hasDraftMatches ? "확정 전 편성" : "편성 미저장"}
          </span>
          <button type="button" className="chip-button" onClick={assignAlternatingGroups} disabled={isSaving || isConfirming || hasResult}>
            A/B 자동 배치
          </button>
          <button type="button" className="chip-button" onClick={fillGroupRoundRobin} disabled={isSaving || isConfirming || hasResult}>
            조별 풀리그 채우기
          </button>
          <button type="button" className="chip-button" onClick={fillFullRoundRobin} disabled={isSaving || isConfirming || hasResult}>
            전체 풀리그 채우기
          </button>
        </div>
      </div>

      <div className="empty-box" style={{ display: "grid", gap: 4 }}>
        <strong>확정 전 흐름</strong>
        <span>1) 조/대진 수정 → 2) 확정 전 편성 저장 → 3) 예선 편성 확정 → 4) 결과 입력</span>
        <span>확정 후에도 결과 입력 전이면 다시 수정 저장이 가능합니다. 수정 저장 시 편성은 자동으로 확정 전 상태가 됩니다.</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {teams.map((team) => (
          <label
            key={team.id}
            style={{
              display: "grid",
              gap: 8,
              padding: 14,
              border: "1px solid rgba(148, 163, 184, 0.20)",
              borderRadius: 16,
              background: "rgba(15, 23, 42, 0.46)",
            }}
          >
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#e5f3ff", fontWeight: 800 }}>
              {team.name}
              <em style={{ color: "#93a4c5", fontStyle: "normal", fontSize: 12 }}>{team.members.length}/5명</em>
            </span>
            <span style={{ color: "#93a4c5", fontSize: 12 }}>
              팀장: {team.captain.nickname}#{team.captain.tag}
            </span>
            <select
              value={groupAssignments[team.id] ?? ""}
              onChange={(event) => updateGroup(team.id, event.target.value)}
              disabled={hasResult}
              style={{ minHeight: 38 }}
            >
              <option value="">미지정</option>
              {GROUP_OPTIONS.map((group) => (
                <option key={group} value={group}>
                  {group}조
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {groupedTeamSummary.length ? (
        <div className="empty-box" style={{ display: "grid", gap: 6 }}>
          {groupedTeamSummary.map(([group, names]) => (
            <span key={group}>
              <strong>{getGroupLabel(group)}</strong>: {names.join(", ")}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong style={{ color: "#e5f3ff" }}>예선 경기 목록</strong>
          <button type="button" className="chip-button" onClick={addRow} disabled={isSaving || isConfirming || hasResult}>
            경기 추가
          </button>
        </div>

        {hasResult ? (
          <div className="empty-box">이미 결과가 입력된 예선 경기가 있어 경기 목록 수정은 잠겨 있습니다. 조 저장만 가능합니다.</div>
        ) : null}

        {rows.length === 0 ? (
          <div className="empty-box">아직 편성된 예선 경기가 없습니다. 조별 풀리그 채우기 또는 경기 추가를 사용하세요.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((row) => (
              <div
                key={row.localId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 8,
                  alignItems: "center",
                  padding: 10,
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: 14,
                  background: "rgba(2, 6, 23, 0.28)",
                }}
              >
                <input
                  type="number"
                  min={1}
                  value={row.round}
                  onChange={(event) => updateRow(row.localId, "round", Number(event.target.value))}
                  disabled={hasResult}
                  aria-label="경기 번호"
                />
                <select
                  value={row.preliminaryGroup}
                  onChange={(event) => updateRow(row.localId, "preliminaryGroup", event.target.value)}
                  disabled={hasResult}
                  aria-label="조"
                >
                  <option value="">미지정</option>
                  {GROUP_OPTIONS.map((group) => (
                    <option key={group} value={group}>
                      {group}조
                    </option>
                  ))}
                </select>
                <select
                  value={row.teamAId}
                  onChange={(event) => updateRow(row.localId, "teamAId", event.target.value ? Number(event.target.value) : "")}
                  disabled={hasResult}
                  aria-label="A팀"
                >
                  <option value="">A팀 선택</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <select
                  value={row.teamBId}
                  onChange={(event) => updateRow(row.localId, "teamBId", event.target.value ? Number(event.target.value) : "")}
                  disabled={hasResult}
                  aria-label="B팀"
                >
                  <option value="">B팀 선택</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <select
                  value={row.bestOf}
                  onChange={(event) => updateRow(row.localId, "bestOf", Number(event.target.value) as 1 | 3 | 5)}
                  disabled={hasResult}
                  aria-label="BO"
                >
                  <option value={1}>BO1</option>
                  <option value={3}>BO3</option>
                  <option value={5}>BO5</option>
                </select>
                <button type="button" className="chip-button" onClick={() => removeRow(row.localId)} disabled={hasResult}>
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {rows.length ? (
        <div className="empty-box" style={{ display: "grid", gap: 6 }}>
          {rows.map((row) => (
            <span key={`preview-${row.localId}`}>
              {row.round}경기 · {getGroupLabel(row.preliminaryGroup)} · {row.teamAId ? teamNameById.get(Number(row.teamAId)) : "A팀 미정"} vs {row.teamBId ? teamNameById.get(Number(row.teamBId)) : "B팀 미정"} · BO{row.bestOf}
            </span>
          ))}
        </div>
      ) : null}

      <div className="admin-event-detail-actions">
        <button type="button" className="chip-button" onClick={() => save(false)} disabled={isSaving || isConfirming}>
          {isSaving ? "저장 중..." : "조 저장"}
        </button>
        <button
          type="button"
          className="chip-button"
          onClick={() => save(true)}
          disabled={isSaving || isConfirming || hasResult || hasInvalidTeamSize}
        >
          {isSaving ? "저장 중..." : "확정 전 편성 저장"}
        </button>
        <button
          type="button"
          className="admin-page__create-button"
          onClick={() => updateConfirmation(true)}
          disabled={isSaving || isConfirming || allConfirmed || !hasSavedMatches || isDirty || hasInvalidTeamSize}
        >
          {isConfirming ? "처리 중..." : "예선 편성 확정"}
        </button>
        {allConfirmed && !hasResult ? (
          <button
            type="button"
            className="chip-button"
            onClick={() => updateConfirmation(false)}
            disabled={isSaving || isConfirming}
          >
            확정 취소
          </button>
        ) : null}
      </div>

      {isDirty ? <p style={{ margin: 0, color: "#fde68a", fontWeight: 800 }}>수정한 내용이 있습니다. 확정 전 편성 저장 후 확정할 수 있습니다.</p> : null}
      {message ? <p style={{ margin: 0, color: "#67e8f9", fontWeight: 800 }}>{message}</p> : null}
      {error ? <p className="notice-form__error">{error}</p> : null}
    </section>
  );
}
