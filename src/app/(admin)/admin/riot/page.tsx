export const dynamic = "force-dynamic";

import Link from "next/link";
import { getDateDaysAgo, getRiotDashboardData } from "@/lib/riot/admin-read-model";
import { getRiotFeatureStatus } from "@/lib/riot/feature";
import styles from "./page.module.css";

function formatDate(value: Date | string | null | undefined) {
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

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("ko-KR");
}

function compact(value: string | null | undefined, fallback = "-") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function syncStatusBadge(status: string | null | undefined) {
  const key = compact(status, "IDLE").toUpperCase();
  if (key === "SUCCESS") return <span className={styles.badgeGreen}>성공</span>;
  if (key === "FAILED") return <span className={styles.badgeRed}>실패</span>;
  if (key === "SYNCING") return <span className={styles.badgeYellow}>동기화중</span>;
  if (key === "SKIPPED") return <span className={styles.badgeMuted}>건너뜀</span>;
  return <span className={styles.badge}>대기</span>;
}

export default async function AdminRiotPage() {
  const feature = getRiotFeatureStatus();
  const since24h = getDateDaysAgo(1);

  const {
    totalPlayers,
    linkedAccounts,
    verifiedAccounts,
    failedAccounts,
    rankSnapshots,
    soloMatches,
    apiLogs24h,
    failedApiLogs24h,
    recentAccounts,
    recentJobs,
  } = await getRiotDashboardData(since24h);

  const linkedRate = totalPlayers > 0 ? Number(((linkedAccounts / totalPlayers) * 100).toFixed(1)) : 0;
  const apiFailRate = apiLogs24h > 0 ? Number(((failedApiLogs24h / apiLogs24h) * 100).toFixed(1)) : 0;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>RIOT PRODUCTION CONTROL</p>
          <h1 className={styles.title}>Riot 연동 관리</h1>
          <p className={styles.desc}>
            Riot 계정 연결 현황, 솔랭 캐시, API 호출 로그, 동기화 작업 이력을 한 곳에서 확인합니다. Production 승인 전에는 실제 호출이 기능 플래그로 차단됩니다.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/admin/riot/accounts">계정 목록</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/accounts/bulk-link">일괄 연결</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/logs">API 로그</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/sync">동기화 이력</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/application">신청 자료</Link>
        </div>
      </div>

      <section className={`${styles.statusBanner} ${feature.enabled ? styles.statusBannerEnabled : ""}`}>
        <div>
          <strong>{feature.enabled ? "Riot 기능 활성" : "Riot 기능 비활성"}</strong>
          <p>{feature.message}</p>
        </div>
        <span className={feature.enabled ? styles.badgeGreen : styles.badgeYellow}>
          {feature.enabled ? "ENABLED" : "FEATURE FLAG OFF"}
        </span>
      </section>

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}><span>활성 플레이어</span><strong>{formatNumber(totalPlayers)}</strong><em>isActive 기준</em></div>
        <div className={styles.kpiCard}><span>Riot 연결</span><strong>{formatNumber(linkedAccounts)}</strong><em>연결률 {linkedRate}%</em></div>
        <div className={styles.kpiCard}><span>RSO 인증 완료</span><strong>{formatNumber(verifiedAccounts)}</strong><em>본인 소유 인증 기준</em></div>
        <div className={styles.kpiCard}><span>동기화 실패</span><strong>{formatNumber(failedAccounts)}</strong><em>확인 필요 계정</em></div>
      </section>

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}><span>솔랭 스냅샷</span><strong>{formatNumber(rankSnapshots)}</strong><em>PlayerSoloRankSnapshot</em></div>
        <div className={styles.kpiCard}><span>저장된 솔랭 경기</span><strong>{formatNumber(soloMatches)}</strong><em>PlayerSoloMatch</em></div>
        <div className={styles.kpiCard}><span>24시간 API 호출</span><strong>{formatNumber(apiLogs24h)}</strong><em>RiotApiRequestLog</em></div>
        <div className={styles.kpiCard}><span>24시간 실패율</span><strong>{apiFailRate}%</strong><em>{formatNumber(failedApiLogs24h)}건 실패</em></div>
      </section>

      <section className={styles.gridTwo}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>최근 Riot 계정</h2>
              <p>최근 갱신된 Riot 계정과 솔랭 캐시 상태입니다.</p>
            </div>
            <Link className={styles.secondaryButton} href="/admin/riot/accounts">전체 보기</Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>플레이어</th><th>Riot ID</th><th>솔랭</th><th>상태</th><th>갱신</th></tr></thead>
              <tbody>
                {recentAccounts.length === 0 ? (
                  <tr><td colSpan={5}><div className={styles.empty}>연결된 Riot 계정이 없습니다.</div></td></tr>
                ) : recentAccounts.map((account) => {
                  const rank = account.player.soloRankSnapshot;
                  return (
                    <tr key={account.id}>
                      <td><Link className={styles.playerCell} href={`/admin/players/${account.playerId}`}><strong>{account.player.name}</strong><span>{account.player.nickname}#{account.player.tag}</span></Link></td>
                      <td><div className={styles.stack}><strong>{account.gameName}#{account.tagLine}</strong><span className={styles.mono}>{compact(account.puuid).slice(0, 8)}…</span></div></td>
                      <td>{rank?.tier ? <div className={styles.stack}><strong>{rank.tier} {rank.rank} {rank.leaguePoints}LP</strong><span>{rank.wins}승 {rank.losses}패 · {rank.winRate.toFixed(1)}%</span></div> : <span className={styles.badgeMuted}>없음</span>}</td>
                      <td>{syncStatusBadge(account.syncStatus)}</td>
                      <td>{formatDate(account.lastSyncedAt ?? account.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>최근 동기화 작업</h2>
              <p>전체/단일 동기화 작업 이력입니다.</p>
            </div>
            <Link className={styles.secondaryButton} href="/admin/riot/sync">작업 보기</Link>
          </div>
          <ul className={styles.list}>
            {recentJobs.length === 0 ? (
              <li><span>동기화 작업</span><strong>기록 없음</strong></li>
            ) : recentJobs.map((job) => (
              <li key={job.id}>
                <span>{job.type} · {formatDate(job.createdAt)}</span>
                <strong>{job.status} · {formatNumber(job.successCount)}/{formatNumber(job.totalCount)}</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className={styles.quickGrid}>
        <Link className={styles.quickCard} href="/admin/riot/accounts"><strong>계정 현황</strong><span>연결된 Riot ID, PUUID 마스킹, 솔랭 캐시, 실패 계정을 확인합니다.</span></Link>
        <Link className={styles.quickCard} href="/admin/riot/accounts/bulk-link"><strong>일괄 연결</strong><span>미연동 플레이어를 닉네임#태그 기준으로 30명 단위 연결합니다.</span></Link>
        <Link className={styles.quickCard} href="/admin/riot/logs"><strong>API/연동 로그</strong><span>Riot API 호출 결과와 계정 연동/해제 감사 로그를 확인합니다.</span></Link>
        <Link className={styles.quickCard} href="/admin/riot/sync"><strong>동기화 관리</strong><span>동기화 작업 이력과 Production 승인 후 활성화 순서를 확인합니다.</span></Link>
        <Link className={styles.quickCard} href="/admin/riot/application"><strong>Production 신청 자료</strong><span>Developer Portal 신청용 영문 설명, 보안 설명, 시연 흐름, 체크리스트를 확인합니다.</span></Link>
      </section>
    </main>
  );
}
