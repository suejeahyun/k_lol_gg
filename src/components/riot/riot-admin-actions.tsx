"use client";

import { useState } from "react";

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
  return <div><div className={styles.actions}><button disabled={pending} onClick={() => void run(failed ? "/api/admin/riot/retry" : "/api/admin/riot/sync")}>{failed ? "재시도" : "동기화"}</button></div>{message ? <small role="status">{message}</small> : null}</div>;
}

export function RiotAdminGlobalActions({ superAdmin }: Readonly<{ superAdmin: boolean }>) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [revision, setRevision] = useState(0);
  const [bulkIds, setBulkIds] = useState("");
  function run(operation: () => Promise<void>, success: string) {
    setPending(true); setMessage(null);
    void operation().then(() => setMessage(success)).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "요청에 실패했습니다.")).finally(() => setPending(false));
  }
  return <div>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); run(() => command("/api/admin/riot/link", { playerId, gameName, tagLine }, revision), "단일 연결을 반영했습니다."); }}>
      <label>플레이어 UUID<input value={playerId} onChange={(event) => setPlayerId(event.target.value)} required /></label>
      <label>Riot ID<input value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="게임 이름" required /><input value={tagLine} onChange={(event) => setTagLine(event.target.value)} placeholder="태그" required /></label>
      <label>현재 revision<input type="number" min={0} value={revision} onChange={(event) => setRevision(Number(event.target.value))} required /></label>
      <div className={styles.actions}><button disabled={pending}>단일 연결</button></div>
    </form>
    {superAdmin ? <form className={styles.form} onSubmit={(event) => { event.preventDefault(); run(() => command("/api/admin/riot/bulk", { linkIds: bulkIds.split(",").map((id) => id.trim()).filter(Boolean) }), "일괄 동기화를 큐에 등록했습니다."); }}><label>일괄 link UUID<input value={bulkIds} onChange={(event) => setBulkIds(event.target.value)} placeholder="쉼표로 구분" required /></label><div className={styles.actions}><button disabled={pending}>선택 일괄 동기화</button><button type="button" data-tone="quiet" disabled={pending} onClick={() => run(() => command("/api/admin/riot/sync", { all: true }), "전체 동기화를 큐에 등록했습니다.")}>전체 동기화</button></div></form> : null}
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
  </div>;
}
