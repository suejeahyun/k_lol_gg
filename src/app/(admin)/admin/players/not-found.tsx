import Link from "next/link";
import { SearchX } from "@/components/theme/theme-icons";

import styles from "@/components/admin/players/admin-players.module.css";

export default function AdminPlayerNotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <SearchX aria-hidden="true" />
        <h1>플레이어를 찾을 수 없습니다.</h1>

        <Link className={styles.ghostLink} href="/admin/players?status=ALL">전체 플레이어 보기 (비활성 포함)</Link>
      </section>
    </main>
  );
}
