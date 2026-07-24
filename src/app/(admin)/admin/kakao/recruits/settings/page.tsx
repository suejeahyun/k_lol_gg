export const dynamic = "force-dynamic";
export const revalidate = 0;

import KakaoRecruitHealthPanel from "./KakaoRecruitHealthPanel";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";

export default async function AdminKakaoRecruitSettingsPage() {
  const admin = await requireAdminRequest();

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">KAKAO RECRUIT SETTINGS</p>
          <h1>카카오 구인 설정</h1>
          <p className="admin-muted">
            파티는 모집번호+ㅉ으로만 종료하며 자동 종료와 번호 초기화는 사용하지 않습니다.
          </p>
        </div>
        <a className="admin-button admin-button--ghost" href="/admin/kakao/recruits">
          구인 관리
        </a>
      </div>
      <KakaoRecruitHealthPanel canRepair={admin?.user.role === "SUPER_ADMIN"} />
    </main>
  );
}
