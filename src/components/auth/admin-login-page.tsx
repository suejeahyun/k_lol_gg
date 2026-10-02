import Link from "next/link";
import { CloudSun, ShieldCheck } from "@/components/theme/theme-icons";
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
          <p>관리자 아이디와 비밀번호로 로그인해 주세요.</p>
        </div>
        <AdminLoginForm nextPath={nextPath} />
        <p className={styles.notice}>
          공용 기기에서는 사용 후 반드시 로그아웃해 주세요.
        </p>
      </section>
    </main>
  );
}
