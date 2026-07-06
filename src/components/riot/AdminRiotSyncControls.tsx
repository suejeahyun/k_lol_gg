"use client";

import { FormEvent, useState } from "react";
import styles from "./AdminRiotSyncControls.module.css";

type Props = {
  featureEnabled: boolean;
};

type BulkResult = {
  mode: string;
  totalCandidates: number;
  processedCount: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  remainingCount: number;
  message: string;
  results?: Array<{
    playerId: number;
    playerName?: string;
    playerNickname?: string;
    playerTag?: string;
    status: string;
    message: string;
  }>;
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "요청 처리 중 오류가 발생했습니다.");
  }
  return data;
}

function getBulkSummary(result: BulkResult | null) {
  if (!result) return null;

  return (
    <div className={styles.bulkSummary}>
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
          {result.results.slice(0, 8).map((item) => (
            <li key={`${item.playerId}-${item.status}`}>
              <span>
                #{item.playerId} {item.playerName || item.playerNickname || "플레이어"}
                {item.playerNickname ? ` (${item.playerNickname}#${item.playerTag ?? ""})` : ""}
              </span>
              <em>{item.status}</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminRiotSyncControls({ featureEnabled }: Props) {
  const [playerId, setPlayerId] = useState("");
  const [matchCount, setMatchCount] = useState("20");
  const [rankOnly, setRankOnly] = useState(false);
  const [force, setForce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [bulkBatchSize, setBulkBatchSize] = useState("10");
  const [bulkMatchCount, setBulkMatchCount] = useState("20");
  const [bulkRankOnly, setBulkRankOnly] = useState(false);
  const [bulkForce, setBulkForce] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState<"STALE" | "ALL" | "FAILED" | null>(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const parsedPlayerId = Number(playerId);
      if (!Number.isInteger(parsedPlayerId) || parsedPlayerId <= 0) {
        throw new Error("플레이어 ID를 숫자로 입력해주세요.");
      }

      const parsedMatchCount = Number(matchCount);
      const data = await readJson(await fetch(`/api/admin/riot/players/${parsedPlayerId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchCount: Number.isFinite(parsedMatchCount) ? parsedMatchCount : 20,
          rankOnly,
          force,
        }),
      }));

      setMessage(data.message ?? "Riot 단일 동기화가 완료되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Riot 단일 동기화에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBulkSync(mode: "STALE" | "ALL" | "FAILED") {
    setBulkSubmitting(mode);
    setBulkMessage("");
    setBulkError("");
    setBulkResult(null);

    try {
      const parsedBatchSize = Number(bulkBatchSize);
      const parsedMatchCount = Number(bulkMatchCount);
      const endpoint = mode === "FAILED" ? "/api/admin/riot/retry-failed" : "/api/admin/riot/sync-all";
      const data = await readJson(await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          batchSize: Number.isFinite(parsedBatchSize) ? parsedBatchSize : 10,
          matchCount: Number.isFinite(parsedMatchCount) ? parsedMatchCount : 20,
          rankOnly: bulkRankOnly,
          force: mode === "FAILED" ? true : bulkForce,
        }),
      }));

      setBulkMessage(data.message ?? "Riot 배치 동기화가 완료되었습니다.");
      setBulkResult(data.result ?? null);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Riot 배치 동기화에 실패했습니다.");
    } finally {
      setBulkSubmitting(null);
    }
  }

  return (
    <div className={styles.stack}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.header}>
          <div>
            <strong>관리자 단일 동기화</strong>
            <p>연결된 Riot 계정의 PUUID 기준으로 솔랭 티어와 최근 경기 캐시를 갱신합니다.</p>
          </div>
          <span className={featureEnabled ? styles.badgeGreen : styles.badgeYellow}>
            {featureEnabled ? "ENABLED" : "BLOCKED"}
          </span>
        </div>

        <div className={styles.grid}>
          <label>
            플레이어 ID
            <input value={playerId} onChange={(event) => setPlayerId(event.target.value)} inputMode="numeric" placeholder="예: 1" disabled={!featureEnabled || submitting} />
          </label>
          <label>
            최근 경기 수
            <input value={matchCount} onChange={(event) => setMatchCount(event.target.value)} inputMode="numeric" placeholder="20" disabled={!featureEnabled || submitting || rankOnly} />
          </label>
        </div>

        <div className={styles.checks}>
          <label>
            <input type="checkbox" checked={rankOnly} onChange={(event) => setRankOnly(event.target.checked)} disabled={!featureEnabled || submitting} />
            티어만 갱신
          </label>
          <label>
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} disabled={!featureEnabled || submitting} />
            쿨타임 무시
          </label>
        </div>

        <button className={styles.button} type="submit" disabled={!featureEnabled || submitting}>
          {submitting ? "동기화 중" : "단일 동기화 실행"}
        </button>

        {!featureEnabled && <div className={styles.error}>RIOT_FEATURE_ENABLED=false 상태라 실제 Riot API 호출은 차단됩니다.</div>}
        {message && <div className={styles.message}>{message}</div>}
        {error && <div className={styles.error}>{error}</div>}
      </form>

      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <strong>배치 동기화 / 실패 재시도</strong>
            <p>서버리스 타임아웃을 피하기 위해 한 번에 최대 30명만 처리합니다. 전체 150명 이상은 여러 배치로 나누어 실행하세요.</p>
          </div>
          <span className={featureEnabled ? styles.badgeGreen : styles.badgeYellow}>
            {featureEnabled ? "SUPER ADMIN" : "BLOCKED"}
          </span>
        </div>

        <div className={styles.grid}>
          <label>
            배치 인원
            <input value={bulkBatchSize} onChange={(event) => setBulkBatchSize(event.target.value)} inputMode="numeric" placeholder="10" disabled={!featureEnabled || bulkSubmitting !== null} />
          </label>
          <label>
            최근 경기 수
            <input value={bulkMatchCount} onChange={(event) => setBulkMatchCount(event.target.value)} inputMode="numeric" placeholder="20" disabled={!featureEnabled || bulkSubmitting !== null || bulkRankOnly} />
          </label>
        </div>

        <div className={styles.checks}>
          <label>
            <input type="checkbox" checked={bulkRankOnly} onChange={(event) => setBulkRankOnly(event.target.checked)} disabled={!featureEnabled || bulkSubmitting !== null} />
            티어만 갱신
          </label>
          <label>
            <input type="checkbox" checked={bulkForce} onChange={(event) => setBulkForce(event.target.checked)} disabled={!featureEnabled || bulkSubmitting !== null} />
            전체/갱신 필요 계정 쿨타임 무시
          </label>
        </div>

        <div className={styles.buttonRow}>
          <button className={styles.button} type="button" disabled={!featureEnabled || bulkSubmitting !== null} onClick={() => handleBulkSync("STALE")}>
            {bulkSubmitting === "STALE" ? "처리 중" : "갱신 필요 계정 실행"}
          </button>
          <button className={styles.secondaryButton} type="button" disabled={!featureEnabled || bulkSubmitting !== null} onClick={() => handleBulkSync("ALL")}>
            {bulkSubmitting === "ALL" ? "처리 중" : "전체 계정 배치 실행"}
          </button>
          <button className={styles.dangerButton} type="button" disabled={!featureEnabled || bulkSubmitting !== null} onClick={() => handleBulkSync("FAILED")}>
            {bulkSubmitting === "FAILED" ? "재시도 중" : "실패 계정 재시도"}
          </button>
        </div>

        <div className={styles.note}>
          전체 계정 배치 실행은 최고 관리자 권한이 필요합니다. 실패 계정 재시도는 실패 상태와 최근 오류가 있는 계정만 대상으로 합니다.
        </div>

        {bulkMessage && <div className={styles.message}>{bulkMessage}</div>}
        {bulkError && <div className={styles.error}>{bulkError}</div>}
        {getBulkSummary(bulkResult)}
      </section>
    </div>
  );
}
