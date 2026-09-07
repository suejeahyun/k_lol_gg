import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeOperations } from "@/modules/operations/infrastructure/runtime-operations";

import styles from "../operations.module.css";

const LOG_VIEWS = ["events", "stats", "ai-requests"] as const;
type LogView = (typeof LOG_VIEWS)[number];

function normalizeView(value: string | undefined): LogView {
  return LOG_VIEWS.includes(value as LogView) ? value as LogView : "events";
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePageRole("SUPER_ADMIN", "/admin/logs");
  const view = normalizeView((await searchParams).view);
  const result = await loadRuntimeOperations(async (repository) => {
    const [logs, stats, aiRequests] = await Promise.all([
      repository.listAuditLogs({ page: 1, pageSize: 50 }),
      repository.getAuditStats(),
      repository.listAiRequests({ page: 1, pageSize: 50 }),
    ]);
    return { logs, stats, aiRequests };
  });

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>SUPER · 감사</span><h1>운영 로그 센터</h1><p>감사 이벤트, 운영 통계, AI 요청 원장을 한곳에서 확인합니다.</p></div>
    </header>
    <nav className={styles.actions} aria-label="로그 화면">
      <Link className={styles.link} aria-current={view === "events" ? "page" : undefined} href="/admin/logs">감사 이벤트</Link>
      <Link className={styles.link} aria-current={view === "stats" ? "page" : undefined} href="/admin/logs?view=stats">통계</Link>
      <Link className={styles.link} aria-current={view === "ai-requests" ? "page" : undefined} href="/admin/logs?view=ai-requests">AI 요청 원장</Link>
    </nav>
    {result.state === "unavailable" ? <section className={styles.state} role="status">감사 저장소에 연결할 수 없습니다.</section> : result.state === "error" ? <section className={styles.state} role="alert">운영 로그를 읽는 중 오류가 발생했습니다.</section> : <>
      {view === "stats" ? <section className={styles.grid} aria-label="감사 로그 통계">
        <article className={styles.card}>전체 이벤트<strong>{result.data.stats.totalEvents}</strong></article>
        <article className={styles.card}>24시간 이벤트<strong>{result.data.stats.eventsLast24Hours}</strong></article>
        <article className={styles.card}>24시간 작업자<strong>{result.data.stats.uniqueActorsLast24Hours}</strong></article>
        <article className={styles.card}>최근 기록<strong>{result.data.stats.latestEventAt ? new Date(result.data.stats.latestEventAt).toLocaleString("ko-KR") : "없음"}</strong></article>
      </section> : null}
      {view === "events" ? result.data.logs.items.length === 0 ? <section className={styles.state}>아직 기록된 감사 로그가 없습니다.</section> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>시각</th><th>작업</th><th>대상</th><th>작업자</th><th>요청 ID</th></tr></thead><tbody>{result.data.logs.items.map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("ko-KR")}</td><td>{log.action}</td><td>{log.targetType} · {log.targetId}</td><td>{log.actorUserAccountId ?? "JOB"}</td><td>{log.requestId}</td></tr>)}</tbody></table></div> : null}
      {view === "ai-requests" ? result.data.aiRequests.items.length === 0 ? <section className={styles.state}>기록된 AI 요청이 없습니다. AI는 기본적으로 비활성입니다.</section> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>시각</th><th>상태</th><th>역할</th><th>프롬프트 해시</th><th>토큰</th><th>비용</th><th>오류</th></tr></thead><tbody>{result.data.aiRequests.items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("ko-KR")}</td><td>{item.status}</td><td>{item.actorRole}</td><td>{item.promptHashPrefix}</td><td>{item.inputTokens + item.outputTokens}</td><td>{item.estimatedCostMicros}</td><td>{item.failureCode ?? "-"}</td></tr>)}</tbody></table></div> : null}
    </>}
  </main>;
}
