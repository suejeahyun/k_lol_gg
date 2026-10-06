import Link from "next/link";
import { ShieldX } from "@/components/theme/theme-icons";

export default function ForbiddenPage() {
  return (
    <div className="page-shell">
      <section className="empty-state" aria-labelledby="forbidden-title">
        <ShieldX aria-hidden="true" />
        <h1 id="forbidden-title">이 공간을 열 권한이 없어요.</h1>
        <Link className="button" href="/account">내 계정 상태</Link>
        <Link className="button button--primary" href="/">홈으로 돌아가기</Link>
      </section>
    </div>
  );
}
