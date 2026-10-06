import Link from "next/link";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { usageEnabled, usageRange, type UsageRange } from "@/modules/usage/domain/usage";
import { excludedUsageUsers, usageRepository } from "@/modules/usage/infrastructure/runtime-usage";
import { UsageReportView } from "@/components/usage/usage-report";
import styles from "@/components/usage/usage-report.module.css";

export default async function AdminUsagePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePageRole("ADMIN", "/admin/usage");
  const query = await searchParams;
  let range: UsageRange;
  try { range = usageRange(query.from, query.to); }
  catch { return <main className={styles.page}><h1>사이트 이용 현황</h1><p role="alert">오늘까지의 날짜를 기준으로 1~92일을 선택해 주세요.</p><Link href="/admin/usage">최근 30일 보기</Link></main>; }
  let report = null;
  try { if (process.env.V2_PUBLIC_DATA_SOURCE === "postgres") report = await usageRepository().report(range, excludedUsageUsers()); }
  catch { /* Show unavailable, never plausible-looking zero metrics. */ }
  return <main className={styles.page}>
    <header className={styles.header}><h1>사이트 이용 현황</h1></header>
    <form className={styles.filters} action="/admin/usage"><label>시작일<input type="date" name="from" defaultValue={range.from} required /></label><label>종료일<input type="date" name="to" defaultValue={range.to} required /></label><button type="submit">조회</button><Link href="/admin/usage">최근 30일</Link>{report && <a href={`/api/admin/usage/export?from=${range.from}&to=${range.to}`}>일별 CSV 내려받기</a>}</form>
    {report ? <UsageReportView report={report} range={range} enabled={usageEnabled(process.env)} /> : <section className={styles.notice} role="status">이용 통계 저장소를 사용할 수 없습니다. 연결과 통계 테이블 준비 상태를 확인해 주세요. 실제 방문자 수가 0명이라는 뜻은 아닙니다.</section>}
  </main>;
}
