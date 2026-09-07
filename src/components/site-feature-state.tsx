import Link from "next/link";
import { LockKeyhole, RefreshCw } from "lucide-react";

import type { SiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";

import styles from "./site-feature-state.module.css";

export function SiteFeatureStatePanel({ label, state }: { label: string; state: Exclude<SiteFeatureState, "enabled"> }) {
  const unavailable = state === "unavailable";
  return (
    <section className={styles.panel} role={unavailable ? "alert" : "status"} data-feature-state={state}>
      <span className={styles.icon}>{unavailable ? <RefreshCw aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}</span>
      <p className={styles.eyebrow}>{unavailable ? "TEMPORARILY UNAVAILABLE" : "FEATURE PAUSED"}</p>
      <h1>{unavailable ? `${label} 설정을 확인하고 있어요` : `${label} 기능이 잠시 쉬고 있어요`}</h1>
      <p>{unavailable ? "안전을 위해 설정을 확인할 수 있을 때까지 기능을 열지 않습니다." : "운영 설정에서 다시 열리면 이 화면에서 바로 이용할 수 있습니다."}</p>
      <Link href="/">홈으로 돌아가기</Link>
    </section>
  );
}
