import Link from "next/link";
import { ShieldX } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <main className="page-shell">
      <section className="empty-state" aria-labelledby="forbidden-title">
        <ShieldX aria-hidden="true" />
        <h1 id="forbidden-title">이 공간을 열 권한이 없어요.</h1>
        <p>계정 역할을 확인하거나 관리자에게 권한을 요청해 주세요.</p>
        <Link className="button button--primary" href="/">홈으로 돌아가기</Link>
      </section>
    </main>
  );
}
