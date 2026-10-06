import Link from "next/link";
import { CloudSun } from "@/components/theme/theme-icons";
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
          <h1 id="admin-login-title">관리자 로그인</h1>
        </div>
        <AdminLoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
