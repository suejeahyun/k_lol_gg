import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { AdminTotpSecurityPanel } from "@/components/auth/admin-totp-security-panel";
import { getAdminTotpStatus } from "@/modules/auth/infrastructure/admin-totp-lifecycle";
import { requireAdminEnrollmentPage } from "@/modules/auth/infrastructure/server-authorization";
import styles from "./security.module.css";

export const metadata: Metadata = {
  title: "관리자 2단계 인증",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminSecurityPage() {
  const session = await requireAdminEnrollmentPage("/admin/security");
  const statusResult = await getAdminTotpStatus(session);
  const initialStatus = statusResult.ok ? statusResult.status : "UNAVAILABLE";

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="security-title">
        <div className={styles.icon}>{session.adminTotpVerified
          ? <ShieldCheck aria-hidden="true" />
          : <KeyRound aria-hidden="true" />}</div>
        <span className={styles.eyebrow}>관리자 보안</span>
        <h1 id="security-title">관리자 2단계 인증</h1>
        <p>
          등록·활성화·해제는 현재 계정에만 적용됩니다. 활성화나 해제 후에는 모든 세션이 종료되어 다시 로그인해야 합니다.
        </p>
        <AdminTotpSecurityPanel initialStatus={initialStatus} />
        <Link href={session.adminTotpVerified ? "/admin" : "/admin/login"}>
          {session.adminTotpVerified ? "관리자 대시보드 열기" : "로그인 화면으로 돌아가기"}
        </Link>
      </section>
    </main>
  );
}
