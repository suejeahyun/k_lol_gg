import Link from "next/link";
import { getAdminLogsStatsDashboardData } from "@/lib/admin/logs-stats-dashboard-data";
import AdminLogsStatsDashboard from "./AdminLogsStatsDashboard";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ days?: string }>;
};

export default async function AdminLogsStatsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const days = Number(params?.days ?? "30");
  const data = await getAdminLogsStatsDashboardData({ days });

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>AUDIT ANALYTICS</p>
          <h1>관리자 로그 통계</h1>
          <p className={styles.description}>AdminLog 기준으로 작업 흐름, 관리자 활동, 대상 분포, 시간대 패턴을 분석합니다.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/logs" className={styles.linkButton}>로그 목록</Link>
          <Link href={`/admin/logs/stats?days=${days === 30 ? 7 : 30}`} className={styles.linkButton}>{days === 30 ? "최근 7일" : "최근 30일"}</Link>
        </div>
      </header>
      <AdminLogsStatsDashboard data={data} />
    </main>
  );
}
