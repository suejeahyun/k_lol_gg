import Link from "next/link";
import { SearchX } from "lucide-react";

import styles from "@/components/admin/players/admin-players.module.css";

export default function AdminPlayerNotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <SearchX aria-hidden="true" />
        <h1>플레이어를 찾을 수 없습니다.</h1>
        <p>UUID를 확인하거나 등록부에서 다시 선택해 주세요. 삭제된 것처럼 보이는 플레이어는 비활성 필터에서도 확인할 수 있습니다.</p>
        <Link className={styles.ghostLink} href="/admin/players?status=ALL">등록부로 돌아가기</Link>
      </section>
    </main>
  );
}
