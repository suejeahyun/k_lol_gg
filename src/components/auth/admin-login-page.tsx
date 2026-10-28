import { SERVICE_BRAND } from "@/lib/service-brand";
import Link from "next/link";
import { CloudSun, Share2 as Network } from "@/components/theme/theme-icons";
import { AdminLoginForm } from "./admin-login-form";
import styles from "./admin-login-page.module.css";

export function AdminLoginPage({ nextPath }: { nextPath: string }) {
  return (
    <main className={styles.page} data-safe-next-path={nextPath}>
      <section className={styles.card} aria-labelledby="admin-login-title">
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>{SERVICE_BRAND.id === "hub" ? <Network aria-hidden="true" /> : <CloudSun aria-hidden="true" />}</span>
          <span>{SERVICE_BRAND.name}</span>
        </Link>
        <div className={styles.heading}>
          <h1 id="admin-login-title">관리자 로그인</h1>
          {SERVICE_BRAND.id === "hub" ? <p>여러 사이트와 방을 관리하는 중앙 운영자 공간입니다.</p> : null}
        </div>
        <AdminLoginForm nextPath={nextPath} />
        {SERVICE_BRAND.id === "hub" ? <p className={styles.notice}>처음 받은 임시 비밀번호는 <Link href="/login?next=%2Faccount%2Fpassword">초기 계정 설정</Link>에서 변경한 뒤 관리자 로그인을 진행하세요.</p> : null}
      </section>
    </main>
  );
}
