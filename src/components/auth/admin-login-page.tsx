import Link from "next/link";
import { CloudSun, ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "./admin-login-form";
import styles from "./admin-login-page.module.css";

export function normalizeInternalNext(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "/admin";
  return candidate;
}

export function AdminLoginPage({ nextPath }: { nextPath: string }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="admin-login-title">
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}><CloudSun aria-hidden="true" /></span>
          <span>K-LOL.GG <strong>V2</strong></span>
        </Link>
        <div className={styles.heading}>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 보호된 운영 공간</span>
          <h1 id="admin-login-title">관리자 로그인</h1>
          <p>비밀번호와 인증 앱 코드를 모두 확인한 뒤 관리자 화면을 엽니다.</p>
        </div>
        <AdminLoginForm nextPath={nextPath} />
        <p className={styles.notice}>
          로그인 문제는 보안을 해제하지 않고 테스트 전용 합성 계정으로 검수합니다.
        </p>
      </section>
    </main>
  );
}
