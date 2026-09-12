import Link from "next/link";

import { AdminDisciplineCreateForm } from "@/components/discipline/admin-discipline-create-form";
import styles from "@/components/discipline/discipline.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

export default async function AdminDisciplineNewPage() {
  await requirePageRole("ADMIN", "/admin/discipline/new");
  return <main className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>관리자 · 새 기록</span><h1>징계 기록 등록</h1><p>당사자 공개 화면에는 사유와 식별 정보가 노출되지 않습니다.</p></div><Link className={styles.link} href="/admin/discipline">목록으로</Link></header><AdminDisciplineCreateForm /></main>;
}
