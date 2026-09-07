import Link from "next/link";

import styles from "@/components/discipline/discipline.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeDiscipline } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";
export default async function AdminDisciplinePage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  await requirePageRole("ADMIN", "/admin/discipline");
  const raw = (await searchParams).tab; const selected = Array.isArray(raw) ? raw[0] : raw; const tab = selected === "tasks" || selected === "reviews" ? selected : "records";
  const result = await loadRuntimeDiscipline((service) => service.adapter.listAdmin({ page: 1, pageSize: 50, tab }));
  return <main className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>ADMIN · DISCIPLINE</span><h1>징계 관리</h1><p>기록, 해소 과제와 검토 대기를 한곳에서 관리합니다.</p></div><Link className={styles.button} href="/admin/discipline/new">새 기록</Link></header><nav className={styles.tabs} aria-label="징계 관리 분류"><Link href="/admin/discipline" aria-current={tab === "records" ? "page" : undefined}>전체 기록</Link><Link href="/admin/discipline?tab=tasks" aria-current={tab === "tasks" ? "page" : undefined}>과제</Link><Link href="/admin/discipline?tab=reviews" aria-current={tab === "reviews" ? "page" : undefined}>검토 대기</Link></nav>
    {result.state === "ready" && result.data.items.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>대상</th><th>유형</th><th>상태</th><th>과제</th><th>등록일</th><th /></tr></thead><tbody>{result.data.items.map((record) => <tr key={record.id}><td>{record.targetName}</td><td>{record.type}</td><td>{record.active ? "활성" : "종료"}</td><td>{record.task?.status ?? "없음"}</td><td>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short" }).format(new Date(record.createdAt))}</td><td><Link href={`/admin/discipline/${record.id}`}>상세</Link></td></tr>)}</tbody></table></div> : result.state === "ready" ? <section className={styles.state}><h2>이 분류의 기록이 없습니다.</h2><p>샘플 데이터는 표시하지 않습니다.</p></section> : result.state === "unavailable" ? <section className={styles.state} role="status">징계 저장소 연결을 준비 중입니다.</section> : <section className={styles.state} role="alert">징계 기록을 불러오지 못했습니다.</section>}
  </main>;
}
