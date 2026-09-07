import { Activity, Database, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeAdminStatisticsData } from "@/modules/statistics/infrastructure/runtime-statistics-data";

import { StatisticsRecalculateButton } from "./statistics-recalculate-button";
import styles from "./statistics.module.css";

export const dynamic = "force-dynamic";

export default async function AdminBalancePage() {
  const session = await requirePageRole("ADMIN", "/admin/balance");
  const result = await loadRuntimeAdminStatisticsData((service) => service.getAdminStatus(null));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span><ShieldCheck aria-hidden="true" /> S05 보호된 작업 공간</span><h1>통계·랭킹 상태</h1><p>경기 원본에서 만든 시즌 projection과 처리 대기 이벤트를 확인합니다.</p></div>
        <nav aria-label="밸런스 관리 화면"><Link href="/admin/balance/drafts">저장 초안</Link> · <Link href="/admin/balance-ai">MMR 작업대</Link></nav>
      </header>

      {result.state === "ready" ? (
        <>
          <section className={styles.summary} aria-label="통계 처리 상태">
            <article><Activity /><span>처리 대기</span><strong>{result.data.pendingEventCount}</strong></article>
            <article><RefreshCw /><span>실패 이벤트</span><strong>{result.data.failedEventCount}</strong></article>
            <article><Database /><span>시즌 projection</span><strong>{result.data.seasons.length}</strong></article>
          </section>
          {result.data.seasons.length === 0 ? (
            <section className={styles.state}><h2>등록된 시즌이 없습니다.</h2><p>시즌을 만든 뒤 통계 projection을 준비할 수 있습니다.</p></section>
          ) : (
            <section className={styles.list} aria-labelledby="statistics-seasons-title">
              <header><div><span>PROJECTIONS</span><h2 id="statistics-seasons-title">시즌별 집계</h2></div><p>ADMIN은 상태를 확인하고 SUPER_ADMIN만 수동 재계산할 수 있습니다.</p></header>
              <div>
                {result.data.seasons.map((item) => (
                  <article key={item.season.id}>
                    <div className={styles.season}><span>{item.season.status}</span><strong>{item.season.name}</strong><small>{item.projection.status} · generation {item.projection.generation}</small></div>
                    <dl>
                      <div><dt>경기</dt><dd>{item.projection.sourceMatchCount}</dd></div>
                      <div><dt>게임</dt><dd>{item.projection.sourceGameCount}</dd></div>
                      <div><dt>참가 행</dt><dd>{item.projection.sourceParticipantCount}</dd></div>
                      <div><dt>대기/실패</dt><dd>{item.pendingEventCount} / {item.failedEventCount}</dd></div>
                    </dl>
                    <div className={styles.action}>
                      <small>{item.projection.calculatedAt ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(item.projection.calculatedAt)) : "아직 계산되지 않음"}</small>
                      {item.lastFailureCode ? <code>{item.lastFailureCode}</code> : null}
                      <StatisticsRecalculateButton seasonId={item.season.id} seasonName={item.season.name} generation={item.projection.generation} allowed={session.role === "SUPER_ADMIN"} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      ) : result.state === "unavailable" ? (
        <section className={styles.state} role="status"><h2>통계 정보를 확인할 수 없습니다.</h2><p>잠시 후 다시 시도해 주세요.</p></section>
      ) : (
        <section className={styles.state} role="alert"><h2>통계 상태를 불러오지 못했습니다.</h2><p>상세 오류는 공개하지 않습니다. 잠시 후 다시 시도해 주세요.</p></section>
      )}
    </main>
  );
}
