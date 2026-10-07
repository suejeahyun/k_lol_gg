"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { BoundedPicker, type BoundedPickerOption } from "@/app/(admin)/admin/matches/bounded-picker";
import type { AdminRiotRowDto } from "@/modules/riot/application/riot-query";

import styles from "./riot-workspace.module.css";

async function command(path: string, body: object, revision?: number) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...(revision === undefined ? {} : { "If-Match": `\"${revision}\"` }) }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(typeof data?.title === "string" ? data.title : "요청을 처리하지 못했습니다.");
  return data;
}

export function RiotAdminActions({ linkId, failed }: Readonly<{ linkId: string; failed: boolean }>) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function run(path: string) {
    setPending(true); setMessage(null);
    try { await command(path, { linkId }); setMessage("요청을 큐에 등록했습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "요청에 실패했습니다."); }
    finally { setPending(false); }
  }
  return <div><div className={styles.actions}><button type="button" disabled={pending} onClick={() => void run(failed ? "/api/admin/riot/retry" : "/api/admin/riot/sync")}>{failed ? "재시도" : "동기화"}</button></div>{message ? <small role="status">{message}</small> : null}</div>;
}

export function RiotAdminGlobalActions({ superAdmin, items }: Readonly<{ superAdmin: boolean; items: readonly AdminRiotRowDto[] }>) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [selectedLinkIds, setSelectedLinkIds] = useState<ReadonlySet<string>>(() => new Set());
  const [reviewingBulk, setReviewingBulk] = useState(false);
  const modalOpen = useRef(false);
  const sending = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const selectedPlayer = items.find((item) => item.playerId === playerId);
  const revision = selectedPlayer?.revision ?? 0;
  const playerOptions: readonly BoundedPickerOption[] = items.map((item) => ({
    value: item.playerId,
    label: `${item.displayName} · ${item.riotId}`,
    status: item.status === "CONNECTED" ? "INACTIVE" : "ACTIVE",
    searchText: item.riotId,
  }));
  const connectedItems = items.filter((item): item is AdminRiotRowDto & { linkId: string } => item.status === "CONNECTED" && Boolean(item.linkId));

  useEffect(() => {
    if (!reviewingBulk) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; };
  }, [reviewingBulk]);

  function openReview() {
    if (!superAdmin || pending || sending.current || modalOpen.current || selectedLinkIds.size === 0) return;
    modalOpen.current = true; setReviewingBulk(true);
  }
  function closeReview() {
    if (pending || sending.current) return;
    modalOpen.current = false; setReviewingBulk(false);
    window.requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected && !triggerRef.current.disabled) triggerRef.current.focus();
      else rootRef.current?.focus();
    });
  }
  function trapReviewFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeReview(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = focusable[0], last = focusable.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }

  function selectPlayer(value: string) {
    if (modalOpen.current || sending.current) return;
    setPlayerId(value);
    const selected = items.find((item) => item.playerId === value);
    const [nextGameName = "", nextTagLine = ""] = selected?.riotId.split("#", 2) ?? [];
    setGameName(nextGameName);
    setTagLine(nextTagLine);
  }

  function toggleLink(linkId: string) {
    if (modalOpen.current || sending.current) return;
    setSelectedLinkIds((current) => {
      const next = new Set(current);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }

  function run(operation: () => Promise<unknown>, success: string | ((result: unknown) => string)) {
    if (pending || sending.current || modalOpen.current) return;
    sending.current = true;
    setPending(true); setMessage(null);
    void operation().then((result) => setMessage(typeof success === "function" ? success(result) : success)).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "요청에 실패했습니다.")).finally(() => { sending.current = false; setPending(false); });
  }
  function allSyncMessage(result: unknown) {
    const value = result as Record<string, unknown> | null;
    if (!value || !["targetCount", "queuedCount", "existingCount", "deferredCount"].every((key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0)) return "전체 동기화를 요청했습니다. 동기화 탭에서 처리 상태를 확인해 주세요.";
    return `전체 ${value.targetCount}명 · 새 요청 ${value.queuedCount}명 · 이미 진행 중 ${value.existingCount}명. 새 요청 중 ${value.deferredCount}명은 갱신 대기시간이 끝나면 처리됩니다. 완료 여부는 동기화 탭에서 확인해 주세요.`;
  }
  return <div ref={rootRef} tabIndex={-1}>
    <form id="riot-single-link" className={styles.form} inert={reviewingBulk} onSubmit={(event) => { event.preventDefault(); run(() => command("/api/admin/riot/link", { playerId, gameName, tagLine }, revision), "단일 연결을 반영했습니다."); }}>
      <label><span>연결할 플레이어</span><BoundedPicker ariaLabel="Riot 단일 연결 플레이어" value={playerId} options={playerOptions} placeholder="현재 목록에서 이름 또는 Riot ID 검색" onChange={selectPlayer} /></label>
      <label>게임 이름<input value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="게임 이름" maxLength={16} required /></label><label>태그<input value={tagLine} onChange={(event) => setTagLine(event.target.value)} placeholder="태그" maxLength={5} required /></label>
      <p className={styles.selectionSummary} role="status">{selectedPlayer ? `${selectedPlayer.displayName} · 변경 버전 ${revision}` : "현재 목록에서 미연결·연결 해제 플레이어를 선택해 주세요."}</p>
      <div className={styles.actions}><button type="submit" disabled={pending || !selectedPlayer || !gameName || !tagLine}>단일 연결</button></div>
    </form>
    {superAdmin ? <form className={styles.form} inert={reviewingBulk} onSubmit={(event) => { event.preventDefault(); openReview(); }}><fieldset className={styles.selectionList}><legend>현재 목록의 연결 계정 선택</legend>{connectedItems.length ? connectedItems.map((item) => <label key={item.linkId}><input type="checkbox" checked={selectedLinkIds.has(item.linkId)} onChange={() => toggleLink(item.linkId)} /><span><strong>{item.displayName}</strong><small>{item.riotId}</small></span></label>) : <p>현재 목록에 동기화할 연결 계정이 없습니다.</p>}</fieldset><p className={styles.selectionSummary} role="status">{selectedLinkIds.size}개 계정을 선택했습니다.</p><div className={styles.actions}><button ref={triggerRef} type="submit" disabled={pending || selectedLinkIds.size === 0}>선택 일괄 동기화 미리보기</button><button type="button" data-tone="quiet" disabled={pending} onClick={() => run(() => command("/api/admin/riot/sync", { all: true }), allSyncMessage)}>전체 동기화</button></div></form> : null}
    {reviewingBulk ? <div className={styles.dialogBackdrop}><div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="riot-bulk-review-title" aria-describedby="riot-bulk-review-description" onKeyDown={trapReviewFocus}><h3 id="riot-bulk-review-title">일괄 동기화 확인</h3><p id="riot-bulk-review-description">선택한 {selectedLinkIds.size}개 계정을 동기화 큐에 등록합니다.</p><ul>{connectedItems.filter((item) => selectedLinkIds.has(item.linkId)).map((item) => <li key={item.linkId}><strong>{item.displayName}</strong><span>{item.riotId}</span></li>)}</ul><div className={styles.actions}><button ref={cancelRef} type="button" data-tone="quiet" onClick={closeReview}>취소</button><button type="button" disabled={pending} onClick={() => { if (!modalOpen.current || sending.current) return; closeReview(); run(() => command("/api/admin/riot/bulk", { linkIds: [...selectedLinkIds].sort() }), "일괄 동기화를 큐에 등록했습니다."); }}>등록 확인</button></div></div></div> : null}
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
  </div>;
}

type BulkLinkResult = Readonly<{
  successCount: number;
  skippedCount: number;
  failedCount: number;
  remainingCount: number;
}>;

function isBulkLinkResult(value: unknown): value is BulkLinkResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return ["successCount", "skippedCount", "failedCount", "remainingCount"].every((key) => Number.isSafeInteger(result[key]) && Number(result[key]) >= 0);
}

export function RiotAdminBulkLink({
  items,
  q,
  batchSize,
  remainingBefore,
}: Readonly<{
  items: readonly AdminRiotRowDto[];
  q: string;
  batchSize: number;
  remainingBefore: number;
}>) {
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<BulkLinkResult | null>(null);
  const modalOpen = useRef(false);
  const sending = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!reviewing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; };
  }, [reviewing]);

  function openReview() {
    if (pending || sending.current || modalOpen.current || items.length === 0) return;
    modalOpen.current = true; setMessage(null); setReviewing(true);
  }
  function closeReview(force = false) {
    if (!force && (pending || sending.current)) return;
    modalOpen.current = false; setReviewing(false);
    window.requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected && !triggerRef.current.disabled) triggerRef.current.focus();
      else rootRef.current?.focus();
    });
  }
  function trapReviewFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeReview(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = focusable[0], last = focusable.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }

  async function execute() {
    if (pending || sending.current || !modalOpen.current) return;
    sending.current = true;
    setPending(true);
    setMessage(null);
    dialogRef.current?.focus();
    try {
      const response = await command("/api/admin/riot/bulk-link", {
        q,
        batchSize,
        candidateIds: items.map((item) => item.playerId),
        remainingBefore,
      }, 0);
      if (!isBulkLinkResult(response)) throw new Error("일괄 연결 결과 형식을 확인하지 못했습니다.");
      setResult(response);
      setMessage("일괄 연결 처리를 마쳤습니다.");
      closeReview(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "일괄 연결에 실패했습니다.");
      window.requestAnimationFrame(() => cancelRef.current?.focus());
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return <div ref={rootRef} tabIndex={-1} className={styles.form} data-riot-action="bulk-link">
    <div>
      <h3>활성 미연동 플레이어 미리보기</h3>
      <p>플레이어의 현재 닉네임#태그를 Riot ID로 확인한 뒤 최대 {batchSize}명을 연결합니다.</p>
    </div>
    <div className={styles.selectionList} role="list" aria-label="일괄 연결 대상">
      {items.length ? items.map((item) => <div key={item.playerId} role="listitem"><span><strong>{item.displayName}</strong><small>{item.riotId}</small></span></div>) : <p>조건에 맞는 활성 미연동 플레이어가 없습니다.</p>}
    </div>
    <p className={styles.selectionSummary} role="status">전체 {remainingBefore}명 중 이번 배치 {items.length}명</p>
    <div className={styles.actions}><button ref={triggerRef} type="button" disabled={pending || reviewing || items.length === 0} onClick={openReview}>일괄 연결 확인</button></div>
    {reviewing ? <div className={styles.dialogBackdrop}><div ref={dialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="riot-bulk-link-title" aria-describedby="riot-bulk-link-description" onKeyDown={trapReviewFocus}>
      <h3 id="riot-bulk-link-title">Riot ID 일괄 연결 확인</h3>
      <p id="riot-bulk-link-description">표시된 {items.length}명의 Riot ID 조회 · 유효한 계정만 연결</p>
      <ul>{items.map((item) => <li key={item.playerId}><strong>{item.displayName}</strong><span>{item.riotId}</span></li>)}</ul>
      {message ? <p className={styles.notice} role="alert">{message}</p> : null}
      <div className={styles.actions}><button ref={cancelRef} type="button" data-tone="quiet" disabled={pending} onClick={() => closeReview()}>취소</button><button type="button" disabled={pending} onClick={() => void execute()}>{pending ? "처리 중…" : "연결 실행"}</button></div>
    </div></div> : null}
    {result ? <dl className={styles.facts} aria-label="일괄 연결 결과"><div><dt>성공</dt><dd>{result.successCount}</dd></div><div><dt>건너뜀</dt><dd>{result.skippedCount}</dd></div><div><dt>실패</dt><dd>{result.failedCount}</dd></div><div><dt>남은 미연동</dt><dd>{result.remainingCount}</dd></div></dl> : null}
    {!reviewing && message ? <p className={styles.notice} role={result ? "status" : "alert"}>{message}</p> : null}
  </div>;
}
