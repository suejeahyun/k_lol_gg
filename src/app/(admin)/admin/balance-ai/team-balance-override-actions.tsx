"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, RefreshCw, RotateCcw, Save, Scale } from "@/components/theme/theme-icons";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import { BoundedPicker, type BoundedPickerOption } from "../matches/bounded-picker";
import { TeamScoreDetails, TeamScoreOverview } from "./team-score-panels";
import styles from "./team-balance-override.module.css";

type Override = { playerId: string; score: number; reason: string; revision: number; configured: boolean; updatedAt: string | null };
type SaveRequest = { playerId: string; score: number; reason: string; revision: number };

function readOverride(value: unknown, playerId: string): Override {
  const result = value as Partial<Override> | null;
  if (!result || result.playerId !== playerId || !Number.isSafeInteger(result.score) ||
    Math.abs(result.score!) > 1000 || typeof result.reason !== "string" ||
    !Number.isSafeInteger(result.revision) || result.revision! < 0 || typeof result.configured !== "boolean" ||
    !(result.updatedAt === null || (typeof result.updatedAt === "string" && Number.isFinite(Date.parse(result.updatedAt))))) {
    throw new Error("보정값 응답을 확인하지 못했습니다. 다시 확인해 주세요.");
  }
  return result as Override;
}

function points(value: number) { return `${value > 0 ? "+" : ""}${value.toLocaleString("ko-KR")}점`; }

export function TeamBalanceOverrideActions({ allowed }: { allowed: boolean }) {
  const [selected, setSelected] = useState<BoundedPickerOption | null>(null);
  const [current, setCurrent] = useState<Override | null>(null);
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [recovery, setRecovery] = useState<"reload" | "login" | null>(null);
  const [retryRequest, setRetryRequest] = useState<SaveRequest | null>(null);
  const [confirmedChange, setConfirmedChange] = useState("");
  const [referenceRevision, setReferenceRevision] = useState(0);
  const requestId = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const uncertain = useRef<SaveRequest | null>(null);
  const preserveDraftOnReload = useRef(false);
  const mutationKeys = useRef(new ClientMutationKeyStore("team-override")).current;
  const selectedId = useRef("");
  const scoreInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { loadController.current?.abort(); requestId.current += 1; }, []);

  const busy = phase !== "idle";
  const locked = busy || retryRequest !== null;
  const numericScore = Number(score);
  const validScore = score.trim() !== "" && Number.isSafeInteger(numericScore) && Math.abs(numericScore) <= 1000;
  const changed = current !== null && (numericScore !== current.score || reason.trim() !== current.reason);
  const confirmationKey = JSON.stringify([current?.playerId, current?.revision, numericScore, reason.trim()]);
  const needsConfirmation = current !== null && validScore && changed &&
    (Math.abs(numericScore) >= 10 || Math.abs(numericScore - current.score) >= 10);
  const confirmed = !needsConfirmation || confirmedChange === confirmationKey;

  async function load(playerId: string, preserveDraft = false) {
    if (sending.current || uncertain.current) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const id = ++requestId.current;
    preserveDraftOnReload.current = preserveDraft;
    setPhase("loading"); setMessage(""); setRecovery(null); setError(false); setCurrent(null); setConfirmedChange("");
    try {
      const response = await fetch(`/api/admin/balance-ai/team-overrides?playerId=${encodeURIComponent(playerId)}`, {
        cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      const result = await response.json();
      if (id !== requestId.current || selectedId.current !== playerId) return;
      if (!response.ok) {
        if (response.status === 401) setRecovery("login");
        throw new Error(typeof result?.detail === "string" ? result.detail : "현재 보정값을 불러오지 못했습니다.");
      }
      const loaded = readOverride(result, playerId);
      setCurrent(loaded);
      if (preserveDraft) setReferenceRevision((value) => value + 1);
      if (!preserveDraft) { setScore(String(loaded.score)); setReason(loaded.reason); }
      preserveDraftOnReload.current = false;
    } catch (cause) {
      if (controller.signal.aborted || id !== requestId.current) return;
      setError(true); setMessage(cause instanceof Error ? cause.message : "현재 보정값을 불러오지 못했습니다.");
    } finally { if (id === requestId.current) setPhase("idle"); }
  }

  function selectPlayer(playerId: string, option?: BoundedPickerOption) {
    if (sending.current || uncertain.current) return;
    selectedId.current = playerId;
    preserveDraftOnReload.current = false;
    setSelected(option ?? null); setCurrent(null); setScore(""); setReason(""); setMessage(""); setError(false); setRecovery(null);
    loadController.current?.abort(); requestId.current += 1;
    if (playerId) void load(playerId);
    else setPhase("idle");
  }

  async function save(request: SaveRequest) {
    if (!allowed || sending.current || selectedId.current !== request.playerId) return;
    sending.current = true;
    setPhase("saving"); setMessage(""); setError(false); setRecovery(null);
    const body = { playerId: request.playerId, score: request.score, reason: request.reason };
    const ticket = mutationKeys.issue("set", request.revision, body);
    try {
      const response = await fetch("/api/admin/balance-ai/team-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": `"${request.revision}"`, "Idempotency-Key": ticket.key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(true);
        if (response.status === 412) {
          uncertain.current = null; setRetryRequest(null); setRecovery("reload");
          preserveDraftOnReload.current = true;
          setMessage("다른 관리자가 점수를 변경했습니다. 최신 점수를 확인한 뒤 다시 저장해 주세요.");
        } else if ([401, 408, 429].includes(response.status) || response.status >= 500) {
          uncertain.current = request; setRetryRequest(request);
          if (response.status === 401) setRecovery("login");
          setMessage(response.status === 401 ? "관리자 로그인이 필요합니다. 로그인 후 저장 결과를 다시 확인해 주세요." : "저장 완료 여부를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
        } else {
          uncertain.current = null; setRetryRequest(null);
          setMessage(typeof result?.detail === "string" ? result.detail : "점수를 저장하지 못했습니다. 입력을 확인해 주세요.");
        }
        return;
      }
      const saved = readOverride(result, request.playerId);
      if (saved.revision !== request.revision + 1 || saved.score !== request.score || saved.reason !== request.reason || !saved.configured) throw new Error("UNCONFIRMED_OVERRIDE");
      mutationKeys.complete(ticket);
      uncertain.current = null; setRetryRequest(null);
      setCurrent(saved); setScore(String(saved.score)); setReason(saved.reason);
      setReferenceRevision((value) => value + 1);
      setMessage(`${points(saved.score)} 저장 완료. 새 계산 또는 초안 재평가부터 적용됩니다.`);
    } catch {
      uncertain.current = request; setRetryRequest(request); setError(true);
      setMessage("저장 완료 여부를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
    } finally { sending.current = false; setPhase("idle"); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || locked || recovery || !validScore || !changed || !confirmed || reason.trim().length < 3 || reason.trim().length > 300) return;
    void save({ playerId: current.playerId, score: numericScore, reason: reason.trim(), revision: current.revision });
  }

  return <section id="team-score" className={styles.section} aria-labelledby="team-override-title">
    <header className={styles.header}>
      <div><Scale size={22} /><h2 id="team-override-title" tabIndex={-1}>내전 팀 편성 점수</h2></div>
      <span className={styles.access}>관리자 수정 가능</span>
    </header>
    <div className={styles.workspace}>
      <div className={styles.selection}>
        <fieldset disabled={phase === "saving" || retryRequest !== null} className={styles.fields}>
          <label className={styles.label}><span>플레이어 검색</span><BoundedPicker ariaLabel="팀 편성 보정 플레이어" value={selected?.value ?? ""} options={selected ? [selected] : []} placeholder="닉네임 또는 Riot ID" remoteEndpoint="/api/admin/matches/editor-options/players" onChange={selectPlayer} /></label>
        </fieldset>
        {current ? <dl className={styles.current}>
          <div><dt>현재 보정</dt><dd>{points(current.score)}</dd></div>
          <div><dt>최근 저장</dt><dd>{current.updatedAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(current.updatedAt)) : "설정 이력 없음"}</dd></div>
        </dl> : <p className={styles.empty}>{phase === "loading" ? "현재 점수 불러오는 중…" : selected ? "점수를 불러오지 못했습니다." : "선택된 플레이어 없음"}</p>}
      </div>
      <form onSubmit={submit} className={styles.editor} aria-label="내전 팀 편성 점수 수정" aria-busy={busy}>
        <fieldset disabled={!allowed || !current || locked || recovery !== null} className={styles.fields}>
          <div className={styles.scoreRow}>
            <label className={styles.label} htmlFor="team-override-score">보정 점수</label>
            <button className={styles.reset} type="button" title="보정 점수를 0점으로 초기화" disabled={!current || score === "0"} onClick={() => { setScore("0"); scoreInput.current?.focus(); }}><RotateCcw size={16} />0점으로 초기화</button>
          </div>
          <div className={styles.scoreInput}><input ref={scoreInput} id="team-override-score" name="score" type="number" min={-1000} max={1000} step={1} value={score} required aria-describedby="team-score-range" onChange={(event) => { setScore(event.target.value); setMessage(""); }} /><span>점</span></div>
          <p id="team-score-range" className={styles.range}>허용 범위 −1,000 ~ +1,000점 · 기본 0점</p>
          <label className={styles.label} htmlFor="team-override-reason">변경 사유</label>
          <input className={styles.reasonInput} id="team-override-reason" name="reason" type="text" minLength={3} maxLength={300} value={reason} required placeholder="최근 내전 경기력 반영" onChange={(event) => { setReason(event.target.value); setMessage(""); }} />
          <div className={styles.reasonMeta}><span>3자 이상</span><span>{reason.length}/300</span></div>
          {needsConfirmation ? <div className={styles.confirmation}>
            <p id="team-score-confirm-note">보정값 또는 변경량이 10점 이상입니다.</p>
            <label htmlFor="team-score-confirm"><input id="team-score-confirm" type="checkbox" checked={confirmedChange === confirmationKey} aria-describedby="team-score-confirm-note" onChange={(event) => setConfirmedChange(event.target.checked ? confirmationKey : "")} /><span>{points(current!.score)}에서 {points(numericScore)}으로 변경하는 내용을 확인했습니다.</span></label>
          </div> : null}
        </fieldset>
        <div className={styles.footer}>
          <div className={styles.preview} aria-label="저장 전후 보정 점수"><span>{current ? points(current.score) : "미선택"}</span><ArrowRight size={18} /><strong>{current && validScore ? points(numericScore) : "—"}</strong></div>
          <button className={styles.save} type="submit" disabled={!allowed || !current || locked || recovery !== null || !validScore || !changed || !confirmed || reason.trim().length < 3}><Save size={18} />{phase === "saving" ? "저장 중…" : "보정 점수 저장"}</button>
        </div>
      </form>
    </div>
    <p className={styles.scope}>팀 편성 전용 보정 · 새 팀 계산·초안 재평가 시 적용 · 기존 경기와 MMR 유지</p>
    <div className={styles.feedback}>
      <p id="team-score-feedback" role={error ? "alert" : "status"} aria-live="polite" className={error ? styles.error : styles.success}>{message && !error ? <CheckCircle2 size={18} /> : null}{phase === "loading" ? "현재 보정값을 확인하고 있습니다." : message}</p>
      {recovery === "login" ? <Link href="/admin/login?next=%2Fadmin%2Fbalance-ai%23team-score" target="_blank" rel="noopener noreferrer">관리자 로그인</Link> : null}
      {retryRequest ? <button type="button" disabled={busy} onClick={() => void save(retryRequest)}><RefreshCw size={16} />저장 결과 다시 확인</button> : null}
      {!retryRequest && selected && (!current || recovery === "reload") ? <button type="button" disabled={busy} onClick={() => void load(selected.value, preserveDraftOnReload.current)}><RefreshCw size={16} />{recovery === "reload" ? "최신 점수 확인" : "다시 불러오기"}</button> : null}
    </div>
    {current && selected ? <TeamScoreDetails key={current.playerId} playerId={current.playerId} currentScore={current.score} currentRevision={current.revision} draftScore={validScore ? numericScore : null} refreshRevision={referenceRevision} reloadDisabled={locked} onReload={() => void load(current.playerId, true)} /> : null}
    <TeamScoreOverview refreshRevision={referenceRevision} selectedPlayerId={selected?.value ?? ""} disabled={phase === "saving" || retryRequest !== null} onSelect={(option) => {
      selectPlayer(option.value, option);
      document.getElementById("team-score")?.scrollIntoView({ block: "start" });
      document.getElementById("team-override-title")?.focus({ preventScroll: true });
    }} />
  </section>;
}
