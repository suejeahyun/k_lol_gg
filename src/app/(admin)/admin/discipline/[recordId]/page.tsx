import { notFound } from "next/navigation";
import Link from "next/link";

import { AdminDisciplineActions } from "@/components/discipline/admin-discipline-actions";
import styles from "@/components/discipline/discipline.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeDiscipline } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";
export default async function AdminDisciplineDetailPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params; const session = await requirePageRole("ADMIN", `/admin/discipline/${recordId}`);
  const result = await loadRuntimeDiscipline((service) => service.adapter.getAdminRecord(recordId));
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <main className={styles.page}><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h1>징계 상세를 불러오지 못했습니다.</h1></section></main>;
  const record = result.data!;
  return <main className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>ADMIN · DETAIL</span><h1>{record.targetName}</h1><p>{record.type} · revision {record.revision}</p></div><Link className={styles.link} href="/admin/discipline">목록으로</Link></header><div className={styles.detailGrid}><section className={styles.panel}><h2>기록</h2><dl className={styles.facts}><div><dt>분류</dt><dd>{record.category}</dd></div><div><dt>출처</dt><dd>{record.source}</dd></div><div><dt>활성</dt><dd>{record.active ? "활성" : "종료"}</dd></div><div><dt>등록</dt><dd>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(record.createdAt))}</dd></div></dl><h3>사유</h3><p>{record.reason}</p></section><section className={styles.panel}><h2>해소 과제</h2>{record.task ? <><p><span className={styles.badge}>{record.task.status}</span> · {record.task.submittedEvidenceCount}/{record.task.requiredGameCount}장</p>{record.task.reviewNote ? <p className={styles.notice}>{record.task.reviewNote}</p> : null}<div className={styles.evidence}>{record.task.evidence.map((item, index) => <a key={item.assetId} href={`/api/admin/discipline/assets/${item.assetId}`} target="_blank" rel="noreferrer">증거 {index + 1}<br />{item.status}</a>)}</div></> : <p className={styles.muted}>연결된 과제가 없습니다.</p>}</section></div><AdminDisciplineActions record={record} canManage={session.role === "SUPER_ADMIN"} /></main>;
}
