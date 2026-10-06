"use client";

import { CloudSun } from "@/components/theme/theme-icons";
import styles from "./applications.module.css";

export default function ApplicationsError({ retry }: { retry: () => void }) {
  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={`${styles.stateCard} ${styles.error}`} role="alert">
        <CloudSun aria-hidden="true" />
        <h1>참가 신청 화면을 열지 못했어요.</h1>
        <button type="button" onClick={retry}>다시 시도</button>
      </section>
    </div>
  );
}
