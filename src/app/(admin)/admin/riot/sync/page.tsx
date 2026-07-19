export const dynamic = "force-dynamic";

import Link from "next/link";
import AdminRiotSyncControls from "@/components/riot/AdminRiotSyncControls";
import { getRiotSyncData, isOlderThanDays } from "@/lib/riot/admin-read-model";
import { getRiotFeatureStatus } from "@/lib/riot/feature";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import styles from "../page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams?: Promise<SearchParams> };

function getString(params: SearchParams, key: string, fallback = "") {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function getNumber(params: SearchParams, key: string, fallback: number, min: number, max: number) {
  const parsed = Number(getString(params, key, String(fallback)));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function buildHref(params: SearchParams, patch: Record<string, string | number | null>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return `/admin/riot/sync${query ? `?${query}` : ""}`;
}

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

function compact(value: string | null | undefined, fallback = "-") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function statusBadge(status: string | null | undefined) {
  const key = compact(status, "PENDING").toUpperCase();
  if (key === "SUCCESS" || key === "COMPLETED") return <span className={styles.badgeGreen}>성공</span>;
  if (key === "FAILED") return <span className={styles.badgeRed}>실패</span>;
  if (key === "PARTIAL") return <span className={styles.badgeYellow}>부분 성공</span>;
  if (key === "RUNNING") return <span className={styles.badgeYellow}>진행중</span>;
  if (key === "SKIPPED") return <span className={styles.badgeMuted}>건너뜀</span>;
  return <span className={styles.badge}>대기</span>;
}

function durationText(startedAt: Date | null, finishedAt: Date | null) {
  if (!startedAt || !finishedAt) return "-";
  const diff = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  if (diff < 1000) return `${diff}ms`;
  return `${Math.round(diff / 1000)}초`;
}

export default async function AdminRiotSyncPage(props: PageProps) {
  const admin = await requireAdminRequest();
  const isSuperAdmin = admin?.user.role === "SUPER_ADMIN";
  const params = (await props.searchParams) ?? {};
  const status = getString(params, "status").trim();
  const type = getString(params, "type").trim();
  const page = getNumber(params, "page", 1, 1, 99999);
  const pageSize = getNumber(params, "pageSize", 30, 10, 100);
  const feature = getRiotFeatureStatus();

  const { jobs, total, runningCount, failedCount, recentAccounts } = await getRiotSyncData({
    status,
    type,
    page,
    pageSize,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const staleCount = recentAccounts.filter((account) => {
    return isOlderThanDays(account.lastSyncedAt, 1);
  }).length;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>RIOT SYNC CONTROL</p>
          <h1 className={styles.title}>Riot 동기화 관리</h1>
          <p className={styles.desc}>Production 승인 전에는 기능 플래그로 실제 호출을 차단합니다. 승인 후에는 단일 동기화, 갱신 필요 계정 배치, 전체 계정 배치, 실패 계정 재시도를 이 화면에서 단계적으로 실행합니다.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/admin/riot">대시보드</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/accounts">계정 목록</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/logs">로그</Link>
        </div>
      </div>

      <section className={`${styles.statusBanner} ${feature.enabled ? styles.statusBannerEnabled : ""}`}>
        <div>
          <strong>{feature.enabled ? "동기화 기능 활성 준비" : "동기화 실행 비활성"}</strong>
          <p>{feature.message} 승인 전에는 사용자/관리자 실시간 Riot API 호출을 열지 않습니다.</p>
        </div>
        <span className={feature.enabled ? styles.badgeGreen : styles.badgeYellow}>{feature.enabled ? "ENABLED" : "BLOCKED"}</span>
      </section>

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}><span>작업 검색 결과</span><strong>{total.toLocaleString("ko-KR")}</strong><em>RiotSyncJob</em></div>
        <div className={styles.kpiCard}><span>진행중 작업</span><strong>{runningCount.toLocaleString("ko-KR")}</strong><em>RUNNING</em></div>
        <div className={styles.kpiCard}><span>실패 작업</span><strong>{failedCount.toLocaleString("ko-KR")}</strong><em>FAILED</em></div>
        <div className={styles.kpiCard}><span>갱신 우선 계정</span><strong>{staleCount.toLocaleString("ko-KR")}</strong><em>미갱신 또는 24시간 초과</em></div>
      </section>

      <section className={styles.gridTwo}>
        <article className={styles.noticeCard}>
          <h2>Production 승인 후 활성화 순서</h2>
          <p>승인 전에는 기능 플래그로 실제 호출을 막고, 승인 후 Vercel 환경변수 적용 → 단일 테스트 → 소규모 테스트 → 전체 동기화 순서로 엽니다.</p>
          <ul className={styles.list}>
            <li><span>1단계</span><strong>RIOT_API_KEY 등록</strong></li>
            <li><span>2단계</span><strong>RIOT_FEATURE_ENABLED=true</strong></li>
            <li><span>3단계</span><strong>관리자 단일 1명 테스트</strong></li>
            <li><span>4단계</span><strong>5명 → 20명 → 전체 동기화</strong></li>
          </ul>
        </article>
        <article className={styles.noticeCard}>
          <h2>단일 동기화 실행</h2>
          <p>전체 동기화는 서버리스 타임아웃을 피하기 위해 배치 단위로 처리합니다. 먼저 단일 1명 테스트 후 5명, 10명, 20명 단위로 늘리는 순서를 권장합니다.</p>
          <AdminRiotSyncControls featureEnabled={feature.enabled} isSuperAdmin={isSuperAdmin} />
        </article>
      </section>

      <form className={styles.filterCard} method="get">
        <div className={styles.filterGrid}>
          <label>작업 타입<input name="type" defaultValue={type} placeholder="예: SINGLE_PLAYER, ALL_PLAYERS" /></label>
          <label>상태<select name="status" defaultValue={status}><option value="">전체</option><option value="PENDING">대기</option><option value="RUNNING">진행중</option><option value="SUCCESS">성공</option><option value="FAILED">실패</option><option value="PARTIAL">부분 성공</option></select></label>
          <label>표시<select name="pageSize" defaultValue={String(pageSize)}><option value="10">10개</option><option value="30">30개</option><option value="50">50개</option><option value="100">100개</option></select></label>
          <label>페이지<input name="page" defaultValue={String(page)} inputMode="numeric" /></label>
          <button className={styles.primaryButton} type="submit">조회</button>
        </div>
      </form>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div><h2>동기화 작업 이력</h2><p>작업 단위 성공/실패 수와 메시지를 확인합니다.</p></div>
          <span className={styles.tableMeta}>{page.toLocaleString("ko-KR")} / {pageCount.toLocaleString("ko-KR")} 페이지</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup><col style={{ width: "120px" }} /><col style={{ width: "170px" }} /><col style={{ width: "120px" }} /><col style={{ width: "150px" }} /><col style={{ width: "120px" }} /><col /></colgroup>
            <thead><tr><th>생성</th><th>타입</th><th>상태</th><th>성공/실패</th><th>소요</th><th>메시지</th></tr></thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td colSpan={6}><div className={styles.empty}>동기화 작업 이력이 없습니다.</div></td></tr>
              ) : jobs.map((job) => (
                <tr key={job.id}>
                  <td>{formatDate(job.createdAt)}</td>
                  <td><div className={styles.stack}><strong>{job.type}</strong><span>요청자 {job.requestedByUserAccountId ? `#${job.requestedByUserAccountId}` : "시스템"}</span></div></td>
                  <td>{statusBadge(job.status)}</td>
                  <td>{job.successCount.toLocaleString("ko-KR")} / {job.failedCount.toLocaleString("ko-KR")} <span className={styles.badgeMuted}>총 {job.totalCount.toLocaleString("ko-KR")}</span></td>
                  <td>{durationText(job.startedAt, job.finishedAt)}</td>
                  <td className={styles.message}>{compact(job.message)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <Link className={styles.pageButton} href={buildHref(params, { page: Math.max(1, page - 1) })}>이전</Link>
          <span className={styles.pageInfo}>{page.toLocaleString("ko-KR")} / {pageCount.toLocaleString("ko-KR")}</span>
          <Link className={styles.pageButton} href={buildHref(params, { page: Math.min(pageCount, page + 1) })}>다음</Link>
        </div>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div><h2>갱신 우선 계정</h2><p>마지막 갱신이 오래되었거나 아직 갱신되지 않은 계정입니다.</p></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>플레이어</th><th>Riot ID</th><th>상태</th><th>마지막 갱신</th><th>오류</th></tr></thead>
            <tbody>
              {recentAccounts.length === 0 ? (
                <tr><td colSpan={5}><div className={styles.empty}>갱신 대상 계정이 없습니다.</div></td></tr>
              ) : recentAccounts.map((account) => (
                <tr key={account.id}>
                  <td><Link className={styles.playerCell} href={`/admin/players/${account.playerId}`}><strong>{account.player.name}</strong><span>{account.player.nickname}#{account.player.tag}</span></Link></td>
                  <td>{account.gameName}#{account.tagLine}</td>
                  <td>{statusBadge(account.syncStatus)}</td>
                  <td>{formatDate(account.lastSyncedAt)}</td>
                  <td className={styles.message}>{compact(account.lastErrorMessage, "오류 없음")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
