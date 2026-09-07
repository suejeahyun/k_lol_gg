"use client";

import { useState } from "react";

import { BoundedPicker, type BoundedPickerOption } from "@/app/(admin)/admin/matches/bounded-picker";
import type { AdminRiotRowDto } from "@/modules/riot/application/riot-query";

import styles from "./riot-workspace.module.css";

async function command(path: string, body: object, revision?: number) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...(revision === undefined ? {} : { "If-Match": `\"${revision}\"` }) }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null) as { title?: string } | null;
  if (!response.ok) throw new Error(data?.title ?? "요청을 처리하지 못했습니다.");
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
  const selectedPlayer = items.find((item) => item.playerId === playerId);
  const revision = selectedPlayer?.revision ?? 0;
  const playerOptions: readonly BoundedPickerOption[] = items.map((item) => ({
    value: item.playerId,
    label: `${item.displayName} · ${item.riotId}`,
    status: item.status === "CONNECTED" ? "INACTIVE" : "ACTIVE",
    searchText: item.riotId,
  }));
  const connectedItems = items.filter((item): item is AdminRiotRowDto & { linkId: string } => item.status === "CONNECTED" && Boolean(item.linkId));

  function selectPlayer(value: string) {
    setPlayerId(value);
    const selected = items.find((item) => item.playerId === value);
    const [nextGameName = "", nextTagLine = ""] = selected?.riotId.split("#", 2) ?? [];
    setGameName(nextGameName);
    setTagLine(nextTagLine);
  }

  function toggleLink(linkId: string) {
    setSelectedLinkIds((current) => {
      const next = new Set(current);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }

  function run(operation: () => Promise<void>, success: string) {
    setPending(true); setMessage(null);
    void operation().then(() => setMessage(success)).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "요청에 실패했습니다.")).finally(() => setPending(false));
  }
  return <div>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); run(() => command("/api/admin/riot/link", { playerId, gameName, tagLine }, revision), "단일 연결을 반영했습니다."); }}>
      <label><span>연결할 플레이어</span><BoundedPicker ariaLabel="Riot 단일 연결 플레이어" value={playerId} options={playerOptions} placeholder="현재 목록에서 이름 또는 Riot ID 검색" onChange={selectPlayer} /></label>
      <label>게임 이름<input value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="게임 이름" required /></label><label>태그<input value={tagLine} onChange={(event) => setTagLine(event.target.value)} placeholder="태그" required /></label>
      <p className={styles.selectionSummary} role="status">{selectedPlayer ? `${selectedPlayer.displayName} · 현재 revision ${revision} 자동 적용` : "현재 목록에서 미연결·연결 해제 플레이어를 선택해 주세요."}</p>
      <div className={styles.actions}><button type="submit" disabled={pending || !selectedPlayer || !gameName || !tagLine}>단일 연결</button></div>
    </form>
    {superAdmin ? <form className={styles.form} onSubmit={(event) => { event.preventDefault(); setReviewingBulk(true); }}><fieldset className={styles.selectionList}><legend>현재 목록의 연결 계정 선택</legend>{connectedItems.length ? connectedItems.map((item) => <label key={item.linkId}><input type="checkbox" checked={selectedLinkIds.has(item.linkId)} onChange={() => toggleLink(item.linkId)} /><span><strong>{item.displayName}</strong><small>{item.riotId}</small></span></label>) : <p>현재 목록에 동기화할 연결 계정이 없습니다.</p>}</fieldset><p className={styles.selectionSummary} role="status">{selectedLinkIds.size}개 계정을 선택했습니다.</p><div className={styles.actions}><button type="submit" disabled={pending || selectedLinkIds.size === 0}>선택 일괄 동기화 미리보기</button><button type="button" data-tone="quiet" disabled={pending} onClick={() => run(() => command("/api/admin/riot/sync", { all: true }), "전체 동기화를 큐에 등록했습니다.")}>전체 동기화</button></div></form> : null}
    {reviewingBulk ? <div className={styles.dialogBackdrop}><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="riot-bulk-review-title" aria-describedby="riot-bulk-review-description" onKeyDown={(event) => { if (event.key === "Escape") setReviewingBulk(false); }}><h3 id="riot-bulk-review-title">일괄 동기화 확인</h3><p id="riot-bulk-review-description">선택한 {selectedLinkIds.size}개 계정을 동기화 큐에 등록합니다.</p><ul>{connectedItems.filter((item) => selectedLinkIds.has(item.linkId)).map((item) => <li key={item.linkId}><strong>{item.displayName}</strong><span>{item.riotId}</span></li>)}</ul><div className={styles.actions}><button type="button" data-tone="quiet" autoFocus onClick={() => setReviewingBulk(false)}>취소</button><button type="button" disabled={pending} onClick={() => { setReviewingBulk(false); run(() => command("/api/admin/riot/bulk", { linkIds: [...selectedLinkIds].sort() }), "일괄 동기화를 큐에 등록했습니다."); }}>등록 확인</button></div></div></div> : null}
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
  </div>;
}
