import Link from "next/link";
import { ArrowLeft } from "@/components/theme/theme-icons";

import { AdminPlayerForm } from "@/components/admin/players/admin-player-form";
import styles from "@/components/admin/players/admin-players.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

export default async function AdminPlayerNewPage() {
  await requirePageRole("ADMIN", "/admin/players/new");
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>

          <h1>새 플레이어 등록</h1>

        </div>
        <Link className={styles.ghostLink} href="/admin/players"><ArrowLeft aria-hidden="true" /> 목록으로</Link>
      </header>
      <section className={styles.formCard}>
        <AdminPlayerForm mode="create" />
      </section>
    </main>
  );
}
