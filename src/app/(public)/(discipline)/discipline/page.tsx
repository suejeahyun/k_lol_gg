import type { Metadata } from "next";
import { CircleAlert, Sparkles } from "lucide-react";

import styles from "@/components/discipline/discipline.module.css";
import { loadRuntimeDiscipline } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "징계 안내", description: "K-LOL.GG 징계 정책과 익명 집계 현황입니다.", alternates: { canonical: "/discipline" } };

export default async function DisciplinePage() {
  const result = await loadRuntimeDiscipline((service) => service.adapter.getPublicStatistics());
  return <div className={styles.page}>
    <section className={styles.hero}><div><span className={styles.eyebrow}>FAIR PLAY</span><h1>함께 지키는 플레이 약속</h1><p>개인 식별 정보와 사유는 공개하지 않고, 전체 처리 현황만 보여드려요.</p></div><Sparkles aria-hidden="true" /></section>
    {result.state === "ready" ? <>
      <section className={styles.stats} aria-label="징계 익명 집계"><article className={styles.card}><span>활성 주의</span><strong>{result.data.activeCautionCount}</strong></article><article className={styles.card}><span>활성 경고</span><strong>{result.data.activeWarningCount}</strong></article><article className={styles.card}><span>활성 이용 제한</span><strong>{result.data.activeBanCount}</strong></article><article className={styles.card}><span>해결 완료</span><strong>{result.data.resolvedCount}</strong></article></section>
      <section className={styles.rules}><article className={styles.panel}><h2>주의와 경고</h2><p>활성 주의 3회는 경고 검토로 전환됩니다. 경고 해소 과제는 일반 10게임, 내전 15게임 기준입니다.</p></article><article className={styles.panel}><h2>비공개 증거</h2><p>과제 이미지는 승인된 당사자와 관리자만 확인할 수 있습니다. 원본 저장 위치와 파일 해시는 화면에 공개하지 않습니다.</p></article></section>
      {result.data.updatedAt === null ? <p className={styles.notice}>아직 집계할 징계 기록이 없습니다.</p> : <p className={styles.muted}>마지막 집계 기준 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(result.data.updatedAt))}</p>}
    </> : result.state === "unavailable" ? <section className={styles.state} role="status"><h2>집계 저장소 연결을 준비 중입니다.</h2><p>샘플 기록은 표시하지 않습니다.</p></section> : <section className={styles.state} role="alert"><CircleAlert aria-hidden="true" /><h2>징계 집계를 불러오지 못했습니다.</h2><p>잠시 후 다시 시도해 주세요.</p></section>}
  </div>;
}
