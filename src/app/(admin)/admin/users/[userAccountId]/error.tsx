"use client";

import Link from "next/link";
import { Database, RotateCcw } from "@/components/theme/theme-icons";

import styles from "@/components/admin/players/admin-players.module.css";

export default function AdminUserDetailError({ retry }: { retry: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.state} data-tone="error" role="alert">
        <Database aria-hidden="true" />
        <h2>계정 상세를 불러오지 못했습니다.</h2>

        <button className={styles.primaryLink} type="button" onClick={retry}>
          <RotateCcw aria-hidden="true" /> 다시 시도
        </button>
        <Link className={styles.ghostLink} href="/admin/users">계정 목록으로 이동</Link>
      </section>
    </main>
  );
}
