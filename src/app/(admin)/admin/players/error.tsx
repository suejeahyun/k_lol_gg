"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import styles from "@/components/admin/players/admin-players.module.css";

export default function AdminPlayersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.state} data-tone="error" role="alert">
        <AlertCircle aria-hidden="true" />
        <h1>플레이어 관리 화면을 열지 못했습니다.</h1>
        <p>상세 오류나 회원 정보는 표시하지 않습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
        <Button size="lg" type="button" onClick={() => reset()}>다시 시도</Button>
      </section>
    </main>
  );
}
