"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CirclePlus, CopyCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import type { AdminMatchEditorCatalog } from "@/modules/matches/application/ports/match-repository";
import { ClientMatchMutationKeyStore } from "@/modules/matches/infrastructure/client-match-mutation-key-store";
import {
  MATCH_POSITIONS,
  MATCH_TEAMS,
  type AdminMatchTeamBalanceSource,
  type MatchGameInput,
  type MatchParticipantInput,
} from "@/modules/matches/domain/match";

import { BoundedPicker, type BoundedPickerOption } from "./bounded-picker";
import {
  parseLatestAdminMatchProjection,
  type LatestAdminMatchProjection,
} from "./admin-match-conflict";
import styles from "./matches-admin.module.css";

type EditorState = Readonly<{
  id: string | null;
  status: "DRAFT" | "PUBLISHED" | "VOIDED";
  revision: number;
}>;
type EditableParticipant = Omit<MatchParticipantInput, "kills" | "deaths" | "assists"> & {
  kills: number;
  deaths: number;
  assists: number;
};
type EditableGame = Omit<MatchGameInput, "participants"> & {
  participants: EditableParticipant[];
};
type FormState = {
  seasonId: string;
  title: string;
  playedOn: string;
  startedAtLocal: string;
  startedAtOffset: string;
  games: EditableGame[];
};

const TEAM_LABEL = { BLUE: "블루", RED: "레드" } as const;
const POSITION_LABEL = {
  TOP: "탑",
  JGL: "정글",
  MID: "미드",
  ADC: "원딜",
  SUP: "서포터",
} as const;

async function responseMessage(response: Response) {
  try {
    const body = await response.json() as { title?: unknown; detail?: unknown };
    if (typeof body.title === "string" && typeof body.detail === "string") {
      return `${body.title} ${body.detail}`;
    }
  } catch { /* problem response fallback */ }
  return "요청을 처리하지 못했습니다.";
}

function emptyGame(gameNumber: number): EditableGame {
  return {
    gameNumber,
    durationSeconds: 1_800,
    winnerTeam: "BLUE",
    participants: MATCH_TEAMS.flatMap((team) =>
      MATCH_POSITIONS.map((position) => ({
        playerId: "",
        championKey: "",
        team,
        position,
        kills: 0,
        deaths: 0,
        assists: 0,
      })),
    ),
  };
}

function cloneGames(value: unknown): EditableGame[] {
  if (!Array.isArray(value) || value.length === 0) return [emptyGame(1)];
  return (value as readonly MatchGameInput[]).map((game, index) => ({
    gameNumber: index + 1,
    durationSeconds: game.durationSeconds,
    winnerTeam: game.winnerTeam,
    participants: game.participants.map((participant) => ({ ...participant })),
  }));
}

function splitStartedAt(value: unknown) {
  if (typeof value !== "string" || value.length < 17) {
    return { local: "", offset: "+09:00" };
  }
  if (value.endsWith("Z")) return { local: value.slice(0, -1), offset: "Z" };
  return { local: value.slice(0, -6), offset: value.slice(-6) };
}

function stateFromBody(body: Record<string, unknown>): FormState {
  const startedAt = splitStartedAt(body.startedAt);
  return {
    seasonId: typeof body.seasonId === "string" ? body.seasonId : "",
    title: typeof body.title === "string" ? body.title : "",
    playedOn: typeof body.playedOn === "string" ? body.playedOn : "",
    startedAtLocal: startedAt.local,
    startedAtOffset: startedAt.offset,
    games: cloneGames(body.games),
  };
}

function payloadFromForm(form: FormState) {
  return {
    seasonId: form.seasonId,
    title: form.title,
    playedOn: form.playedOn,
    startedAt: form.startedAtLocal
      ? `${form.startedAtLocal}${form.startedAtOffset}`
      : null,
    games: form.games.map((game, index) => ({
      ...game,
      gameNumber: index + 1,
      participants: game.participants.map((participant) => ({ ...participant })),
    })),
  };
}

function validateForm(form: FormState, catalog: AdminMatchEditorCatalog) {
  const errors: string[] = [];
  if (form.title.normalize("NFKC").trim().length < 2) {
    errors.push("경기 이름은 두 글자 이상 입력해 주세요.");
  }
  const season = catalog.seasons.find((item) => item.id === form.seasonId);
  if (!season) errors.push("시즌을 선택해 주세요.");
  else if (season.status === "RETIRED") errors.push("폐기된 시즌에는 경기를 저장할 수 없습니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.playedOn)) errors.push("경기 날짜를 선택해 주세요.");
  if (form.startedAtLocal && !form.startedAtLocal.startsWith(`${form.playedOn}T`)) {
    errors.push("시작 시각의 현지 날짜와 경기 날짜가 같아야 합니다.");
  }
  if (form.games.length < 1 || form.games.length > 9) errors.push("게임은 1~9개여야 합니다.");
  for (const [gameIndex, game] of form.games.entries()) {
    const label = `${gameIndex + 1}게임`;
    if (!Number.isInteger(game.durationSeconds) || game.durationSeconds < 60 || game.durationSeconds > 7_200) {
      errors.push(`${label} 진행 시간은 60~7,200초여야 합니다.`);
    }
    const playerIds = game.participants.map((participant) => participant.playerId).filter(Boolean);
    const championKeys = game.participants.map((participant) => participant.championKey).filter(Boolean);
    if (playerIds.length !== 10) errors.push(`${label}의 플레이어 10명을 모두 선택해 주세요.`);
    else if (new Set(playerIds).size !== 10) errors.push(`${label}에 같은 플레이어가 중복되었습니다.`);
    if (championKeys.length !== 10) errors.push(`${label}의 챔피언 10명을 모두 선택해 주세요.`);
    else if (new Set(championKeys).size !== 10) errors.push(`${label}에 같은 챔피언이 중복되었습니다.`);
    if (game.participants.some((participant) =>
      ![participant.kills, participant.deaths, participant.assists].every(
        (number) => Number.isInteger(number) && number >= 0 && number <= 999,
      ))) {
      errors.push(`${label} K/D/A는 0~999 정수여야 합니다.`);
    }
    if (game.participants.some((participant) =>
      participant.playerId && catalog.players.find((player) => player.id === participant.playerId)?.status !== "ACTIVE")) {
      errors.push(`${label}에 비활성 플레이어가 포함되어 있습니다.`);
    }
    if (game.participants.some((participant) =>
      participant.championKey && catalog.champions.find((champion) => champion.key === participant.championKey)?.status !== "ACTIVE")) {
      errors.push(`${label}에 비활성 챔피언이 포함되어 있습니다.`);
    }
  }
  return [...new Set(errors)];
}

export function MatchEditor({
  initialState,
  initialBody,
  catalog,
  teamBalanceSource = null,
}: {
  initialState: EditorState;
  initialBody: Record<string, unknown>;
  catalog: AdminMatchEditorCatalog;
  teamBalanceSource?: AdminMatchTeamBalanceSource | null;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [form, setForm] = useState(() => stateFromBody(initialBody));
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [knownPlayers, setKnownPlayers] = useState<AdminMatchEditorCatalog["players"]>([]);
  const [serverConflict, setServerConflict] = useState<LatestAdminMatchProjection | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const editorPanelRef = useRef<HTMLElement>(null);
  const voidDialogRef = useRef<HTMLElement>(null);
  const voidReasonRef = useRef<HTMLTextAreaElement>(null);
  const voidTriggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [mutationKeys] = useState(() => new ClientMatchMutationKeyStore("admin-match"));
  const mergedKnownPlayers = useMemo(() => [...catalog.players, ...knownPlayers]
    .filter((player, index, players) => players.findIndex((candidate) => candidate.id === player.id) === index),
  [catalog.players, knownPlayers]);
  const effectiveCatalog = useMemo(() => ({ ...catalog, players: mergedKnownPlayers }), [catalog, mergedKnownPlayers]);
  const playerOptions = useMemo<BoundedPickerOption[]>(() => mergedKnownPlayers.map((player) => ({
    value: player.id,
    label: `${player.nickname}#${player.tagLine}`,
    status: player.status,
  })), [mergedKnownPlayers]);
  const championOptions = useMemo<BoundedPickerOption[]>(() => catalog.champions.map((champion) => ({
    value: champion.key,
    label: champion.displayName,
    status: champion.status,
    searchText: champion.key,
  })), [catalog.champions]);
  const errors = useMemo(() => validateForm(form, effectiveCatalog), [effectiveCatalog, form]);
  const payload = useMemo(() => {
    const record = payloadFromForm(form);
    return !state.id && teamBalanceSource ? { ...record, ...teamBalanceSource } : record;
  }, [form, state.id, teamBalanceSource]);

  useEffect(() => {
    if (!voidOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => voidReasonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [voidOpen]);

  async function fetchLatestProjection(matchId: string) {
    const response = await fetch(`/api/admin/matches/${matchId}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await responseMessage(response));
    const latest = parseLatestAdminMatchProjection(await response.json());
    if (!latest || latest.id !== matchId) {
      throw new Error("최신 경기 응답의 구조를 확인할 수 없습니다.");
    }
    return latest;
  }

  function keepLocalAgainstLatest() {
    if (!serverConflict) return;
    setServerConflict(null);
    setError(false);
    setMessage(`서버 revision ${serverConflict.revision} 위에 현재 입력을 다시 적용할 준비가 되었습니다. 내용을 한 번 더 확인한 뒤 저장해 주세요.`);
  }

  function loadLatestServerAggregate() {
    if (!serverConflict) return;
    setForm(stateFromBody(serverConflict.body));
    setServerConflict(null);
    setError(false);
    setMessage(`서버 revision ${serverConflict.revision}의 경기 전체 내용을 불러왔습니다.`);
  }

  function openVoidDialog() {
    returnFocusRef.current = voidTriggerRef.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setVoidOpen(true);
  }

  function closeVoidDialog(force = false) {
    if (busy && !force) return;
    const returnTarget = returnFocusRef.current;
    setVoidOpen(false);
    setVoidReason("");
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
      else editorPanelRef.current?.focus();
    });
  }

  function trapVoidDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeVoidDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = voidDialogRef.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute("hidden"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateGame(gameIndex: number, mutate: (game: EditableGame) => EditableGame) {
    setForm((current) => ({
      ...current,
      games: current.games.map((game, index) => index === gameIndex ? mutate(game) : game),
    }));
  }

  function updateParticipant(
    gameIndex: number,
    participantIndex: number,
    patch: Partial<EditableParticipant>,
  ) {
    updateGame(gameIndex, (game) => ({
      ...game,
      participants: game.participants.map((participant, index) =>
        index === participantIndex ? { ...participant, ...patch } : participant),
    }));
  }

  async function mutate(action: "save" | "publish" | "void" | "restore") {
    if (serverConflict) {
      setError(true);
      setMessage("동시 수정 내용을 먼저 비교하고 사용할 기준을 선택해 주세요.");
      return;
    }
    if (action === "save" && errors.length > 0) {
      setError(true);
      setMessage("입력 오류를 먼저 확인해 주세요.");
      return;
    }
    const confirmed = action === "save"
      ? window.confirm(state.id ? "현재 경기 전체 내용을 새 revision으로 저장할까요?" : "새 경기 초안을 저장할까요?")
      : action === "publish"
        ? window.confirm("이 경기를 공개하고 통계 재계산 이벤트를 예약할까요?")
        : action === "restore"
          ? window.confirm("무효화된 경기를 다시 공개할까요?")
          : true;
    if (!confirmed) return;
    setBusy(true);
    setError(false);
    setMessage("변경을 확인하고 있습니다…");
    try {
      let url = "/api/admin/matches";
      let method = "POST";
      let body: unknown;
      if (action === "save") {
        body = payload;
        if (state.id) {
          url = `/api/admin/matches/${state.id}`;
          method = "PATCH";
        }
      } else {
        if (!state.id) throw new Error("경기를 먼저 저장해 주세요.");
        url = `/api/admin/matches/${state.id}/${action}`;
        body = action === "void"
          ? { reason: voidReason }
          : {};
      }
      const ticket = mutationKeys.issue(action, state.revision, body);
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${state.revision}"`,
          "Idempotency-Key": ticket.key,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await responseMessage(response);
        if (response.status === 412) {
          if (!state.id) throw new Error(detail);
          let latest: LatestAdminMatchProjection;
          try {
            latest = await fetchLatestProjection(state.id);
          } catch (latestError) {
            throw new Error(`${detail} 최신 서버 내용을 검증하지 못해 기존 revision과 입력을 보존했습니다. ${latestError instanceof Error ? latestError.message : "잠시 후 같은 작업을 다시 시도해 주세요."}`);
          }
          if (latest.revision <= state.revision) {
            throw new Error(`${detail} 더 최신인 서버 revision을 확인하지 못해 기존 입력을 보존했습니다.`);
          }
          mutationKeys.complete(ticket);
          if (action === "void") closeVoidDialog(true);
          setState({ id: latest.id, status: latest.status, revision: latest.revision });
          setServerConflict(latest);
          setError(true);
          setMessage(`다른 관리자가 먼저 revision ${latest.revision}을 저장했습니다. 로컬 입력은 보존했습니다. 아래에서 비교 기준을 선택해 주세요.`);
          router.refresh();
          return;
        }
        throw new Error(detail);
      }
      const updated = await response.json() as {
        id: string;
        status: EditorState["status"];
        revision: number;
      };
      mutationKeys.complete(ticket);
      setState({ id: updated.id, status: updated.status, revision: updated.revision });
      if (action === "void") {
        closeVoidDialog(true);
      }
      setMessage(`작업이 반영되었습니다. revision ${updated.revision}`);
      if (!state.id) router.replace(`/admin/matches/${updated.id}`);
      router.refresh();
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : "변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div aria-hidden={voidOpen ? true : undefined} inert={voidOpen ? true : undefined}>
    {message ? <p className={styles.message} data-error={error} role={error ? "alert" : "status"}>{message}</p> : null}
    {serverConflict ? <section className={styles.validation} aria-labelledby="match-conflict-title">
      <strong id="match-conflict-title">동시 수정 비교가 필요합니다</strong>
      <p>서버 revision {serverConflict.revision}: {serverConflict.body.title} · {serverConflict.body.playedOn} · {serverConflict.body.games.length}게임 · {serverConflict.status}</p>
      <p>현재 입력: {form.title || "이름 미입력"} · {form.playedOn || "날짜 미입력"} · {form.games.length}게임</p>
      <div className={styles.actions}>
        <button type="button" onClick={keepLocalAgainstLatest}>로컬 입력 유지·최신 revision에 재적용</button>
        <button type="button" onClick={loadLatestServerAggregate}>서버 경기 전체 불러오기</button>
      </div>
    </section> : null}
    <section className={styles.panel} ref={editorPanelRef} tabIndex={-1}>
      <div><h2>{state.id ? "경기 전체 교정" : "새 경기 초안"}</h2><p>시즌과 기본 정보를 입력한 뒤 게임별 10명 로스터를 완성해 주세요. 공개 경기 교정도 이전 revision과 통계 재계산 이벤트를 남깁니다.</p></div>
      <div className={styles.form}>
        <label>시즌<select value={form.seasonId} onChange={(event) => setForm((current) => ({ ...current, seasonId: event.target.value }))}><option value="">선택해 주세요</option>{catalog.seasons.map((season) => <option key={season.id} value={season.id} disabled={season.status === "RETIRED"}>{season.name} · {season.status === "ACTIVE" ? "진행 중" : season.status === "ENDED" ? "종료" : season.status === "DRAFT" ? "초안" : "폐기"}</option>)}</select></label>
        <label className={styles.wide}>경기 이름<input maxLength={160} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="예: 9월 1주차 정기 내전" /></label>
        <label>경기 날짜 (KST)<input type="date" value={form.playedOn} onChange={(event) => setForm((current) => ({ ...current, playedOn: event.target.value }))} /></label>
        <label>시작 시각 (선택)<span className={styles.inlineFields}><input type="datetime-local" value={form.startedAtLocal} onChange={(event) => setForm((current) => ({ ...current, startedAtLocal: event.target.value }))} /><select aria-label="시작 시각 UTC 오프셋" value={form.startedAtOffset} onChange={(event) => setForm((current) => ({ ...current, startedAtOffset: event.target.value }))}><option value="+09:00">KST +09:00</option><option value="Z">UTC Z</option><option value="+08:00">+08:00</option><option value="+10:00">+10:00</option></select></span></label>
      </div>

      <div className={styles.gameStack}>
        {form.games.map((game, gameIndex) => {
          const usedPlayers = new Set(game.participants.map((participant) => participant.playerId).filter(Boolean));
          const usedChampions = new Set(game.participants.map((participant) => participant.championKey).filter(Boolean));
          return <article className={styles.gameEditor} key={gameIndex}>
            <header className={styles.gameEditorHeader}><div><span>GAME {gameIndex + 1}</span><h3>{gameIndex + 1}게임</h3></div><div className={styles.compactControls}><label>승리 팀<select value={game.winnerTeam} onChange={(event) => updateGame(gameIndex, (current) => ({ ...current, winnerTeam: event.target.value as EditableGame["winnerTeam"] }))}><option value="BLUE">블루</option><option value="RED">레드</option></select></label>{form.games.length > 1 ? <button type="button" className={styles.iconButton} aria-label={`${gameIndex + 1}게임 삭제`} onClick={() => setForm((current) => ({ ...current, games: current.games.filter((_, index) => index !== gameIndex).map((item, index) => ({ ...item, gameNumber: index + 1 })) }))}><Trash2 size={17} aria-hidden="true" /></button> : null}</div></header>
            <div className={styles.rosterTable} role="group" aria-label={`${gameIndex + 1}게임 로스터`}>
              <div className={styles.rosterHead}><span>팀/포지션</span><span>플레이어</span><span>챔피언</span><span>K / D / A</span></div>
              {game.participants.map((participant, participantIndex) => <div className={styles.rosterRow} key={`${participant.team}-${participant.position}`}>
                <strong data-team={participant.team}>{TEAM_LABEL[participant.team]} · {POSITION_LABEL[participant.position]}</strong>
                <BoundedPicker
                  ariaLabel={`${TEAM_LABEL[participant.team]} ${POSITION_LABEL[participant.position]} 플레이어`}
                  disabledValues={usedPlayers}
                  options={playerOptions}
                  placeholder="이름 또는 태그 검색"
                  remoteEndpoint="/api/admin/matches/editor-options/players"
                  value={participant.playerId}
                  onChange={(value, option) => {
                    if (option && !mergedKnownPlayers.some((player) => player.id === option.value)) {
                      const [nickname, tagLine = ""] = option.label.split("#", 2);
                      setKnownPlayers((current) => [...current, {
                        id: option.value,
                        nickname: nickname ?? option.label,
                        tagLine,
                        status: option.status,
                      }]);
                    }
                    updateParticipant(gameIndex, participantIndex, { playerId: value });
                  }}
                />
                <BoundedPicker
                  ariaLabel={`${TEAM_LABEL[participant.team]} ${POSITION_LABEL[participant.position]} 챔피언`}
                  disabledValues={usedChampions}
                  options={championOptions}
                  placeholder="챔피언 검색"
                  value={participant.championKey}
                  onChange={(value) => updateParticipant(gameIndex, participantIndex, { championKey: value })}
                />
                <span className={styles.kdaInputs}><input aria-label="킬" inputMode="numeric" min="0" max="999" type="number" value={participant.kills} onChange={(event) => updateParticipant(gameIndex, participantIndex, { kills: Number(event.target.value) })} /><i>/</i><input aria-label="데스" inputMode="numeric" min="0" max="999" type="number" value={participant.deaths} onChange={(event) => updateParticipant(gameIndex, participantIndex, { deaths: Number(event.target.value) })} /><i>/</i><input aria-label="어시스트" inputMode="numeric" min="0" max="999" type="number" value={participant.assists} onChange={(event) => updateParticipant(gameIndex, participantIndex, { assists: Number(event.target.value) })} /></span>
              </div>)}
            </div>
          </article>;
        })}
        <button type="button" className={styles.addGame} disabled={form.games.length >= 9} onClick={() => setForm((current) => ({ ...current, games: [...current.games, emptyGame(current.games.length + 1)] }))}><CirclePlus size={18} aria-hidden="true" /> 게임 추가</button>
      </div>

      {errors.length ? <div className={styles.validation} role="alert"><strong>저장 전 확인</strong><ul>{errors.map((item) => <li key={item}>{item}</li>)}</ul></div> : <p className={styles.valid}><CopyCheck size={17} aria-hidden="true" /> 구조 검사가 통과되었습니다. MVP는 서버가 V1_COMPAT_1 공식으로 결정합니다.</p>}
      <div className={styles.actions}><button className={styles.action} type="button" disabled={busy || Boolean(serverConflict) || errors.length > 0} onClick={() => mutate("save")}>저장</button>{state.id && state.status === "DRAFT" ? <button type="button" disabled={busy || Boolean(serverConflict)} onClick={() => mutate("publish")}>공개</button> : null}{state.id && state.status === "PUBLISHED" ? <button data-danger="true" ref={voidTriggerRef} type="button" disabled={busy || Boolean(serverConflict)} onClick={openVoidDialog}>무효화</button> : null}{state.id && state.status === "VOIDED" ? <button type="button" disabled={busy || Boolean(serverConflict)} onClick={() => mutate("restore")}>복구</button> : null}</div>
    </section>
    </div>
    {voidOpen ? <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => closeVoidDialog()}>
      <section aria-describedby="void-description" aria-labelledby="void-title" aria-modal="true" className={styles.dialog} ref={voidDialogRef} role="dialog" onKeyDown={trapVoidDialogFocus} onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="void-title">경기를 무효화할까요?</h2>
        <p id="void-description">공개 목록과 통계에서 제외되며 나중에 복구할 수 있습니다. 사용자가 이해할 수 있는 사유를 3~500자로 남겨 주세요.</p>
        <label>무효화 사유<textarea maxLength={500} minLength={3} ref={voidReasonRef} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></label>
        <div className={styles.actions}><button type="button" disabled={busy} onClick={() => closeVoidDialog()}>취소</button><button data-danger="true" type="button" disabled={busy || voidReason.normalize("NFKC").trim().length < 3} onClick={() => mutate("void")}>사유를 기록하고 무효화</button></div>
      </section>
    </div> : null}
  </>;
}
