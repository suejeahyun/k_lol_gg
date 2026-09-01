import Link from "next/link";

import { SiteShell } from "@/components/site-shell";
import { StatusPanel } from "@/components/status-panel";

export default function NotFound() {
  return (
    <SiteShell>
      <div className="page-wrap status-page">
        <StatusPanel
          eyebrow="404 · NOT FOUND"
          title="찾으시는 페이지가 없어요"
          description="주소가 바뀌었거나 아직 V2에 만들어지지 않은 기능일 수 있습니다."
        >
          <Link className="status-panel__link" href="/">
            홈으로 돌아가기
          </Link>
          <Link className="status-panel__link status-panel__link--secondary" href="/players">
            플레이어 찾기
          </Link>
        </StatusPanel>
      </div>
    </SiteShell>
  );
}
