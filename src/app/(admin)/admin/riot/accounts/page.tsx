export const dynamic = "force-dynamic";

import Link from "next/link";
import { getRiotAccountsData } from "@/lib/riot/admin-read-model";
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
  return `/admin/riot/accounts${query ? `?${query}` : ""}`;
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

function mask(value: string | null | undefined) {
  const text = compact(value, "");
  if (!text) return "-";
  if (text.length <= 12) return "****";
  return `${text.slice(0, 6)}…${text.slice(-6)}`;
}

function statusBadge(status: string | null | undefined) {
  const key = compact(status, "IDLE").toUpperCase();
  if (key === "SUCCESS") return <span className={styles.badgeGreen}>성공</span>;
  if (key === "FAILED") return <span className={styles.badgeRed}>실패</span>;
  if (key === "SYNCING") return <span className={styles.badgeYellow}>동기화중</span>;
  if (key === "SKIPPED") return <span className={styles.badgeMuted}>건너뜀</span>;
  return <span className={styles.badge}>대기</span>;
}

export default async function AdminRiotAccountsPage(props: PageProps) {
  const params = (await props.searchParams) ?? {};
  const q = getString(params, "q").trim();
  const status = getString(params, "status").trim();
  const verified = getString(params, "verified").trim();
  const page = getNumber(params, "page", 1, 1, 99999);
  const pageSize = getNumber(params, "pageSize", 30, 10, 100);

  const { accounts, total, totalLinked, failedCount, verifiedCount } = await getRiotAccountsData({
    q,
    status,
    verified,
    page,
    pageSize,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>RIOT ACCOUNTS</p>
          <h1 className={styles.title}>Riot 계정 목록</h1>
          <p className={styles.desc}>플레이어와 연결된 Riot ID, 솔랭 캐시, 검증 상태, 동기화 실패 사유를 확인합니다. PUUID는 화면에서 마스킹합니다.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/admin/riot">대시보드</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/logs">로그</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/sync">동기화</Link>
        </div>
      </div>

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}><span>검색 결과</span><strong>{total.toLocaleString("ko-KR")}</strong><em>현재 필터 기준</em></div>
        <div className={styles.kpiCard}><span>전체 연결</span><strong>{totalLinked.toLocaleString("ko-KR")}</strong><em>PlayerRiotAccount</em></div>
        <div className={styles.kpiCard}><span>검증 완료</span><strong>{verifiedCount.toLocaleString("ko-KR")}</strong><em>isVerified=true</em></div>
        <div className={styles.kpiCard}><span>실패 계정</span><strong>{failedCount.toLocaleString("ko-KR")}</strong><em>syncStatus=FAILED</em></div>
      </section>

      <form className={styles.filterCard} method="get">
        <div className={styles.filterGrid}>
          <label>검색<input name="q" defaultValue={q} placeholder="이름, 닉네임, 태그, Riot ID" /></label>
          <label>동기화 상태<select name="status" defaultValue={status}><option value="">전체</option><option value="IDLE">대기</option><option value="SYNCING">동기화중</option><option value="SUCCESS">성공</option><option value="FAILED">실패</option><option value="SKIPPED">건너뜀</option></select></label>
          <label>검증<select name="verified" defaultValue={verified}><option value="">전체</option><option value="Y">검증됨</option><option value="N">미검증</option></select></label>
          <label>표시<select name="pageSize" defaultValue={String(pageSize)}><option value="10">10개</option><option value="30">30개</option><option value="50">50개</option><option value="100">100개</option></select></label>
          <button className={styles.primaryButton} type="submit">조회</button>
        </div>
      </form>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div><h2>연결 계정</h2><p>연결 계정의 상태를 확인하고, 플레이어별 Riot 연결 관리 화면으로 이동합니다.</p></div>
          <span className={styles.tableMeta}>{page.toLocaleString("ko-KR")} / {pageCount.toLocaleString("ko-KR")} 페이지</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup><col style={{ width: "190px" }} /><col style={{ width: "190px" }} /><col style={{ width: "150px" }} /><col style={{ width: "150px" }} /><col style={{ width: "120px" }} /><col style={{ width: "130px" }} /><col /><col style={{ width: "110px" }} /></colgroup>
            <thead><tr><th>플레이어</th><th>Riot ID</th><th>PUUID</th><th>솔랭 캐시</th><th>검증</th><th>상태</th><th>최근 정보</th><th>관리</th></tr></thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr><td colSpan={8}><div className={styles.empty}>조건에 맞는 Riot 계정이 없습니다.</div></td></tr>
              ) : accounts.map((account) => {
                const rank = account.player.soloRankSnapshot;
                return (
                  <tr key={account.id}>
                    <td><Link className={styles.playerCell} href={`/admin/players/${account.playerId}`}><strong>{account.player.name}</strong><span>{account.player.nickname}#{account.player.tag}</span></Link></td>
                    <td><div className={styles.stack}><strong>{account.gameName}#{account.tagLine}</strong><span>{account.unlinkedAt ? "연동 해제됨" : "연동 중"}</span></div></td>
                    <td className={styles.mono}>{mask(account.puuid)}</td>
                    <td>{rank?.tier ? <div className={styles.stack}><strong>{rank.tier} {rank.rank} {rank.leaguePoints}LP</strong><span>{rank.wins}승 {rank.losses}패 · {rank.winRate.toFixed(1)}%</span></div> : <span className={styles.badgeMuted}>없음</span>}</td>
                    <td>{account.isVerified ? <span className={styles.badgeGreen}>검증됨</span> : <span className={styles.badgeYellow}>미검증</span>}</td>
                    <td>{statusBadge(account.syncStatus)}</td>
                    <td><div className={styles.stack}><strong>{formatDate(account.lastSyncedAt ?? account.updatedAt)}</strong><span>{compact(account.lastErrorMessage, account.lastErrorAt ? "오류 메시지 없음" : "오류 없음")}</span></div></td>
                    <td><Link className={styles.secondaryButton} href={`/admin/players/${account.playerId}/riot`}>관리</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <Link className={styles.pageButton} href={buildHref(params, { page: Math.max(1, page - 1) })}>이전</Link>
          <span className={styles.pageInfo}>{page.toLocaleString("ko-KR")} / {pageCount.toLocaleString("ko-KR")}</span>
          <Link className={styles.pageButton} href={buildHref(params, { page: Math.min(pageCount, page + 1) })}>다음</Link>
        </div>
      </section>
    </main>
  );
}
