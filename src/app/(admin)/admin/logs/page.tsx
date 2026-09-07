import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeOperations } from "@/modules/operations/infrastructure/runtime-operations";

import styles from "../operations.module.css";

export default async function AdminLogsPage() {
  await requirePageRole("SUPER_ADMIN", "/admin/logs");
  const result = await loadRuntimeOperations(async (repository) => ({ logs: await repository.listAuditLogs({ page: 1, pageSize: 50 }), stats: await repository.getAuditStats() }));
  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>SUPER · 감사</span><h1>운영 감사 로그</h1><p>원문 payload 대신 누가 무엇을 언제 바꿨는지 필요한 필드만 표시합니다.</p></div><Link className={styles.link} href="/admin/ai-requests">AI 요청 ledger</Link></header>
    {result.state === "unavailable" ? <section className={styles.state}>감사 저장소에 연결할 수 없습니다.</section> : result.state === "error" ? <section className={styles.state}>감사 로그를 읽는 중 오류가 발생했습니다.</section> : <>
      <section className={styles.grid}><article className={styles.card}>전체 이벤트<strong>{result.data.stats.totalEvents}</strong></article><article className={styles.card}>24시간 이벤트<strong>{result.data.stats.eventsLast24Hours}</strong></article><article className={styles.card}>24시간 작업자<strong>{result.data.stats.uniqueActorsLast24Hours}</strong></article><article className={styles.card}>최근 기록<strong>{result.data.stats.latestEventAt ? new Date(result.data.stats.latestEventAt).toLocaleString("ko-KR") : "없음"}</strong></article></section>
      {result.data.logs.items.length === 0 ? <section className={styles.state}>아직 기록된 감사 로그가 없습니다.</section> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>시각</th><th>작업</th><th>대상</th><th>작업자</th><th>요청 ID</th></tr></thead><tbody>{result.data.logs.items.map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("ko-KR")}</td><td>{log.action}</td><td>{log.targetType} · {log.targetId}</td><td>{log.actorUserAccountId ?? "JOB"}</td><td>{log.requestId}</td></tr>)}</tbody></table></div>}
    </>}
  </main>;
}
