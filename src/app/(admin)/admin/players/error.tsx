"use client";

import { AlertCircle } from "@/components/theme/theme-icons";

import { Button } from "@/components/ui/button";
import styles from "@/components/admin/players/admin-players.module.css";

export default function AdminPlayersError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.state} data-tone="error" role="alert">
        <AlertCircle aria-hidden="true" />
        <h1>플레이어 관리 화면을 열지 못했습니다.</h1>

        <Button size="lg" type="button" onClick={retry}>다시 시도</Button>
      </section>
    </main>
  );
}
