export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import SiteSettingsClient from "./SiteSettingsClient";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";

export default async function AdminSiteSettingsPage() {
  const admin = await requireSuperAdminRequest();
  if (!admin) redirect("/admin/login");

  const settings = await getSiteSettings();

  return (
    <main className="admin-page site-settings-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">SITE CONTROL</p>
          <h1>사이트 설정</h1>
          <p className="admin-page__description">
            배포된 방마다 사이트 이름, 유료 상태, 카카오톡/구인/K-LOL 랭킹/Riot 기능을 따로 관리합니다.
          </p>
        </div>
      </div>

      <section className="card-grid site-settings-summary">
        <div className="stat-card">
          <span className="stat-card__label">사이트</span>
          <strong className="stat-card__value">{settings.siteName}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">유료 상태</span>
          <strong className="stat-card__value">{settings.planStatus === "ACTIVE" ? "활성" : "잠금"}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">카카오/구인</span>
          <strong className="stat-card__value">
            {isSiteFeatureEnabled(settings, "recruit") ? "오픈" : "잠금"}
          </strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">K-LOL 랭킹</span>
          <strong className="stat-card__value">
            {isSiteFeatureEnabled(settings, "balanceAi") ? "오픈" : "잠금"}
          </strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">랜덤 팀</span>
          <strong className="stat-card__value">
            {isSiteFeatureEnabled(settings, "randomTeam") ? "오픈" : "잠금"}
          </strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Riot 연동</span>
          <strong className="stat-card__value">
            {isSiteFeatureEnabled(settings, "riot") ? "오픈" : "잠금"}
          </strong>
        </div>
      </section>

      <SiteSettingsClient initialSettings={settings} />

      <section className="admin-card site-settings-guide">
        <div className="admin-section-head">
          <div>
            <h2>배포 방식</h2>
            <p>각 오픈채팅방 사이트는 같은 코드와 다른 DB/ENV를 사용합니다.</p>
          </div>
        </div>
        <div className="site-settings-flow">
          <span>Vercel 배포</span>
          <span>새 DB 연결</span>
          <span>슈퍼어드민 로그인</span>
          <span>유료 상태 활성화</span>
          <span>기능 오픈</span>
        </div>
        <div className="site-settings-links">
          <Link href="/recruit">구인현황 확인</Link>
          <Link href="/ai-balance">K-LOL 랭킹 확인</Link>
          <Link href="/admin/kakao">카카오톡 운영센터 확인</Link>
        </div>
      </section>
    </main>
  );
}
