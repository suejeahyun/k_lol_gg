"use client";

import { ChevronDown, Plus, RefreshCw, RotateCcw, Scale, Search, UserRoundPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { TEAM_BALANCE_POSITIONS, TEAM_BALANCE_PREFERENCES } from "@/modules/team-tools";

import styles from "../team-tools.module.css";

type Position = (typeof TEAM_BALANCE_POSITIONS)[number];
type Preference = (typeof TEAM_BALANCE_PREFERENCES)[number];
type CandidateOrigin = "ALL" | "SITE" | "KAKAO";

type Row = {
  playerId: string;
  playerLabel: string;
  mainPosition: Position;
  mainPreference: Preference;
  additionalPositions: Position[];
  additionalPreference: Preference;
  allPositions: boolean;
};

type CandidatePlayer = Readonly<{
  playerId: string;
  displayName: string;
  riotId: string;
  mainPosition: Position | "ALL";
  subPositions: readonly (Position | "ALL")[];
  source: "SITE" | "KAKAO";
}>;

type CandidateGroup = Readonly<{
  key: string;
  seasonName: string;
  applyDate: string;
  recruitNo: number;
  sources: readonly ("SITE" | "KAKAO")[];
  players: readonly CandidatePlayer[];
}>;

type PlayerSearchResult = Readonly<{ playerId: string; displayName: string; riotId: string }>;

const positionLabel = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;
const preferenceLabel = { MAIN: "주 포지션", SUB: "부 포지션", AUTO: "자동 배치 가능" } as const;
const originLabel = { ALL: "전체 신청", SITE: "사이트 신청", KAKAO: "카카오톡 신청" } as const;

function initialRows(): Row[] {
  return Array.from({ length: 10 }, (_, index) => ({
    playerId: "",
    playerLabel: "",
    mainPosition: TEAM_BALANCE_POSITIONS[index % 5]!,
    mainPreference: "MAIN",
    additionalPositions: [],
    additionalPreference: "SUB",
    allPositions: false,
  }));
}

function rowFromCandidate(candidate: CandidatePlayer, index: number): Row {
  const allPositions = candidate.mainPosition === "ALL";
  const mainPosition = allPositions ? TEAM_BALANCE_POSITIONS[index % 5]! : candidate.mainPosition;
  return {
    playerId: candidate.playerId,
    playerLabel: `${candidate.displayName} · ${candidate.riotId}`,
    mainPosition,
    mainPreference: allPositions ? "AUTO" : "MAIN",
    additionalPositions: allPositions
      ? []
      : candidate.subPositions.filter((position): position is Position => position !== "ALL" && position !== mainPosition),
    additionalPreference: "SUB",
    allPositions,
  };
}

function eligiblePositions(row: Row) {
  if (row.allPositions) {
    return TEAM_BALANCE_POSITIONS.map((position) => ({ position, preference: "AUTO" as const }));
  }
  return [
    { position: row.mainPosition, preference: row.mainPreference },
    ...row.additionalPositions
      .filter((position) => position !== row.mainPosition)
      .map((position) => ({ position, preference: row.additionalPreference })),
  ];
}

async function responseDetail(response: Response, fallback: string) {
  try {
    const body = await response.json() as { detail?: string };
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}

export function TeamBalanceBuilder() {
  const router = useRouter();
  const [title, setTitle] = useState("오늘의 내전");
  const [rows, setRows] = useState(initialRows);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [stepOneOpen, setStepOneOpen] = useState(true);
  const [stepTwoOpen, setStepTwoOpen] = useState(false);

  const [origin, setOrigin] = useState<CandidateOrigin>("ALL");
  const [candidateGroups, setCandidateGroups] = useState<readonly CandidateGroup[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(true);
  const [candidateMessage, setCandidateMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedRound, setSelectedRound] = useState("");

  const [playerQuery, setPlayerQuery] = useState("");
  const [playerResults, setPlayerResults] = useState<readonly PlayerSearchResult[]>([]);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [playerSearchMessage, setPlayerSearchMessage] = useState("");

  const selectedRows = useMemo(() => rows.filter((row) => row.playerId), [rows]);
  const selectedIds = useMemo(() => new Set(selectedRows.map((row) => row.playerId)), [selectedRows]);
  const availableDates = useMemo(
    () => [...new Set(candidateGroups.map((group) => group.applyDate))],
    [candidateGroups],
  );
  const effectiveDate = availableDates.includes(selectedDate) ? selectedDate : availableDates[0] ?? "";
  const availableRounds = useMemo(
    () => candidateGroups.filter((group) => group.applyDate === effectiveDate).map((group) => group.recruitNo),
    [candidateGroups, effectiveDate],
  );
  const effectiveRound = availableRounds.includes(Number(selectedRound)) ? Number(selectedRound) : availableRounds[0] ?? 0;
  const selectedGroup = candidateGroups.find((group) => group.applyDate === effectiveDate && group.recruitNo === effectiveRound) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    async function loadGroups() {
      setCandidateLoading(true);
      setCandidateMessage("");
      try {
        const response = await fetch(`/api/team-tools/candidates?source=season&origin=${origin}&days=3`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await responseDetail(response, "신청자 목록을 불러오지 못했어요."));
        const body = await response.json() as { groups?: readonly CandidateGroup[]; truncated?: boolean };
        const groups = Array.isArray(body.groups) ? body.groups : [];
        setCandidateGroups(groups);
        if (body.truncated) setCandidateMessage("신청이 많아 최근 500명까지만 표시합니다.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setCandidateGroups([]);
        setCandidateMessage(error instanceof Error ? error.message : "신청자 목록을 불러오지 못했어요.");
      } finally {
        if (!controller.signal.aborted) setCandidateLoading(false);
      }
    }
    void loadGroups();
    return () => controller.abort();
  }, [origin]);

  useEffect(() => {
    const normalized = playerQuery.trim();
    if (!normalized) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPlayerSearchLoading(true);
      setPlayerSearchMessage("");
      try {
        const response = await fetch(`/api/team-tools/candidates?source=players&q=${encodeURIComponent(normalized)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await responseDetail(response, "플레이어를 검색하지 못했어요."));
        const body = await response.json() as { players?: readonly PlayerSearchResult[]; hasMore?: boolean };
        const players = Array.isArray(body.players) ? body.players : [];
        setPlayerResults(players);
        setPlayerSearchMessage(
          body.hasMore ? "검색 결과가 많아요. 닉네임이나 #태그를 더 입력해 주세요." : players.length ? "" : "일치하는 활성 플레이어가 없어요.",
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setPlayerResults([]);
        setPlayerSearchMessage(error instanceof Error ? error.message : "플레이어를 검색하지 못했어요.");
      } finally {
        if (!controller.signal.aborted) setPlayerSearchLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [playerQuery]);

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    setMessage("");
  }

  function addPlayer(player: PlayerSearchResult) {
    if (selectedIds.has(player.playerId)) {
      setPlayerSearchMessage("이미 선택한 플레이어예요.");
      return;
    }
    const emptyIndex = rows.findIndex((row) => !row.playerId);
    if (emptyIndex < 0) {
      setPlayerSearchMessage("참가자 10명이 모두 선택됐어요. 한 명을 빼고 다시 추가해 주세요.");
      return;
    }
    update(emptyIndex, { playerId: player.playerId, playerLabel: `${player.displayName} · ${player.riotId}` });
    setPlayerSearchMessage("");
    if (selectedRows.length === 9) setStepTwoOpen(true);
  }

  function removePlayer(index: number) {
    const fresh = initialRows()[index]!;
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? fresh : row));
    setMessage("");
    setStepOneOpen(true);
  }

  function importGroup() {
    if (!selectedGroup) {
      setCandidateMessage("가져올 날짜와 회차의 신청자가 없어요.");
      return;
    }
    const imported = selectedGroup.players.slice(0, 10);
    const nextRows = initialRows().map((row, index) => imported[index] ? rowFromCandidate(imported[index]!, index) : row);
    setRows(nextRows);
    setMessage("");
    setStepTwoOpen(true);
    setCandidateMessage(
      selectedGroup.players.length > 10
        ? `${selectedGroup.players.length}명 중 접수 순서가 빠른 10명을 가져왔어요.`
        : `${selectedGroup.players.length}명을 가져왔어요.${selectedGroup.players.length < 10 ? " 나머지는 검색으로 추가해 주세요." : ""}`,
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ids = rows.map((row) => row.playerId);
    if (ids.some((id) => !id) || new Set(ids).size !== 10) {
      setMessage("서로 다른 활성 플레이어 10명을 선택해 주세요.");
      setStepOneOpen(true);
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/team-tools/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": '"0"',
          "Idempotency-Key": `team-balance-create-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          title,
          participants: rows.map((row) => ({ playerId: row.playerId, eligiblePositions: eligiblePositions(row) })),
        }),
      });
      const body = await response.json() as { detail?: string; location?: string };
      if (!response.ok || !body.location) throw new Error(body.detail ?? "팀 후보를 계산하지 못했어요.");
      router.push(body.location);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 후보를 계산하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setTitle("오늘의 내전");
    setRows(initialRows());
    setMessage("");
    setCandidateMessage("");
    setPlayerQuery("");
    setPlayerResults([]);
    setPlayerSearchMessage("");
    setStepOneOpen(true);
    setStepTwoOpen(false);
  }

  return (
    <form className={styles.balanceForm} onSubmit={submit}>
      <div className={styles.heading}>
        <div><span>NEW DRAFT</span><h2>두 단계로 팀 만들기</h2></div>
        <strong className={styles.count}>{selectedRows.length} / 10명</strong>
      </div>
      <label className={styles.fieldLabel}>초안 이름<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>

      <section className={styles.balanceStep} aria-labelledby="balance-step-one-title">
        <button className={styles.balanceStepToggle} type="button" aria-expanded={stepOneOpen} onClick={() => setStepOneOpen((open) => !open)}>
          <span><b>1</b><span><strong id="balance-step-one-title">참가자 고르기</strong><small>신청 그룹을 가져오거나 전체 플레이어를 검색하세요.</small></span></span>
          <ChevronDown aria-hidden="true" />
        </button>
        {stepOneOpen ? <div className={styles.balanceStepBody}>
          <div className={styles.candidateImport}>
            <div className={styles.subheading}><div><span>SEASON APPLICATIONS</span><h3>시즌 신청자 가져오기</h3></div><RefreshCw aria-hidden="true" /></div>
            <div className={styles.candidateFilters}>
              <label>출처<select value={origin} onChange={(event) => { setOrigin(event.target.value as CandidateOrigin); setSelectedDate(""); setSelectedRound(""); }}><option value="ALL">전체 신청</option><option value="KAKAO">카카오톡 신청</option><option value="SITE">사이트 신청</option></select></label>
              <label>날짜<select value={effectiveDate} disabled={candidateLoading || availableDates.length === 0} onChange={(event) => { setSelectedDate(event.target.value); setSelectedRound(""); }}>{availableDates.length ? availableDates.map((date) => <option value={date} key={date}>{date}</option>) : <option value="">최근 신청 없음</option>}</select></label>
              <label>회차<select value={effectiveRound || ""} disabled={candidateLoading || availableRounds.length === 0} onChange={(event) => setSelectedRound(event.target.value)}>{availableRounds.length ? availableRounds.map((round) => <option value={round} key={round}>#{round} 내전</option>) : <option value="">회차 없음</option>}</select></label>
              <button type="button" disabled={candidateLoading || !selectedGroup} onClick={importGroup}>{candidateLoading ? "불러오는 중…" : `${originLabel[origin]} 가져오기`}</button>
            </div>
            {selectedGroup ? <p className={styles.fieldHint}>{selectedGroup.seasonName} · {selectedGroup.applyDate} #{selectedGroup.recruitNo} · {selectedGroup.players.length}명 · {selectedGroup.sources.map((source) => originLabel[source]).join(" + ")}</p> : null}
            {candidateMessage ? <p className={styles.notice} role="status" aria-live="polite">{candidateMessage}</p> : null}
          </div>

          <div className={styles.playerPicker}>
            <label htmlFor="team-balance-player-search">전체 플레이어 검색</label>
            <div><Search aria-hidden="true" /><input id="team-balance-player-search" type="search" value={playerQuery} onChange={(event) => { setPlayerQuery(event.target.value); if (!event.target.value.trim()) { setPlayerResults([]); setPlayerSearchMessage(""); } }} placeholder="이름, 닉네임 또는 GameName#TAG" autoComplete="off" maxLength={64} /></div>
            {playerSearchLoading ? <p className={styles.fieldHint} role="status">검색 중…</p> : null}
            {playerResults.length ? <ul className={styles.playerSearchResults}>{playerResults.map((player) => {
              const alreadySelected = selectedIds.has(player.playerId);
              return <li key={player.playerId}><button type="button" disabled={alreadySelected || selectedRows.length >= 10} onClick={() => addPlayer(player)}><span><strong>{player.displayName}</strong><small>{player.riotId}</small></span><span>{alreadySelected ? "선택됨" : <><UserRoundPlus aria-hidden="true" /> 추가</>}</span></button></li>;
            })}</ul> : null}
            {playerSearchMessage ? <p className={styles.fieldHint} role="status" aria-live="polite">{playerSearchMessage}</p> : null}
          </div>

          <div className={styles.selectedRoster} aria-label="선택한 참가자">
            {rows.map((row, index) => row.playerId ? <span key={row.playerId}><b>{index + 1}</b>{row.playerLabel}<button type="button" aria-label={`${row.playerLabel} 선택 해제`} onClick={() => removePlayer(index)}><X aria-hidden="true" /></button></span> : <span data-empty="true" key={`empty-${index}`}><b>{index + 1}</b>참가자 대기</span>)}
          </div>
        </div> : null}
      </section>

      <section className={styles.balanceStep} aria-labelledby="balance-step-two-title">
        <button className={styles.balanceStepToggle} type="button" aria-expanded={stepTwoOpen} onClick={() => setStepTwoOpen((open) => !open)}>
          <span><b>2</b><span><strong id="balance-step-two-title">포지션 확인</strong><small>신청 포지션을 확인하고 필요한 참가자만 펼쳐 수정하세요.</small></span></span>
          <ChevronDown aria-hidden="true" />
        </button>
        {stepTwoOpen ? <div className={styles.balanceStepBody}>
          {selectedRows.length === 0 ? <p className={styles.stepEmpty}>먼저 1단계에서 참가자를 선택해 주세요.</p> : <div className={styles.balanceRows}>
            {rows.map((row, index) => !row.playerId ? null : (
              <details key={row.playerId} className={styles.balanceRowDetails}>
                <summary><span><b>{index + 1}</b><strong>{row.playerLabel}</strong></span><small>{row.allPositions ? "모든 포지션 가능" : `${positionLabel[row.mainPosition]}${row.additionalPositions.length ? ` 외 ${row.additionalPositions.length}` : ""}`}</small></summary>
                <div>
                  <label className={styles.allPositionToggle}><input type="checkbox" checked={row.allPositions} onChange={(event) => update(index, { allPositions: event.target.checked, mainPreference: event.target.checked ? "AUTO" : "MAIN" })} /> 모든 포지션 자동 배치 가능</label>
                  <label>주 포지션<select value={row.mainPosition} disabled={row.allPositions} onChange={(event) => { const mainPosition = event.target.value as Position; update(index, { mainPosition, additionalPositions: row.additionalPositions.filter((position) => position !== mainPosition) }); }}>{TEAM_BALANCE_POSITIONS.map((position) => <option key={position} value={position}>{positionLabel[position]}</option>)}</select></label>
                  <label>주 포지션 선호<select value={row.mainPreference} disabled={row.allPositions} onChange={(event) => update(index, { mainPreference: event.target.value as Preference })}>{TEAM_BALANCE_PREFERENCES.map((preference) => <option key={preference} value={preference}>{preferenceLabel[preference]}</option>)}</select></label>
                  <fieldset className={styles.additionalPositions}><legend>추가 가능 포지션</legend>{TEAM_BALANCE_POSITIONS.filter((position) => position !== row.mainPosition).map((position) => <label key={position}><input type="checkbox" disabled={row.allPositions} checked={row.additionalPositions.includes(position)} onChange={(event) => update(index, { additionalPositions: event.target.checked ? [...row.additionalPositions, position] : row.additionalPositions.filter((current) => current !== position) })} /> {positionLabel[position]}</label>)}</fieldset>
                  <label>추가 포지션 선호<select value={row.additionalPreference} disabled={row.allPositions || row.additionalPositions.length === 0} onChange={(event) => update(index, { additionalPreference: event.target.value as Preference })}>{TEAM_BALANCE_PREFERENCES.map((preference) => <option key={preference} value={preference}>{preferenceLabel[preference]}</option>)}</select></label>
                </div>
              </details>
            ))}
          </div>}
        </div> : null}
      </section>

      {message ? <p className={styles.error} role="alert">{message}</p> : null}
      <div className={styles.actions}>
        <button className={styles.primaryButton} type="submit" disabled={pending || selectedRows.length !== 10}><Scale size={18} aria-hidden="true" /> {pending ? "계산 중…" : "상위 3개 계산"}</button>
        <button className={styles.secondaryButton} type="button" disabled={pending} onClick={reset}><RotateCcw size={17} aria-hidden="true" /> 입력 초기화</button>
        <span className={styles.stageHint}><Plus size={14} aria-hidden="true" /> 표본이 없으면 중립 점수 50으로 계산합니다.</span>
      </div>
    </form>
  );
}
