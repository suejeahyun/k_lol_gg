import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

import { ChampionForm } from "../champion-form";
import styles from "../champions.module.css";

export default async function NewChampionPage() {
  await requirePageRole("ADMIN", "/admin/champions/new");
  return <main className={styles.page}><header className={styles.header}><div><strong>새 챔피언</strong><h1>챔피언 등록</h1><p>영문 고정 키와 사이트에 표시할 이름을 입력합니다.</p></div></header><ChampionForm /></main>;
}
