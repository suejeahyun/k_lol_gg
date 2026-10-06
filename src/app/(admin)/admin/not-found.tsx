import Link from "next/link";

import { NotFoundContent } from "@/components/not-found-content";

export default function NotFound() {
  return (
    <main>
      <NotFoundContent>
        <Link className="status-panel__link" href="/admin">관리 홈으로 돌아가기</Link>
        <Link className="status-panel__link status-panel__link--secondary" href="/admin/search">관리자 검색</Link>
      </NotFoundContent>
    </main>
  );
}
