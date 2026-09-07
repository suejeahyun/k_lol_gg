import type { Metadata } from "next";

import { OwnerDisciplineTasks } from "@/components/discipline/owner-discipline-tasks";
import styles from "@/components/discipline/discipline.module.css";
import { requireApprovedAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeDiscipline } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "내 징계 과제" };
export default async function AccountDisciplinePage() {
  const session = await requireApprovedAccountPage("/account/discipline");
  const result = await loadRuntimeDiscipline((service) => service.adapter.listOwnerTasks(session.userId));
  return <div className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>MY DISCIPLINE TASKS</span><h1>경고 해소 과제</h1><p>이미지는 한 장씩 안전하게 저장됩니다. 중간에 나가도 저장 완료된 항목부터 이어서 제출할 수 있어요.</p></div></header>
    {result.state === "ready" && result.data.length > 0 ? <OwnerDisciplineTasks tasks={result.data} /> : result.state === "ready" ? <section className={styles.state}><h2>진행할 과제가 없습니다.</h2><p>새 과제가 배정되면 이곳에서 확인할 수 있어요.</p></section> : result.state === "unavailable" ? <section className={styles.state} role="status">과제 기능을 준비 중입니다.</section> : <section className={styles.state} role="alert">과제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</section>}
  </div>;
}
