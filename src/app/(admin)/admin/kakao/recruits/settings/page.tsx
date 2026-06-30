export const dynamic = "force-dynamic";
export const revalidate = 0;

import AdminRecruitAutoResetSettings from "../../../recruits/AdminRecruitAutoResetSettings";
import AdminRecruitAutoFinishSettings from "../../../recruits/AdminRecruitAutoFinishSettings";
import AdminRecruitNumberResetButton from "../../../recruits/AdminRecruitNumberResetButton";
import AdminRecruitResetAllButton from "../../../recruits/AdminRecruitResetAllButton";
import { getRecruitAutoResetSettings } from "@/lib/kakao/recruit-auto-reset";
import { getRecruitIdleAutoFinishSettings } from "@/lib/kakao/recruit-idle-auto-finish";

export default async function AdminKakaoRecruitSettingsPage() {
  const [autoResetSettings, autoFinishSettings] = await Promise.all([
    getRecruitAutoResetSettings(),
    getRecruitIdleAutoFinishSettings(),
  ]);

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">KAKAO RECRUIT SETTINGS</p>
          <h1>카카오 구인 자동화 설정</h1>
          <p className="admin-muted">구인 번호 초기화, 활동 없음 자동마감, 수동 초기화 기능을 목록에서 분리했습니다.</p>
        </div>
        <a className="admin-button admin-button--ghost" href="/admin/kakao/recruits">구인 관리</a>
      </div>

      <section className="admin-card">
        <div className="admin-section-head"><div><h2>자동화 설정</h2><p className="admin-muted">설정 변경은 기존 API를 그대로 사용합니다. DB 마이그레이션은 필요 없습니다.</p></div></div>
        <div className="admin-recruit-actions" style={{ justifyContent: "flex-start" }}>
          <AdminRecruitAutoResetSettings initialEnabled={autoResetSettings.enabled} initialIdleHours={autoResetSettings.idleHours} />
          <AdminRecruitAutoFinishSettings initialEnabled={autoFinishSettings.enabled} initialIdleHours={autoFinishSettings.idleHours} />
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-section-head"><div><h2>수동 초기화</h2><p className="admin-muted">번호 초기화와 전체 구인 초기화는 영향 범위가 크므로 이 페이지에서만 처리합니다.</p></div></div>
        <div className="admin-recruit-actions" style={{ justifyContent: "flex-start" }}>
          <AdminRecruitNumberResetButton />
          <AdminRecruitResetAllButton />
        </div>
      </section>
    </main>
  );
}
