import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import type { MatchIntegrityReview as Review } from "@/modules/matches/domain/match-integrity-review";
import styles from "../matches-admin.module.css";

const icon = {
  PASS: CheckCircle2,
  INFO: Info,
  WARNING: AlertTriangle,
  ERROR: ShieldAlert,
} as const;

export function MatchIntegrityReview({ review }: { review: Review }) {
  return <section className={styles.reviewPanel} aria-labelledby="match-review-title">
    <header className={styles.reviewHeader}>
      <div><span>DETERMINISTIC REVIEW</span><h2 id="match-review-title">AI/자동 경기 검수</h2><p>외부 AI나 비밀정보 전송 없이 저장된 경기 구조와 집계를 매번 다시 계산합니다.</p></div>
      <strong data-grade={review.grade}>{review.grade === "PASS" ? "통과" : review.grade === "REVIEW" ? "확인 필요" : "수정 필요"}</strong>
    </header>
    <div className={styles.reviewSummary}><span>오류 {review.errorCount}</span><span>경고 {review.warningCount}</span><form method="get"><input type="hidden" name="tab" value="ai-review" /><button type="submit">지금 다시 분석</button></form></div>
    <div className={styles.reviewFindings}>{review.findings.map((item) => {
      const Icon = icon[item.severity];
      return <article key={item.id} data-severity={item.severity}><Icon aria-hidden="true" /><div><h3>{item.title}</h3><p>{item.detail}</p></div><span>{item.severity === "PASS" ? "정상" : item.severity === "INFO" ? "안내" : item.severity === "WARNING" ? "확인" : "오류"}</span></article>;
    })}</div>
  </section>;
}
