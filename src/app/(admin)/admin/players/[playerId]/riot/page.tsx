export const dynamic = "force-dynamic";

import Link from "next/link";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import RiotAccountManager from "@/components/riot/RiotAccountManager";
import { getSiteSettings } from "@/lib/site/settings";
import styles from "@/app/(admin)/admin/riot/page.module.css";

type PageProps = {
  params: Promise<{ playerId: string }>;
};

export default async function AdminPlayerRiotPage({ params }: PageProps) {
  const { playerId } = await params;
  const parsedPlayerId = Number(playerId);
  const settings = await getSiteSettings();

  if (!Number.isInteger(parsedPlayerId) || parsedPlayerId <= 0) {
    return (
      <main className={styles.page}>
        <section className={styles.noticeCard}>
          <h2>유효하지 않은 플레이어 ID입니다.</h2>
          <p>플레이어 목록에서 다시 접근해주세요.</p>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/admin/players">플레이어 목록</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <PremiumFeatureGate
      feature="riot"
      settings={settings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="ADMIN RIOT PREMIUM"
          title="관리자 Riot 계정 연결"
          description="관리자 Riot 계정 연결, 해제, 동기화는 방별 유료 기능입니다."
        />
      }
      renderLockedContent={false}
    >
      <RiotAccountManager
        mode="admin"
        playerId={parsedPlayerId}
        eyebrow="ADMIN RIOT ACCOUNT"
        title="관리자 Riot 계정 연결"
        description="관리자가 특정 플레이어의 Riot ID 연결 상태를 확인하고, Production API 승인 후 직접 연결·해제할 수 있는 화면입니다."
      />
    </PremiumFeatureGate>
  );
}
