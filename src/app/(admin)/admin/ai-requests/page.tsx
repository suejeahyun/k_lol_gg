import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeOperations } from "@/modules/operations/infrastructure/runtime-operations";

import styles from "../operations.module.css";

export default async function AdminAiRequestsPage() {
  await requirePageRole("SUPER_ADMIN", "/admin/ai-requests");
  const result = await loadRuntimeOperations((repository) => repository.listAiRequests({ page: 1, pageSize: 50 }));
  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>SUPER · AI</span><h1>AI 요청 ledger</h1><p>프롬프트와 응답 원문은 표시하지 않고 사용량·비용·상태만 확인합니다.</p></div></header>
    {result.state === "unavailable" ? <section className={styles.state}>AI ledger에 연결할 수 없습니다.</section> : result.state === "error" ? <section className={styles.state}>AI ledger를 읽는 중 오류가 발생했습니다.</section> : result.data.items.length === 0 ? <section className={styles.state}>기록된 AI 요청이 없습니다. AI는 기본적으로 비활성입니다.</section> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>시각</th><th>상태</th><th>역할</th><th>프롬프트 해시</th><th>토큰</th><th>비용</th><th>오류</th></tr></thead><tbody>{result.data.items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("ko-KR")}</td><td>{item.status}</td><td>{item.actorRole}</td><td>{item.promptHashPrefix}</td><td>{item.inputTokens + item.outputTokens}</td><td>{item.estimatedCostMicros}</td><td>{item.failureCode ?? "-"}</td></tr>)}</tbody></table></div>}
  </main>;
}
