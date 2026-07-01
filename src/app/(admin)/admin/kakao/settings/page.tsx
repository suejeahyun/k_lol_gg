export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getKakaoOperationSettings } from "@/lib/kakao/settings";
import { getRecruitAutoResetSettings } from "@/lib/kakao/recruit-auto-reset";
import { getRecruitIdleAutoFinishSettings } from "@/lib/kakao/recruit-idle-auto-finish";
import AdminRecruitAutoResetSettings from "../../recruits/AdminRecruitAutoResetSettings";
import AdminRecruitAutoFinishSettings from "../../recruits/AdminRecruitAutoFinishSettings";
import AdminRecruitNumberResetButton from "../../recruits/AdminRecruitNumberResetButton";
import AdminRecruitResetAllButton from "../../recruits/AdminRecruitResetAllButton";
import KakaoOperationSettingsClient from "./KakaoOperationSettingsClient";

export default async function AdminKakaoSettingsPage() {
  const [settings, autoResetSettings, idleFinishSettings] = await Promise.all([
    getKakaoOperationSettings(),
    getRecruitAutoResetSettings(),
    getRecruitIdleAutoFinishSettings(),
  ]);

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">KAKAO SETTINGS</p>
          <h1>카카오톡 설정</h1>
          <p className="admin-muted">카카오톡 명령, 응답 문구, 방 제한, 발신자 제한, 출력 개수, rate limit을 세부적으로 관리합니다. 페이지 이동은 좌측 사이드바에서만 사용합니다.</p>
        </div>
      </div>

      <KakaoOperationSettingsClient initialSettings={settings} />

      <section className="admin-card" style={{ marginTop: 24 }}>
        <div className="admin-section-head">
          <div>
            <h2>구인 자동화 설정</h2>
            <p className="admin-muted">카카오톡 구인 번호 초기화와 활동 없음 자동마감 설정입니다.</p>
          </div>
        </div>
        <div className="card-grid">
          <AdminRecruitAutoResetSettings initialEnabled={autoResetSettings.enabled} initialIdleHours={autoResetSettings.idleHours} />
          <AdminRecruitAutoFinishSettings initialEnabled={idleFinishSettings.enabled} initialIdleHours={idleFinishSettings.idleHours} />
        </div>
      </section>

      <section className="admin-card" style={{ marginTop: 24 }}>
        <div className="admin-section-head">
          <div>
            <h2>수동 초기화</h2>
            <p className="admin-muted">필요할 때만 사용합니다. 진행 중 구인글에 영향을 줄 수 있습니다.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <AdminRecruitNumberResetButton />
          <AdminRecruitResetAllButton />
        </div>
      </section>
    </main>
  );
}
