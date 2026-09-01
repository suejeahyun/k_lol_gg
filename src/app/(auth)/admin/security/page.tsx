import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { requireAdminEnrollmentPage } from "@/modules/auth/infrastructure/server-authorization";
import styles from "./security.module.css";

export const metadata: Metadata = {
  title: "관리자 2단계 인증",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminSecurityPage() {
  const session = await requireAdminEnrollmentPage("/admin/security");

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="security-title">
        <div className={styles.icon}>{session.adminTotpVerified
          ? <ShieldCheck aria-hidden="true" />
          : <KeyRound aria-hidden="true" />}</div>
        <span className={styles.eyebrow}>관리자 보안</span>
        <h1 id="security-title">{session.adminTotpVerified ? "2단계 인증이 확인됐어요." : "인증 앱 등록이 필요해요."}</h1>
        <p>
          {session.adminTotpVerified
            ? "현재 세션은 비밀번호와 TOTP 검증을 모두 통과했습니다."
            : "QR 생성·등록·재로그인 흐름은 S01 인증 저장소와 함께 다음 구현 단위에서 완성합니다."}
        </p>
        {session.adminTotpVerified
          ? <Link href="/admin">관리자 대시보드 열기</Link>
          : <span className={styles.pending}>등록 기능 구현 대기 — 보호 경로는 계속 잠겨 있습니다.</span>}
      </section>
    </main>
  );
}
