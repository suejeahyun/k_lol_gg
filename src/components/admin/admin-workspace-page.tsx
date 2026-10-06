import Link from "next/link";
import { ArrowLeft, Database } from "@/components/theme/theme-icons";
import type { AdminWorkspace } from "@/modules/admin/domain/admin-workspaces";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import styles from "./admin-workspace-page.module.css";

export async function AdminWorkspacePage({ workspace }: { workspace: AdminWorkspace }) {
  await requirePageRole("ADMIN", workspace.href);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>

          <h1>{workspace.label}</h1>

        </div>
        <span className={styles.foundation}>서비스 준비 중</span>
      </header>

      <section className={styles.empty} aria-labelledby={`${workspace.id}-empty-title`}>
        <div className={styles.emptyIcon}><Database aria-hidden="true" /></div>
        <div>
          <span>현재 상태 · 준비 중</span>
          <h2 id={`${workspace.id}-empty-title`}>이 기능을 준비하고 있습니다.</h2>

        </div>
      </section>

      <Link className={styles.back} href="/admin"><ArrowLeft aria-hidden="true" /> 관리자 홈으로</Link>
    </main>
  );
}
