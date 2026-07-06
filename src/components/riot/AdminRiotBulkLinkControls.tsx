"use client";

import { FormEvent, useState } from "react";
import styles from "./AdminRiotBulkLinkControls.module.css";

type Props = {
  featureEnabled: boolean;
  initialQ: string;
  initialBatchSize: number;
};

type BulkLinkResult = {
  totalCandidates: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  remainingCount: number;
  message: string;
  results?: Array<{
    playerId: number;
    playerName: string;
    playerNickname: string;
    playerTag: string;
    riotId: string;
    status: string;
    message: string;
    syncStatus?: string;
    syncMessage?: string;
  }>;
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "요청 처리 중 오류가 발생했습니다.");
  }
  return data;
}

function renderResult(result: BulkLinkResult | null) {
  if (!result) return null;

  return (
    <div className={styles.resultBox}>
      <strong>{result.message}</strong>
      <div className={styles.summaryGrid}>
        <span>후보 {result.totalCandidates.toLocaleString("ko-KR")}</span>
        <span>처리 {result.processedCount.toLocaleString("ko-KR")}</span>
        <span>성공 {result.successCount.toLocaleString("ko-KR")}</span>
        <span>건너뜀 {result.skippedCount.toLocaleString("ko-KR")}</span>
        <span>실패 {result.failedCount.toLocaleString("ko-KR")}</span>
        <span>남음 {result.remainingCount.toLocaleString("ko-KR")}</span>
      </div>
      {result.results && result.results.length > 0 && (
        <ul className={styles.resultList}>
          {result.results.slice(0, 12).map((item) => (
            <li key={`${item.playerId}-${item.status}`}>
              <div>
                <strong>#{item.playerId} {item.playerName}</strong>
                <span>{item.playerNickname}#{item.playerTag} → {item.riotId}</span>
              </div>
              <em>{item.status}</em>
              <span>{item.syncMessage || item.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminRiotBulkLinkControls({ featureEnabled, initialQ, initialBatchSize }: Props) {
  const [q, setQ] = useState(initialQ);
  const [batchSize, setBatchSize] = useState(String(initialBatchSize));
  const [syncAfterLink, setSyncAfterLink] = useState(false);
  const [rankOnly, setRankOnly] = useState(true);
  const [matchCount, setMatchCount] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<BulkLinkResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");
    setResult(null);

    try {
      const parsedBatchSize = Number(batchSize);
      const parsedMatchCount = Number(matchCount);
      const data = await readJson(await fetch("/api/admin/riot/bulk-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q,
          batchSize: Number.isFinite(parsedBatchSize) ? parsedBatchSize : initialBatchSize,
          syncAfterLink,
          rankOnly,
          matchCount: Number.isFinite(parsedMatchCount) ? parsedMatchCount : 0,
        }),
      }));

      setMessage(data.message ?? "Riot 계정 일괄 연결이 완료되었습니다.");
      setResult(data.result ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Riot 계정 일괄 연결에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div className={styles.header}>
        <div>
          <strong>Riot 계정 일괄 연결 실행</strong>
          <p>미연동 활성 플레이어의 닉네임#태그를 Riot ID로 사용해 PUUID를 조회하고 PlayerRiotAccount를 생성합니다.</p>
        </div>
        <span className={featureEnabled ? styles.badgeGreen : styles.badgeYellow}>
          {featureEnabled ? "SUPER ADMIN" : "BLOCKED"}
        </span>
      </div>

      <div className={styles.grid}>
        <label>
          검색 조건
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="비우면 전체 미연동 대상" disabled={!featureEnabled || submitting} />
        </label>
        <label>
          배치 인원
          <input value={batchSize} onChange={(event) => setBatchSize(event.target.value)} inputMode="numeric" disabled={!featureEnabled || submitting} />
        </label>
        <label>
          최근 경기 수
          <input value={matchCount} onChange={(event) => setMatchCount(event.target.value)} inputMode="numeric" disabled={!featureEnabled || submitting || !syncAfterLink || rankOnly} />
        </label>
      </div>

      <div className={styles.checks}>
        <label>
          <input type="checkbox" checked={syncAfterLink} onChange={(event) => setSyncAfterLink(event.target.checked)} disabled={!featureEnabled || submitting} />
          연결 성공 후 솔랭 동기화도 실행
        </label>
        <label>
          <input type="checkbox" checked={rankOnly} onChange={(event) => setRankOnly(event.target.checked)} disabled={!featureEnabled || submitting || !syncAfterLink} />
          티어만 동기화
        </label>
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.button} type="submit" disabled={!featureEnabled || submitting}>
          {submitting ? "일괄 연결 중" : "미연동 계정 일괄 연결"}
        </button>
        <button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => window.location.reload()}>
          화면 새로고침
        </button>
      </div>

      <p className={styles.note}>1회 최대 30명까지 처리합니다. 이 기능은 Riot ID 존재 확인 및 관리자 연결이며, 유저 본인 소유 확인은 유저가 /me/riot에서 직접 확인하는 방식으로 별도 관리하는 것이 안전합니다.</p>

      {!featureEnabled && <div className={styles.error}>RIOT_FEATURE_ENABLED=false 상태라 실제 Riot API 호출은 차단됩니다.</div>}
      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
      {renderResult(result)}
    </form>
  );
}
