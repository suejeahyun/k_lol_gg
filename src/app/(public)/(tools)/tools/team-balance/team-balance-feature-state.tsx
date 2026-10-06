import { Scale } from "@/components/theme/theme-icons";

import type { SiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";

import styles from "../team-tools.module.css";

export function TeamBalanceFeatureState({ state }: { state: Exclude<SiteFeatureState, "enabled"> }) {
  return <div className={`page-wrap ${styles.page}`}><section className={styles.emptyState} role="status">
    <Scale aria-hidden="true" />
    <h1>{state === "disabled" ? "팀 밸런스 기능을 잠시 쉬고 있어요" : "팀 밸런스 설정을 확인하고 있어요"}</h1>
    {state !== "disabled" ? <p>잠시 후 다시 시도해 주세요.</p> : null}
  </section></div>;
}
