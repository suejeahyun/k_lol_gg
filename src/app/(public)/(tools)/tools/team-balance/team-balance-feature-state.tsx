import { Scale } from "lucide-react";

import type { SiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";

import styles from "../team-tools.module.css";

export function TeamBalanceFeatureState({ state }: { state: Exclude<SiteFeatureState, "enabled"> }) {
  return <div className={`page-wrap ${styles.page}`}><section className={styles.emptyState} role="status">
    <Scale aria-hidden="true" />
    <h1>{state === "disabled" ? "팀 밸런스 기능을 잠시 쉬고 있어요" : "팀 밸런스 설정을 확인하고 있어요"}</h1>
    <p>{state === "disabled" ? "기능이 다시 열리면 저장한 초안과 추천을 사용할 수 있습니다." : "현재 기능을 이용할 수 없습니다. 잠시 후 다시 시도해 주세요."}</p>
  </section></div>;
}
