import Link from "next/link";
import { getKakaoStatsDashboardData } from "@/lib/kakao/kakao-stats-dashboard-data";
import KakaoStatsDashboard from "./KakaoStatsDashboard";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ days?: string }>;
};

export default async function AdminKakaoStatsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const days = Number(params?.days ?? "30");
  const data = await getKakaoStatsDashboardData({ days });

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>KAKAO OPERATIONS ANALYTICS</p>
          <h1>카카오톡 운영 통계</h1>
          <p className={styles.description}>카카오 구인, 참가신청, 운영신청, 자동 처리 흐름을 통합 분석합니다.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/kakao" className={styles.linkButton}>카카오톡 요약</Link>
          <Link href={`/admin/kakao/stats?days=${days === 30 ? 7 : 30}`} className={styles.linkButton}>{days === 30 ? "최근 7일" : "최근 30일"}</Link>
        </div>
      </header>
      <KakaoStatsDashboard data={data} />
    </main>
  );
}
