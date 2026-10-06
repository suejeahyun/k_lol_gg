import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeOperations } from "@/modules/operations/infrastructure/runtime-operations";

import styles from "../operations.module.css";
import SettingsForm from "./settings-form";

export default async function AdminSiteSettingsPage() {
  await requirePageRole("SUPER_ADMIN", "/admin/site-settings");
  const result = await loadRuntimeOperations((repository) => repository.getSiteSettings());
  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>최고 관리자 전용</span><h1>사이트 설정</h1></div></header>
    {result.state === "unavailable" ? <section className={styles.state}>설정 저장소에 연결할 수 없습니다.</section> : result.state === "error" ? <section className={styles.state}>설정을 읽는 중 오류가 발생했습니다.</section> : <SettingsForm initial={result.data} />}
  </main>;
}
