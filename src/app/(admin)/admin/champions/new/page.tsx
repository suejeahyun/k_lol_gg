import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { AdminContentTabs } from "@/components/admin/media/admin-media-pages";

import { ChampionForm } from "../champion-form";
import styles from "@/components/admin/media/admin-media.module.css";

export default async function NewChampionPage() {
  await requirePageRole("ADMIN", "/admin/champions/new");
  return <main className={styles.page}><header className={styles.header}><div><h1>챔피언 등록</h1></div></header><AdminContentTabs active="champion" /><ChampionForm /></main>;
}
