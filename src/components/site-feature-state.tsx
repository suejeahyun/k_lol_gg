import Link from "next/link";
import { LockKeyhole, RefreshCw } from "@/components/theme/theme-icons";

import type { SiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";

import styles from "./site-feature-state.module.css";

export function SiteFeatureStatePanel({ label, state }: { label: string; state: Exclude<SiteFeatureState, "enabled"> }) {
  const unavailable = state === "unavailable";
  return (
    <section className={styles.panel} role={unavailable ? "alert" : "status"} data-feature-state={state}>
      <span className={styles.icon}>{unavailable ? <RefreshCw aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}</span>
      <h1>{unavailable ? `${label} 조회 실패` : `${label} 이용 중지`}</h1>
      <Link href="/">홈으로 돌아가기</Link>
    </section>
  );
}
