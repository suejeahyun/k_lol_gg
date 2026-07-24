export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getKakaoOperationSettings } from "@/lib/kakao/settings";
import KakaoOperationSettingsClient from "./KakaoOperationSettingsClient";

export default async function AdminKakaoSettingsPage() {
  const settings = await getKakaoOperationSettings();

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
    </main>
  );
}
