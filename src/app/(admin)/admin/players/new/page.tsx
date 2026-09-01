import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { AdminPlayerForm } from "@/components/admin/players/admin-player-form";
import styles from "@/components/admin/players/admin-players.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

export default async function AdminPlayerNewPage() {
  await requirePageRole("ADMIN", "/admin/players/new");
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 보호된 등록 작업</span>
          <h1>새 플레이어 등록</h1>
          <p>필수 공개 정보와 관리자 전용 회원명을 분리해 저장하고, 성공한 요청은 감사 기록과 멱등성 영수증을 남깁니다.</p>
        </div>
        <Link className={styles.ghostLink} href="/admin/players"><ArrowLeft aria-hidden="true" /> 목록으로</Link>
      </header>
      <section className={styles.formCard}>
        <AdminPlayerForm mode="create" />
      </section>
    </main>
  );
}
