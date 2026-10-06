import Link from "next/link";

import { StatusPanel } from "@/components/status-panel";

export function NotFoundContent({ children }: { children?: React.ReactNode }) {
  return (
    <div className="page-wrap status-page">
      <StatusPanel
        eyebrow="404"
        title="찾으시는 페이지가 없어요"
      >
        {children ?? <>
          <Link className="status-panel__link" href="/">홈으로 돌아가기</Link>
          <Link className="status-panel__link status-panel__link--secondary" href="/players">플레이어 찾기</Link>
        </>}
      </StatusPanel>
    </div>
  );
}
