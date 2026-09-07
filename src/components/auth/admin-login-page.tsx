import Link from "next/link";
import { CloudSun, ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "./admin-login-form";
import styles from "./admin-login-page.module.css";

export function AdminLoginPage({ nextPath }: { nextPath: string }) {
  return (
    <main className={styles.page} data-safe-next-path={nextPath}>
      <section className={styles.card} aria-labelledby="admin-login-title">
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}><CloudSun aria-hidden="true" /></span>
          <span>K-LOL.GG</span>
        </Link>
        <div className={styles.heading}>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 보호된 운영 공간</span>
          <h1 id="admin-login-title">관리자 로그인</h1>
          <p>비밀번호와 인증 앱 코드를 모두 확인한 뒤 관리자 화면을 엽니다.</p>
        </div>
        <AdminLoginForm nextPath={nextPath} />
        <p className={styles.notice}>
          공용 기기에서는 사용 후 반드시 로그아웃해 주세요.
        </p>
      </section>
    </main>
  );
}
