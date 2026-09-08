import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { AdminContentTabs } from "@/components/admin/media/admin-media-pages";

import { ChampionForm } from "../champion-form";
import styles from "@/components/admin/media/admin-media.module.css";

export default async function NewChampionPage() {
  await requirePageRole("ADMIN", "/admin/champions/new");
  return <main className={styles.page}><header className={styles.header}><div><strong>새 콘텐츠</strong><h1>챔피언 등록</h1><p>영문 고정 키와 사이트에 표시할 이름을 입력합니다.</p></div></header><AdminContentTabs active="champion" /><ChampionForm /></main>;
}
