export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import PasswordChangeForm from "@/components/PasswordChangeForm";

export default async function AccountPasswordPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/account/password");

  return (
    <main className="user-page account-page account-edit-page account-page--compact">
      <div className="user-page__header account-page__header">
        <div>
          <p className="account-page__kicker">SECURITY</p>
          <h1 className="user-page__title">비밀번호 변경</h1>
          <p className="user-page__description">현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다. 변경 완료 후 다시 로그인해야 합니다.</p>
        </div>
        <Link className="admin-button secondary" href="/account">
          내정보로 돌아가기
        </Link>
      </div>

      <section className="admin-card account-card account-edit-card">
        <PasswordChangeForm variant="embedded" />
      </section>
    </main>
  );
}
