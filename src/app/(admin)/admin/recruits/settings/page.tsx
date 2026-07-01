export const dynamic = "force-dynamic";
export const revalidate = 0;

import AdminRecruitAutoFinishSettings from "../AdminRecruitAutoFinishSettings";
import AdminRecruitAutoResetSettings from "../AdminRecruitAutoResetSettings";
import AdminRecruitNumberResetButton from "../AdminRecruitNumberResetButton";
import AdminRecruitResetAllButton from "../AdminRecruitResetAllButton";
import { getRecruitAutoResetSettings } from "@/lib/kakao/recruit-auto-reset";
import { getRecruitIdleAutoFinishSettings } from "@/lib/kakao/recruit-idle-auto-finish";

export default async function AdminRecruitSettingsPage() {
  const [autoResetSettings, autoFinishSettings] = await Promise.all([
    getRecruitAutoResetSettings(),
    getRecruitIdleAutoFinishSettings(),
  ]);

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">RECRUIT SETTINGS</p>
          <h1>구인 자동화 설정</h1>
        </div>
      </div>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>자동 처리</h2>
          </div>
        </div>
        <div className="admin-recruit-actions" style={{ justifyContent: "flex-start" }}>
          <AdminRecruitAutoResetSettings
            initialEnabled={autoResetSettings.enabled}
            initialIdleHours={autoResetSettings.idleHours}
          />
          <AdminRecruitAutoFinishSettings
            initialEnabled={autoFinishSettings.enabled}
            initialIdleHours={autoFinishSettings.idleHours}
          />
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>수동 관리</h2>
          </div>
        </div>
        <div className="admin-recruit-actions" style={{ justifyContent: "flex-start" }}>
          <AdminRecruitNumberResetButton />
          <AdminRecruitResetAllButton />
        </div>
      </section>
    </main>
  );
}
