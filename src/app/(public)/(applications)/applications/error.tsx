"use client";

import { CloudSun } from "lucide-react";
import styles from "./applications.module.css";

export default function ApplicationsError({ reset }: { reset: () => void }) {
  return (
    <main className={`page-wrap ${styles.page}`}>
      <section className={`${styles.stateCard} ${styles.error}`} role="alert">
        <CloudSun aria-hidden="true" />
        <h1>참가 신청 화면을 열지 못했어요.</h1>
        <p>입력 내용은 전송되지 않았습니다. 잠시 후 다시 시도해 주세요.</p>
        <button type="button" onClick={reset}>다시 시도</button>
      </section>
    </main>
  );
}
