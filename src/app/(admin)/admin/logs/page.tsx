import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import type { AiRequestLedgerDto } from "@/modules/operations/application/ports";
import { loadRuntimeOperations } from "@/modules/operations/infrastructure/runtime-operations";

import styles from "../operations.module.css";

const LOG_VIEWS = ["events", "stats", "ai-requests"] as const;
const AI_STATUSES = ["DENIED", "PENDING", "SUCCEEDED", "FAILED"] as const;
const statusLabel = { DENIED: "거절", PENDING: "처리 대기", SUCCEEDED: "완료", FAILED: "실패" } as const;
const PAGE_SIZE = 50;
const MAX_PAGE = 10_000;
type LogQuery = Readonly<{
  view: (typeof LOG_VIEWS)[number];
  eventsPage: number;
  aiPage: number;
  action: string;
  status: AiRequestLedgerDto["status"] | "";
}>;

function parseQuery(raw: Record<string, string | string[] | undefined>): LogQuery | null {
  if (Object.entries(raw).some(([key, value]) => !["view", "eventsPage", "aiPage", "action", "status"].includes(key) || Array.isArray(value))) return null;
  const view = raw.view ?? "events";
  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  const status = raw.status ?? "";
  const eventsPageRaw = raw.eventsPage ?? "1", aiPageRaw = raw.aiPage ?? "1";
  if (typeof view !== "string" || !LOG_VIEWS.includes(view as LogQuery["view"]) ||
    typeof status !== "string" || (status !== "" && !AI_STATUSES.includes(status as AiRequestLedgerDto["status"])) ||
    (action !== "" && !/^[A-Z0-9_]{1,96}$/u.test(action)) ||
    typeof eventsPageRaw !== "string" || !/^[1-9][0-9]{0,4}$/u.test(eventsPageRaw) || Number(eventsPageRaw) > MAX_PAGE ||
    typeof aiPageRaw !== "string" || !/^[1-9][0-9]{0,4}$/u.test(aiPageRaw) || Number(aiPageRaw) > MAX_PAGE) return null;
  return { view: view as LogQuery["view"], action, status: status as LogQuery["status"], eventsPage: Number(eventsPageRaw), aiPage: Number(aiPageRaw) };
}

function logHref(query: LogQuery, changes: Partial<LogQuery> = {}) {
  const next = { ...query, ...changes };
  const params = new URLSearchParams({ view: next.view });
  if (next.eventsPage > 1) params.set("eventsPage", String(next.eventsPage));
  if (next.aiPage > 1) params.set("aiPage", String(next.aiPage));
  if (next.action) params.set("action", next.action);
  if (next.status) params.set("status", next.status);
  return `/admin/logs?${params}`;
}

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("ADMIN", "/admin/logs");
  const query = parseQuery(await searchParams);
  if (!query) return <main className={styles.page}><h1>운영 로그 센터</h1><section className={styles.state} role="alert"><h2>조회 조건을 확인해 주세요.</h2><Link className={styles.link} href="/admin/logs">조건 초기화</Link></section></main>;
  const result = await loadRuntimeOperations(async (repository) => {
    if (query.view === "stats") return { view: "stats" as const, stats: await repository.getAuditStats() };
    if (query.view === "ai-requests") return { view: "ai-requests" as const, page: await repository.listAiRequests({ page: query.aiPage, pageSize: PAGE_SIZE, status: query.status || undefined }) };
    return { view: "events" as const, page: await repository.listAuditLogs({ page: query.eventsPage, pageSize: PAGE_SIZE, action: query.action || undefined }) };
  });
  const currentPage = query.view === "ai-requests" ? query.aiPage : query.eventsPage;
  const listing = result.state === "ready" && result.data.view !== "stats" ? result.data.page : null;
  const pageCount = listing ? Math.max(1, Math.min(MAX_PAGE, Math.ceil(listing.totalCount / PAGE_SIZE))) : 1;
  const pageHref = (page: number) => logHref(query, query.view === "ai-requests" ? { aiPage: page } : { eventsPage: page });
  const resetHref = logHref(query, query.view === "ai-requests" ? { aiPage: 1, status: "" } : { eventsPage: 1, action: "" });

  return <main className={styles.page}>
    <header className={styles.header}><div><h1>운영 로그 센터</h1></div></header>
    <nav className={styles.actions} aria-label="로그 화면">
      <Link className={styles.link} aria-current={query.view === "events" ? "page" : undefined} href={logHref(query, { view: "events" })}>감사 이벤트</Link>
      <Link className={styles.link} aria-current={query.view === "stats" ? "page" : undefined} href={logHref(query, { view: "stats" })}>통계</Link>
      <Link className={styles.link} aria-current={query.view === "ai-requests" ? "page" : undefined} href={logHref(query, { view: "ai-requests" })}>AI 요청 원장</Link>
    </nav>
    {query.view !== "stats" ? <form key={logHref(query)} action="/admin/logs" method="get" className={styles.actions} aria-label={query.view === "events" ? "감사 이벤트 필터" : "AI 요청 필터"}>
      <input type="hidden" name="view" value={query.view} />
      {query.view === "events" ? <>
        <input type="hidden" name="aiPage" value={query.aiPage} /><input type="hidden" name="status" value={query.status} />
        <label className={styles.field}><span>작업 코드</span><input name="action" defaultValue={query.action} maxLength={96} pattern="[A-Z0-9_]*" placeholder="예: MMR_PROJECTION_REBUILT" /></label>
      </> : <>
        <input type="hidden" name="eventsPage" value={query.eventsPage} /><input type="hidden" name="action" value={query.action} />
        <label className={styles.field}><span>처리 상태</span><select name="status" defaultValue={query.status}><option value="">전체</option>{AI_STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
      </>}
      <button className={styles.button} type="submit">조회</button><Link className={styles.link} href={resetHref}>필터 초기화</Link>
    </form> : null}
    {result.state !== "ready" ? <section className={styles.state} role={result.state === "unavailable" ? "status" : "alert"}><p>{result.state === "unavailable" ? "감사 저장소에 연결할 수 없습니다." : "운영 로그를 읽는 중 오류가 발생했습니다."}</p><a className={styles.link} href={logHref(query)}>다시 불러오기</a></section> : <>
      {result.data.view === "stats" ? <section className={styles.grid} aria-label="감사 로그 통계">
        <article className={styles.card}>전체 이벤트<strong>{result.data.stats.totalEvents}</strong></article>
        <article className={styles.card}>24시간 이벤트<strong>{result.data.stats.eventsLast24Hours}</strong></article>
        <article className={styles.card}>24시간 작업자<strong>{result.data.stats.uniqueActorsLast24Hours}</strong></article>
        <article className={styles.card}>최근 기록<strong>{result.data.stats.latestEventAt ? new Date(result.data.stats.latestEventAt).toLocaleString("ko-KR") : "없음"}</strong></article>
      </section> : null}
      {listing ? <>
        <p aria-label="로그 조회 범위">전체 {listing.totalCount.toLocaleString("ko-KR")}건 · {listing.items.length ? `${((currentPage - 1) * PAGE_SIZE + 1).toLocaleString("ko-KR")}–${((currentPage - 1) * PAGE_SIZE + listing.items.length).toLocaleString("ko-KR")}건 표시` : "현재 페이지 0건"}</p>
        {listing.totalCount > MAX_PAGE * PAGE_SIZE ? <p className={styles.muted}>페이지 조회는 처음 500,000건까지 가능합니다. 필터로 범위를 좁혀 주세요.</p> : null}
        {listing.items.length === 0 ? <section className={styles.state} role="status"><p>{currentPage > 1 ? "현재 페이지에 기록이 없습니다." : "조건에 맞는 기록이 없습니다."}</p><Link className={styles.link} href={currentPage > 1 ? pageHref(1) : resetHref}>{currentPage > 1 ? "첫 페이지로" : "필터 초기화"}</Link></section> : null}
      </> : null}
      {result.data.view === "events" && result.data.page.items.length > 0 ? <div className={styles.tableWrap} role="region" aria-label="감사 이벤트 목록" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">시각</th><th scope="col">작업</th><th scope="col">대상</th><th scope="col">작업자</th><th scope="col">요청 ID</th></tr></thead><tbody>{result.data.page.items.map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("ko-KR")}</td><td>{log.action}</td><td>{log.targetType} · {log.targetId}</td><td>{log.actorUserAccountId ?? "JOB"}</td><td>{log.requestId}</td></tr>)}</tbody></table></div> : null}
      {result.data.view === "ai-requests" && result.data.page.items.length > 0 ? <div className={styles.tableWrap} role="region" aria-label="AI 요청 원장 목록" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">시각</th><th scope="col">상태</th><th scope="col">역할</th><th scope="col">프롬프트 해시</th><th scope="col">토큰</th><th scope="col">비용</th><th scope="col">오류</th></tr></thead><tbody>{result.data.page.items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("ko-KR")}</td><td>{statusLabel[item.status]}</td><td>{item.actorRole}</td><td>{item.promptHashPrefix}</td><td>{item.inputTokens + item.outputTokens}</td><td>{item.estimatedCostMicros}</td><td>{item.failureCode ?? "-"}</td></tr>)}</tbody></table></div> : null}
      {listing && listing.items.length > 0 && pageCount > 1 ? <nav className={styles.actions} aria-label={query.view === "events" ? "감사 이벤트 페이지" : "AI 요청 원장 페이지"}>
        {currentPage > 1 ? <Link className={styles.link} href={pageHref(currentPage - 1)}>이전</Link> : <span aria-disabled="true">이전</span>}
        <span aria-current="page">{currentPage} / {pageCount} 페이지</span>
        {currentPage < pageCount ? <Link className={styles.link} href={pageHref(currentPage + 1)}>다음</Link> : <span aria-disabled="true">다음</span>}
      </nav> : null}
    </>}
  </main>;
}
