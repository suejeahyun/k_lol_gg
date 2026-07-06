"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./RiotAccountManager.module.css";

type RiotAccountStatusPayload = {
  feature: { enabled: boolean; message: string };
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
    currentTier: string | null;
    peakTier: string | null;
  } | null;
  account: {
    gameName: string;
    tagLine: string;
    puuidMasked: string;
    summonerId: string | null;
    accountId: string | null;
    profileIconId: number | null;
    summonerLevel: number | null;
    isVerified: boolean;
    linkedAt: string | null;
    unlinkedAt: string | null;
    syncStatus: string;
    lastErrorMessage: string | null;
    lastErrorAt: string | null;
    lastSyncedAt: string | null;
    updatedAt: string;
  } | null;
  soloRank: {
    queueType: string;
    tier: string | null;
    rank: string | null;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
    updatedAt: string;
  } | null;
  message?: string;
};

type RiotAccountManagerProps = {
  mode: "me" | "admin";
  playerId?: number;
  title: string;
  description: string;
  eyebrow?: string;
  compact?: boolean;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function compactText(value: string | number | null | undefined, fallback = "-") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function statusBadge(status: string | null | undefined) {
  const key = compactText(status, "IDLE").toUpperCase();
  if (key === "SUCCESS") return <span className={styles.badgeGreen}>성공</span>;
  if (key === "FAILED") return <span className={styles.badgeRed}>실패</span>;
  if (key === "SYNCING") return <span className={styles.badgeYellow}>동기화중</span>;
  if (key === "SKIPPED") return <span className={styles.badgeMuted}>건너뜀</span>;
  return <span className={styles.badge}>대기</span>;
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "요청 처리 중 오류가 발생했습니다.");
  }
  return data;
}

export default function RiotAccountManager({
  mode,
  playerId,
  title,
  description,
  eyebrow = "RIOT ACCOUNT",
  compact = false,
}: RiotAccountManagerProps) {
  const [status, setStatus] = useState<RiotAccountStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const endpoints = useMemo(() => {
    if (mode === "admin") {
      const id = Number(playerId);
      return {
        status: `/api/admin/riot/players/${id}/status`,
        link: `/api/admin/riot/players/${id}/link`,
        unlink: `/api/admin/riot/players/${id}/unlink`,
        sync: `/api/admin/riot/players/${id}/sync`,
      };
    }

    return {
      status: "/api/riot/me/status",
      link: "/api/riot/me/link",
      unlink: "/api/riot/me/unlink",
      sync: "/api/riot/me/sync",
    };
  }, [mode, playerId]);

  async function loadStatus() {
    setLoading(true);
    setError("");
    try {
      const data = (await readJson(await fetch(endpoints.status, { cache: "no-store" }))) as RiotAccountStatusPayload;
      setStatus(data);
      if (data.account) {
        setGameName(data.account.gameName);
        setTagLine(data.account.tagLine);
      } else if (data.player && !gameName && !tagLine) {
        setGameName(data.player.nickname);
        setTagLine(data.player.tag);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Riot 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints.status]);

  async function handleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const data = await readJson(await fetch(endpoints.link, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameName, tagLine }),
      }));
      setMessage(data.message ?? "Riot 계정 연결이 완료되었습니다.");
      if (data.data) setStatus(data.data as RiotAccountStatusPayload);
      else await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Riot 계정 연결에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlink() {
    if (!confirm("Riot 계정 연동을 해제하고 저장된 솔랭 캐시를 삭제할까요?")) return;

    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const data = await readJson(await fetch(endpoints.unlink, { method: "POST" }));
      setMessage(data.message ?? "Riot 계정 연동을 해제했습니다.");
      if (data.data) setStatus(data.data as RiotAccountStatusPayload);
      else await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Riot 계정 연동 해제에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }


  async function handleSync() {
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const data = await readJson(await fetch(endpoints.sync, { method: "POST" }));
      setMessage(data.message ?? "Riot 솔랭 데이터 동기화가 완료되었습니다.");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Riot 솔랭 데이터 동기화에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const featureEnabled = Boolean(status?.feature.enabled);
  const canSubmit = featureEnabled && !submitting && gameName.trim().length > 0 && tagLine.trim().length > 0;
  const canSync = featureEnabled && !submitting && Boolean(status?.account);
  const account = status?.account ?? null;
  const player = status?.player ?? null;
  const soloRank = status?.soloRank ?? null;

  return (
    <main className={styles.wrap}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.desc}>{description}</p>

        <div className={`${styles.statusBanner} ${featureEnabled ? styles.statusBannerEnabled : ""}`}>
          <div>
            <strong>{featureEnabled ? "Riot 연동 기능 활성" : "Riot 연동 기능 비활성"}</strong>
            <p>{status?.feature.message ?? "Riot 연동 상태를 확인하는 중입니다."}</p>
          </div>
          <span className={featureEnabled ? styles.badgeGreen : styles.badgeYellow}>
            {featureEnabled ? "ENABLED" : "FEATURE FLAG OFF"}
          </span>
        </div>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Riot ID 연결</h2>
              <p>Production API 승인 후 Riot ID를 검증하고 플레이어와 연결합니다.</p>
            </div>
            {account ? <span className={styles.badgeGreen}>연결됨</span> : <span className={styles.badgeMuted}>미연결</span>}
          </div>

          <form className={styles.form} onSubmit={handleLink}>
            <div className={styles.fieldGrid}>
              <label>
                Riot 닉네임
                <input value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="예: Hide on bush" disabled={!featureEnabled || submitting} />
              </label>
              <label>
                태그
                <input value={tagLine} onChange={(event) => setTagLine(event.target.value.replace(/^#/, ""))} placeholder="예: KR1" disabled={!featureEnabled || submitting} />
              </label>
            </div>
            <p className={styles.help}>닉네임#태그 기준으로 PUUID를 확인합니다. API Key는 서버에서만 사용되며 브라우저에는 노출되지 않습니다.</p>
            <div className={styles.actions}>
              <button className={styles.primaryButton} type="submit" disabled={!canSubmit}>{submitting ? "처리 중" : account ? "Riot 계정 다시 연결" : "Riot 계정 연결"}</button>
              <button className={styles.secondaryButton} type="button" onClick={handleSync} disabled={!canSync}>{submitting ? "처리 중" : "솔랭 동기화"}</button>
              <button className={styles.dangerButton} type="button" onClick={handleUnlink} disabled={!account || submitting}>연동 해제</button>
              <button className={styles.secondaryButton} type="button" onClick={() => void loadStatus()} disabled={loading || submitting}>상태 새로고침</button>
            </div>
            {!featureEnabled && <div className={styles.error}>현재는 Production API 승인 전 단계라 실제 Riot 계정 연결 호출이 차단됩니다.</div>}
            {message && <div className={styles.message}>{message}</div>}
            {error && <div className={styles.error}>{error}</div>}
          </form>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>연동 상태</h2>
              <p>{loading ? "상태를 불러오는 중입니다." : "현재 저장된 Riot 계정과 솔랭 캐시입니다."}</p>
            </div>
            {account ? (account.isVerified ? <span className={styles.badgeGreen}>검증됨</span> : <span className={styles.badgeYellow}>미검증</span>) : <span className={styles.badgeMuted}>없음</span>}
          </div>

          <ul className={styles.infoList}>
            <li><span>플레이어</span><strong>{player ? `${player.name} · ${player.nickname}#${player.tag}` : "-"}</strong></li>
            <li><span>Riot ID</span><strong>{account ? `${account.gameName}#${account.tagLine}` : "연결 없음"}</strong></li>
            <li><span>PUUID</span><strong className={styles.mono}>{account?.puuidMasked ?? "-"}</strong></li>
            <li><span>소환사 레벨</span><strong>{compactText(account?.summonerLevel)}</strong></li>
            <li><span>동기화 상태</span><strong>{statusBadge(account?.syncStatus)}</strong></li>
            <li><span>마지막 갱신</span><strong>{formatDate(account?.lastSyncedAt ?? account?.updatedAt)}</strong></li>
            <li><span>솔로랭크</span><strong>{soloRank?.tier ? `${soloRank.tier} ${soloRank.rank} ${soloRank.leaguePoints}LP · ${soloRank.wins}승 ${soloRank.losses}패 · ${soloRank.winRate.toFixed(1)}%` : "저장된 솔랭 캐시 없음"}</strong></li>
            <li><span>오류</span><strong>{compactText(account?.lastErrorMessage, "오류 없음")}</strong></li>
          </ul>
        </article>
      </section>

      {!compact && (
        <section className={styles.noticeGrid}>
          <div className={styles.notice}><strong>보안 구조</strong><p>Riot API 호출은 서버 Route Handler에서만 수행하고 결과는 DB 캐시로 표시합니다.</p></div>
          <div className={styles.notice}><strong>연동 해제</strong><p>해제 시 Riot 계정 정보, 솔랭 스냅샷, 최근 솔랭 경기 캐시를 삭제합니다.</p></div>
          <div className={styles.notice}><strong>동기화 기준</strong><p>솔랭 동기화는 Player 닉네임#태그가 아니라 연결된 Riot 계정의 PUUID 기준으로 수행합니다.</p></div>
        </section>
      )}
    </main>
  );
}
