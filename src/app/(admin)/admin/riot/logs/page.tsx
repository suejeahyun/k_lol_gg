export const dynamic = "force-dynamic";

import Link from "next/link";
import { getDateDaysAgo, getRiotLogsData } from "@/lib/riot/admin-read-model";
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
  return `/admin/riot/logs${query ? `?${query}` : ""}`;
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

function codeBadge(statusCode: number | null) {
  if (!statusCode) return <span className={styles.badgeMuted}>-</span>;
  if (statusCode >= 200 && statusCode < 300) return <span className={styles.badgeGreen}>{statusCode}</span>;
  if (statusCode === 429) return <span className={styles.badgeYellow}>429</span>;
  if (statusCode >= 400) return <span className={styles.badgeRed}>{statusCode}</span>;
  return <span className={styles.badge}>{statusCode}</span>;
}

export default async function AdminRiotLogsPage(props: PageProps) {
  const params = (await props.searchParams) ?? {};
  const q = getString(params, "q").trim();
  const source = getString(params, "source").trim();
  const onlyFail = getString(params, "fail") === "Y";
  const days = getNumber(params, "days", 30, 1, 3650);
  const page = getNumber(params, "page", 1, 1, 99999);
  const pageSize = getNumber(params, "pageSize", 50, 20, 200);
  const from = getDateDaysAgo(days);

  const { logs, total, failTotal, linkLogs } = await getRiotLogsData({
    q,
    source,
    onlyFail,
    from,
    page,
    pageSize,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const failRate = total > 0 ? Number(((failTotal / total) * 100).toFixed(1)) : 0;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>RIOT AUDIT LOGS</p>
          <h1 className={styles.title}>Riot API / 연동 로그</h1>
          <p className={styles.desc}>Riot API 호출 결과와 계정 연동 감사 로그를 확인합니다. 대상 식별자는 원문 노출을 피하기 위해 마스킹 저장됩니다.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/admin/riot">대시보드</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/accounts">계정 목록</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/sync">동기화</Link>
        </div>
      </div>

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}><span>검색 결과</span><strong>{total.toLocaleString("ko-KR")}</strong><em>최근 {days}일</em></div>
        <div className={styles.kpiCard}><span>실패 로그</span><strong>{failTotal.toLocaleString("ko-KR")}</strong><em>statusCode 400 이상</em></div>
        <div className={styles.kpiCard}><span>실패율</span><strong>{failRate}%</strong><em>현재 필터 기준</em></div>
        <div className={styles.kpiCard}><span>연동 로그</span><strong>{linkLogs.length.toLocaleString("ko-KR")}</strong><em>최근 20건 표시</em></div>
      </section>

      <form className={styles.filterCard} method="get">
        <div className={styles.filterGrid}>
          <label>검색<input name="q" defaultValue={q} placeholder="endpoint, source, error, message" /></label>
          <label>Source<input name="source" defaultValue={source} placeholder="예: RIOT_CLIENT" /></label>
          <label>실패만<select name="fail" defaultValue={onlyFail ? "Y" : ""}><option value="">전체</option><option value="Y">실패만</option></select></label>
          <label>기간<select name="days" defaultValue={String(days)}><option value="1">최근 1일</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="365">최근 1년</option></select></label>
          <button className={styles.primaryButton} type="submit">조회</button>
        </div>
      </form>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div><h2>API 호출 로그</h2><p>429, 401, 403, 5xx가 반복되면 Production 신청 전 보안/호출량 기준을 재점검해야 합니다.</p></div>
          <span className={styles.tableMeta}>{page.toLocaleString("ko-KR")} / {pageCount.toLocaleString("ko-KR")} 페이지</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup><col style={{ width: "130px" }} /><col style={{ width: "190px" }} /><col style={{ width: "90px" }} /><col style={{ width: "150px" }} /><col style={{ width: "110px" }} /><col /></colgroup>
            <thead><tr><th>시간</th><th>Endpoint</th><th>상태</th><th>Source</th><th>소요</th><th>메시지</th></tr></thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6}><div className={styles.empty}>표시할 Riot API 로그가 없습니다.</div></td></tr>
              ) : logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.createdAt)}</td>
                  <td><div className={styles.stack}><strong>{compact(log.endpoint)}</strong><span className={styles.mono}>{compact(log.target)}</span></div></td>
                  <td>{codeBadge(log.statusCode)}</td>
                  <td>{compact(log.source)}</td>
                  <td>{log.durationMs == null ? "-" : `${log.durationMs}ms`}</td>
                  <td className={styles.message}>{compact(log.errorCode, "")}{log.errorCode ? " · " : ""}{compact(log.message)}</td>
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
          <div><h2>최근 계정 연동 감사 로그</h2><p>유저/관리자 연동, 해제, 관리자 보정 작업 이력입니다.</p></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>시간</th><th>작업</th><th>플레이어</th><th>Riot ID</th><th>행위자</th><th>내용</th></tr></thead>
            <tbody>
              {linkLogs.length === 0 ? (
                <tr><td colSpan={6}><div className={styles.empty}>계정 연동 감사 로그가 없습니다.</div></td></tr>
              ) : linkLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.createdAt)}</td>
                  <td><span className={styles.badge}>{compact(log.action)}</span></td>
                  <td>{log.playerId ? `#${log.playerId}` : "-"}</td>
                  <td>{compact(log.gameName, "-")}#{compact(log.tagLine, "-")}</td>
                  <td>{compact(log.actorType)} · {log.userAccountId ? `계정 #${log.userAccountId}` : "시스템"}</td>
                  <td className={styles.message}>{compact(log.message)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
