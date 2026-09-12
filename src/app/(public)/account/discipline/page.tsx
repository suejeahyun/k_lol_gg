import type { Metadata } from "next";
import Link from "next/link";

import { OwnerDisciplineTasks } from "@/components/discipline/owner-discipline-tasks";
import styles from "@/components/discipline/discipline.module.css";
import { requireApprovedAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeDiscipline } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "내 징계 과제" };
export default async function AccountDisciplinePage() {
  const session = await requireApprovedAccountPage("/account/discipline");
  const result = await loadRuntimeDiscipline((service) => service.adapter.getOwnerOverview(session.userId));
  return <div className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>내 경고 해소 과제</span><h1>경고 해소 과제</h1><p>이미지는 한 장씩 안전하게 저장됩니다. 중간에 나가도 저장 완료된 항목부터 이어서 제출할 수 있어요.</p></div></header>
    {result.state === "ready" ? <><section className={styles.stats} aria-label="현재 제재 요약"><article className={styles.card}><span>주의</span><strong>{result.data.activeCounts.CAUTION}</strong></article><article className={styles.card}><span>경고</span><strong>{result.data.activeCounts.WARNING}</strong></article><article className={styles.card}><span>밴</span><strong>{result.data.activeCounts.BAN}</strong></article><article className={styles.card}><span>진행 과제</span><strong>{result.data.tasks.filter((task) => !["APPROVED", "CANCELLED"].includes(task.status)).length}</strong></article></section>
      {result.data.records.length > 0 ? <section className={styles.recordSection} aria-labelledby="active-discipline-title"><div className={styles.taskHeader}><h2 id="active-discipline-title">현재 적용 중인 기록</h2><Link className={styles.link} href="/account">내 계정으로</Link></div><div className={styles.recordGrid}>{result.data.records.map((record) => <article className={styles.panel} id={`record-${record.id}`} key={record.id}><div className={styles.taskHeader}><strong>{record.type === "CAUTION" ? "주의" : record.type === "WARNING" ? "경고" : "밴"}</strong><span className={styles.badge}>{record.category === "INHOUSE" ? "내전" : "일반"}</span></div><p>{record.reason}</p><small className={styles.muted}>등록 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(record.createdAt))}</small>{record.taskId ? <a className={styles.recordLink} href={`#task-${record.taskId}`}>해당 해소 과제와 증빙 제출로 이동</a> : <p className={styles.notice}>이 기록에는 현재 제출할 증빙 과제가 없습니다.</p>}</article>)}</div></section> : <section className={styles.state}><h2>현재 적용 중인 기록이 없습니다.</h2><p>주의·경고·밴이 등록되면 사유와 과제를 이곳에서 확인할 수 있어요.</p></section>}
      {result.data.tasks.length > 0 ? <OwnerDisciplineTasks tasks={result.data.tasks} /> : null}</> : result.state === "unavailable" ? <section className={styles.state} role="status">과제 기능을 준비 중입니다.</section> : <section className={styles.state} role="alert">과제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</section>}
  </div>;
}
