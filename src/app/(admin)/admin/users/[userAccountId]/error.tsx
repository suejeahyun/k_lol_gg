"use client";

import Link from "next/link";
import { Database, RotateCcw } from "lucide-react";

import styles from "@/components/admin/players/admin-players.module.css";

export default function AdminUserDetailError() {
  return (
    <main className={styles.page}>
      <section className={styles.state} data-tone="error" role="alert">
        <Database aria-hidden="true" />
        <h2>계정 상세를 불러오지 못했습니다.</h2>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button className={styles.primaryLink} type="button" onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden="true" /> 다시 시도
        </button>
        <Link className={styles.ghostLink} href="/admin/users">계정 목록으로 이동</Link>
      </section>
    </main>
  );
}
