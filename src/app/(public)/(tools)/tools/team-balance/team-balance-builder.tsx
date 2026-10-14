"use client";
import { recordUsageAction } from "@/components/usage/usage-actions";

import { ChevronDown, Plus, RefreshCw, RotateCcw, Scale, Search, UserRoundPlus, X } from "@/components/theme/theme-icons";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { TEAM_BALANCE_POSITIONS, TEAM_BALANCE_PREFERENCES } from "@/modules/team-tools";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";

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
  allowAutofill: boolean;
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
const preferenceOptions = TEAM_BALANCE_PREFERENCES.map((value) => ({ value, label: preferenceLabel[value] }));

function SingleChoice<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly Readonly<{ value: T; label: string }>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.choiceField} disabled={disabled}>
      <legend>{label}</legend>
      <div className={styles.choiceButtons} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={value === option.value}
            data-selected={value === option.value ? "true" : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function initialRows(): Row[] {
  return Array.from({ length: 10 }, (_, index) => ({
    playerId: "",
    playerLabel: "",
    mainPosition: TEAM_BALANCE_POSITIONS[index % 5]!,
    mainPreference: "MAIN",
    additionalPositions: [],
    additionalPreference: "SUB",
    allPositions: false,
    allowAutofill: false,
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
      : candidate.subPositions.includes("ALL")
        ? TEAM_BALANCE_POSITIONS.filter((position) => position !== mainPosition)
        : candidate.subPositions.filter((position): position is Position => position !== "ALL" && position !== mainPosition),
    additionalPreference: "SUB",
    allPositions,
    allowAutofill: false,
  };
}

function eligiblePositions(row: Row) {
  if (row.allPositions) {
    return TEAM_BALANCE_POSITIONS.map((position) => ({ position, preference: "AUTO" as const }));
  }
  const selected = [
    { position: row.mainPosition, preference: row.mainPreference },
    ...row.additionalPositions
      .filter((position) => position !== row.mainPosition)
      .map((position) => ({ position, preference: row.additionalPreference })),
  ];
  return row.allowAutofill
    ? [...selected, ...TEAM_BALANCE_POSITIONS.filter((position) => !selected.some((entry) => entry.position === position)).map((position) => ({ position, preference: "AUTO" as const }))]
    : selected;
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
  const mutationKeys = useRef(new ClientMutationKeyStore("team-balance-create")).current;
  const submitting = useRef(false);

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
    if (submitting.current) return;
    const ids = rows.map((row) => row.playerId);
    if (ids.some((id) => !id) || new Set(ids).size !== 10) {
      setMessage("서로 다른 활성 플레이어 10명을 선택해 주세요.");
      setStepOneOpen(true);
      return;
    }
    submitting.current = true;
    setPending(true);
    setMessage("");
    const payload = {
      title,
      participants: rows.map((row) => ({ playerId: row.playerId, eligiblePositions: eligiblePositions(row) })),
    };
    const ticket = mutationKeys.issue("POST:/api/team-tools/drafts", 0, payload);
    try {
      const response = await fetch("/api/team-tools/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": '"0"',
          "Idempotency-Key": ticket.key,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { detail?: string; location?: string };
      if (!response.ok || !body.location) throw new Error(body.detail ?? "추천 팀을 계산하지 못했어요.");
      mutationKeys.complete(ticket);
      recordUsageAction("team-balance.saved");
      router.push(body.location);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "추천 팀을 계산하지 못했어요.");
      submitting.current = false;
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
    setPlayerSearchLoading(false);
    setStepOneOpen(true);
    setStepTwoOpen(false);
  }

  return (
    <form className={styles.balanceForm} data-complete={selectedRows.length === 10 ? "true" : undefined} aria-busy={pending} onSubmit={submit}>
      <div className={styles.heading}>
        <div><h2>두 단계로 팀 만들기</h2></div>
        <strong className={styles.count}>{selectedRows.length} / 10명</strong>
      </div>
      <label className={styles.fieldLabel}>초안 이름<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
      <details className={styles.notice}>
        <summary>내전 밸런스 규칙</summary>
        <ul>
          <li>선택한 주·부 포지션만 배정하며, 한 개만 선택하면 원포지션 고정입니다. 기타 포지션은 직접 허용한 경우에만 배정합니다.</li>
          <li>원딜끼리와 서포터끼리 현재 티어의 큰 등급이 3단계 이상 차이 나면 제외합니다. 골드↔다이아는 3단계이며, 골드4↔골드1은 같은 등급입니다.</li>
          <li>팀 합계, 큰 대면 격차가 2곳 이상인지, 바텀 편중, 포지션 양보 부담과 양 팀이 활용할 라인을 함께 비교합니다.</li>
          <li>상위 두 명은 양 팀 분산과 가능한 미드·정글 분담을 선호합니다. 탑·미드 및 원딜·서포터 우세를 분산하고, 약한 서포터의 정글 보완이 한 팀에 중복된 전력 우세를 만들지 않는지 검사합니다.</li>
          <li>조건을 충분히 만족하지 못하면 조건부 편성, 티어 자료가 없으면 정보 확인 필요로 표시합니다.</li>
        </ul>
      </details>

      <section className={styles.balanceStep} aria-labelledby="balance-step-one-title">
        <button className={styles.balanceStepToggle} type="button" aria-expanded={stepOneOpen} onClick={() => setStepOneOpen((open) => !open)}>
          <span><b>1</b><span><strong id="balance-step-one-title">참가자 고르기</strong></span></span>
          <ChevronDown aria-hidden="true" />
        </button>
        {stepOneOpen ? <div className={styles.balanceStepBody}>
          <div className={styles.candidateImport}>
            <div className={styles.subheading}><div><h3>시즌 신청자 가져오기</h3></div><RefreshCw aria-hidden="true" /></div>
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
            <div><Search aria-hidden="true" /><input id="team-balance-player-search" type="search" value={playerQuery} onChange={(event) => { setPlayerQuery(event.target.value); if (!event.target.value.trim()) { setPlayerResults([]); setPlayerSearchMessage(""); setPlayerSearchLoading(false); } }} placeholder="이름, 닉네임 또는 GameName#TAG" autoComplete="off" maxLength={64} /></div>
            {playerSearchLoading ? <p className={styles.fieldHint} role="status">검색 중…</p> : null}
            {playerResults.length ? <ul className={styles.playerSearchResults}>{playerResults.map((player) => {
              const alreadySelected = selectedIds.has(player.playerId);
              return <li key={player.playerId}><button type="button" disabled={alreadySelected || selectedRows.length >= 10} onClick={() => addPlayer(player)}><span><strong>{player.displayName}</strong><small>{player.riotId}</small></span><span>{alreadySelected ? "선택됨" : <><UserRoundPlus aria-hidden="true" /> 추가</>}</span></button></li>;
            })}</ul> : null}
            {playerSearchMessage ? <p className={styles.fieldHint} role="status" aria-live="polite">{playerSearchMessage}</p> : null}
          </div>

          <div className={styles.selectedRoster} aria-label="선택한 참가자">
            {rows.map((row, index) => row.playerId ? <span data-filled="true" key={row.playerId}><b>{index + 1}</b>{row.playerLabel}<button type="button" aria-label={`${row.playerLabel} 선택 해제`} onClick={() => removePlayer(index)}><X aria-hidden="true" /></button></span> : <span data-empty="true" key={`empty-${index}`}><b>{index + 1}</b>참가자 대기</span>)}
          </div>
        </div> : null}
      </section>

      <section className={styles.balanceStep} aria-labelledby="balance-step-two-title">
        <button className={styles.balanceStepToggle} type="button" aria-expanded={stepTwoOpen} onClick={() => setStepTwoOpen((open) => !open)}>
          <span><b>2</b><span><strong id="balance-step-two-title">포지션 확인</strong></span></span>
          <ChevronDown aria-hidden="true" />
        </button>
        {stepTwoOpen ? <div className={styles.balanceStepBody}>
          {selectedRows.length === 0 ? <p className={styles.stepEmpty}>먼저 1단계에서 참가자를 선택해 주세요.</p> : <div className={styles.balanceRows}>
            {rows.map((row, index) => !row.playerId ? null : (
              <article key={row.playerId} className={styles.balancePositionRow} data-all-positions={row.allPositions ? "true" : undefined}>
                <div className={styles.balancePositionHeader}>
                  <span className={styles.balancePlayerIdentity}><b>{index + 1}</b><strong>{row.playerLabel}</strong></span>
                  <div className={styles.mainPositionButtons} role="group" aria-label={`${row.playerLabel} 주 포지션`}>
                    {TEAM_BALANCE_POSITIONS.map((position) => <button
                      type="button"
                      key={position}
                      aria-pressed={!row.allPositions && row.mainPosition === position}
                      data-selected={!row.allPositions && row.mainPosition === position ? "true" : undefined}
                      onClick={() => update(index, {
                        allPositions: false,
                        mainPosition: position,
                        mainPreference: row.allPositions ? "MAIN" : row.mainPreference,
                        additionalPositions: row.additionalPositions.filter((candidate) => candidate !== position),
                      })}
                    >{positionLabel[position]}</button>)}
                    <button
                      type="button"
                      aria-pressed={row.allPositions}
                      data-selected={row.allPositions ? "true" : undefined}
                      onClick={() => update(index, { allPositions: true, mainPreference: "AUTO" })}
                    >전체</button>
                  </div>
                </div>
                <details className={styles.balanceRowDetails}>
                  <summary><strong>세부 설정</strong><small>{row.allPositions ? "모든 포지션 자동 배치" : row.allowAutofill ? "주·부 유지 · 기타 배정 허용" : row.additionalPositions.length === 0 ? "원포지션 고정" : `추가 가능 ${row.additionalPositions.length}개`}</small></summary>
                  <div>
                  <SingleChoice label="주 포지션 선호" value={row.mainPreference} options={preferenceOptions} disabled={row.allPositions} onChange={(mainPreference) => update(index, { mainPreference })} />
                  <fieldset className={styles.choiceField} disabled={row.allPositions}><legend>추가 가능 포지션</legend><div className={styles.choiceButtons} role="group" aria-label="추가 가능 포지션">{TEAM_BALANCE_POSITIONS.filter((position) => position !== row.mainPosition).map((position) => { const selected = row.additionalPositions.includes(position); return <button type="button" key={position} aria-pressed={selected} data-selected={selected ? "true" : undefined} onClick={() => update(index, { additionalPositions: selected ? row.additionalPositions.filter((current) => current !== position) : [...row.additionalPositions, position] })}>{positionLabel[position]}</button>; })}</div></fieldset>
                  <SingleChoice label="추가 포지션 선호" value={row.additionalPreference} options={preferenceOptions} disabled={row.allPositions || row.additionalPositions.length === 0} onChange={(additionalPreference) => update(index, { additionalPreference })} />
                  <label><span><input type="checkbox" aria-label={`${row.playerLabel} 기타 포지션 허용`} checked={row.allowAutofill} disabled={row.allPositions || pending} onChange={(event) => update(index, { allowAutofill: event.target.checked })} /> 선택하지 않은 기타 포지션도 허용</span><small>기본은 선택한 포지션만 허용합니다. 해제 상태에서 한 개만 선택하면 해당 포지션에 고정됩니다.</small></label>
                  </div>
                </details>
              </article>
            ))}
          </div>}
        </div> : null}
      </section>

      {message ? <p className={styles.error} role="alert">{message}</p> : null}
      <div className={styles.actions}>
        <button className={styles.primaryButton} data-usage-action="team-balance.quick" type="submit" disabled={pending || selectedRows.length !== 10}><Scale size={18} aria-hidden="true" /> {pending ? "계산 중…" : "균형 잡힌 팀 만들기"}</button>
        <button className={styles.secondaryButton} type="button" disabled={pending} onClick={reset}><RotateCcw size={17} aria-hidden="true" /> 입력 초기화</button>
        <span className={styles.stageHint}><Plus size={14} aria-hidden="true" /> 표본 없음: 중립 점수 50</span>
      </div>
    </form>
  );
}
